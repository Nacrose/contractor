/// Dart mount of the M03-T06 attachment reconciliation journal.
///
/// The state machine mirrors `packages/native_attachment/src/transfer.ts`.
/// This is a device binding, not a replacement for that package's semantic
/// authority. Server registration is supplied by the host and remains async.
library;

import 'dart:convert';
import 'dart:typed_data';

import 'mount.dart';
import 'ports.dart';
import '../workflows/daily_report_workflow.dart';

const Migration
kAttachmentJournalMigration = Migration(5, 'attachment_journal_baseline', [
  'CREATE TABLE attachment ('
      ' id TEXT NOT NULL,'
      ' account_id TEXT NOT NULL,'
      ' project_id TEXT,'
      ' source_path TEXT NOT NULL,'
      ' object_key TEXT,'
      ' digest TEXT,'
      ' bytes INTEGER,'
      " state TEXT NOT NULL DEFAULT 'staging' CHECK (state IN ('staging','staged','finalized','registered','failed')) ,"
      " failure_kind TEXT CHECK (failure_kind IN ('retryable','rejection','revoked','storage','digest_mismatch','source_missing','internal')) ,"
      " failure_step TEXT CHECK (failure_step IN ('stage','finalize','register')) ,"
      ' failure_detail TEXT,'
      ' attempts INTEGER NOT NULL DEFAULT 0,'
      ' next_attempt_at_ms INTEGER,'
      ' receipt TEXT,'
      ' created_at INTEGER NOT NULL,'
      ' updated_at INTEGER NOT NULL,'
      ' PRIMARY KEY (id, account_id)'
      ')',
  'CREATE INDEX idx_attachment_account_state ON attachment (account_id, state)',
  "CREATE TABLE attachment_event (ord INTEGER PRIMARY KEY AUTOINCREMENT, attachment_id TEXT NOT NULL, account_id TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('stage_started','staged_verified','finalized','upload_opened','chunk_ack','registered','failed','recovered')), detail TEXT, at_ms INTEGER NOT NULL)",
  'CREATE INDEX idx_attachment_event_lookup ON attachment_event (account_id, attachment_id, ord)',
]);

const List<Migration> kM04WorkflowMigrations = [
  kDailyReportLocalMigration,
  kAttachmentJournalMigration,
  Migration(6, 'attachment_report_link', [
    'ALTER TABLE attachment ADD COLUMN daily_report_id TEXT',
    'CREATE INDEX idx_attachment_report ON attachment (account_id, daily_report_id, state)',
  ]),
];

const String _objectPrefix = 'attachments/';
const String _tempSuffix = '.part';
String attachmentTempKey(String id) => '$_objectPrefix$id$_tempSuffix';
String attachmentFinalKey(String id) => '$_objectPrefix$id';

enum AttachmentTransferState { staging, staged, finalized, registered, failed }

enum AttachmentFailureKind {
  retryable,
  rejection,
  revoked,
  storage,
  digestMismatch,
  sourceMissing,
  internal,
}

enum AttachmentTransferStep { stage, finalize, register }

class AttachmentTransferRecord {
  final String id;
  final String accountId;
  final String? projectId;
  final String? dailyReportId;
  final String sourcePath;
  final String? objectKey;
  final String? digest;
  final int? bytes;
  final AttachmentTransferState state;
  final AttachmentFailureKind? failureKind;
  final AttachmentTransferStep? failureStep;
  final String? failureDetail;
  final int attempts;
  final int? nextAttemptAtMs;
  final String? receipt;
  final int createdAtMs;
  final int updatedAtMs;

  const AttachmentTransferRecord({
    required this.id,
    required this.accountId,
    required this.projectId,
    required this.dailyReportId,
    required this.sourcePath,
    required this.objectKey,
    required this.digest,
    required this.bytes,
    required this.state,
    required this.failureKind,
    required this.failureStep,
    required this.failureDetail,
    required this.attempts,
    required this.nextAttemptAtMs,
    required this.receipt,
    required this.createdAtMs,
    required this.updatedAtMs,
  });

  bool get complete =>
      state == AttachmentTransferState.registered && receipt != null;
}

class AttachmentResumeSummary {
  final List<String> completed;
  final List<String> stillPending;
  final List<({String id, AttachmentFailureKind kind, String detail})> failed;

  const AttachmentResumeSummary({
    required this.completed,
    required this.stillPending,
    required this.failed,
  });
}

abstract interface class AttachmentRegistrarPort {
  Future<String> openUpload({
    required String attachmentId,
    required String accountId,
    required String? projectId,
    required String? dailyReportId,
    required String digest,
    required int bytes,
  });

  Future<int> queryUpload(String uploadId);

  Future<int> putChunk(String uploadId, int offset, Uint8List chunk);

  Future<String> completeUpload(String uploadId, String digest, int bytes);
}

/// Fetches a previously registered object. The server implementation must
/// authorize the receipt against the supplied tenant/project/role on every
/// request. The product adapter must define the concrete route before wiring it.
abstract interface class RegisteredAttachmentFetchPort {
  Future<Uint8List> fetchRegistered({
    required String receipt,
    required String objectId,
    required ScopeClaims scope,
  });
}

class AttachmentRegistrarError implements Exception {
  final AttachmentFailureKind kind;
  final String message;

  const AttachmentRegistrarError(this.kind, this.message);

  @override
  String toString() => 'AttachmentRegistrarError($kind): $message';
}

class AttachmentTransferManager {
  final ConstructionMount mount;
  final AttachmentRegistrarPort registrar;
  final ObjectStore _objects;
  final DigestPort _digest;
  final SourceReaderPort _sourceReader;
  final int Function() nowMs;
  final int maxRetries;
  final int backoffBaseMs;
  final int backoffCapMs;
  final int chunkBytes;

  AttachmentTransferManager({
    required this.mount,
    required this.registrar,
    ObjectStore? objects,
    DigestPort? digest,
    SourceReaderPort? sourceReader,
    int Function()? nowMs,
    this.maxRetries = 5,
    this.backoffBaseMs = 1000,
    this.backoffCapMs = 60000,
    this.chunkBytes = 65536,
  }) : _objects = objects ?? mount.objects,
       _digest = digest ?? mount.digest,
       _sourceReader = sourceReader ?? mount.sourceReader,
       nowMs = nowMs ?? (() => DateTime.now().millisecondsSinceEpoch) {
    if (_digest.algorithm != 'sha-256') {
      throw RepositoryError(
        'misconfigured',
        'Attachment transfers require a real SHA-256 digest port.',
      );
    }
    if (maxRetries < 1 ||
        backoffBaseMs < 0 ||
        backoffCapMs < 0 ||
        chunkBytes < 1) {
      throw ArgumentError('Invalid attachment retry or chunk policy.');
    }
  }

  AttachmentTransferRecord? get(String accountId, String id) {
    final row = mount.driver
        .prepare('SELECT * FROM attachment WHERE id = ? AND account_id = ?')
        .get([id, accountId]);
    return row == null ? null : _record(row);
  }

  List<AttachmentTransferRecord> list(String accountId) => mount.driver
      .prepare(
        'SELECT * FROM attachment WHERE account_id = ? ORDER BY created_at, id',
      )
      .all([accountId])
      .map(_record)
      .toList(growable: false);

  List<Map<String, Object?>> events(String accountId, String id) => mount.driver
      .prepare(
        'SELECT ord, kind, detail, at_ms FROM attachment_event WHERE account_id = ? AND attachment_id = ? ORDER BY ord',
      )
      .all([accountId, id]);

  AttachmentTransferRecord stageBytes({
    required String accountId,
    required String id,
    required String? projectId,
    String? dailyReportId,
    required String sourcePath,
    required Uint8List bytes,
  }) {
    if (id.isEmpty || sourcePath.isEmpty || bytes.isEmpty) {
      throw RepositoryError(
        'misconfigured',
        'Attachment id, durable source path, and photo bytes are required.',
      );
    }
    final current = get(accountId, id);
    if (current?.state == AttachmentTransferState.registered) {
      throw RepositoryError(
        'illegal_transition',
        'A registered attachment cannot be staged again.',
      );
    }
    final digest = _digest.digest(bytes);
    final now = nowMs();
    mount.outbox.withImmediateTransaction(() {
      if (current == null) {
        mount.driver
            .prepare(
              'INSERT INTO attachment '
              '(id, account_id, project_id, daily_report_id, source_path, state, created_at, updated_at) '
              "VALUES (?, ?, ?, ?, ?, 'staging', ?, ?)",
            )
            .run([
              id,
              accountId,
              projectId,
              dailyReportId,
              sourcePath,
              now,
              now,
            ]);
        mount.outbox.stageAttachment(
          accountId,
          attachmentId: id,
          projectId: projectId,
          localPath: sourcePath,
          digest: digest,
          bytes: bytes.length,
        );
      } else {
        mount.driver
            .prepare(
              "UPDATE attachment SET project_id=?, daily_report_id=?, source_path=?, object_key=NULL, digest=NULL, bytes=NULL, state='staging', failure_kind=NULL, failure_step=NULL, failure_detail=NULL, next_attempt_at_ms=NULL, updated_at=? WHERE id=? AND account_id=?",
            )
            .run([projectId, dailyReportId, sourcePath, now, id, accountId]);
        mount.driver
            .prepare(
              "UPDATE attachment_stage SET project_id=?, local_path=?, digest=?, bytes=?, state='staging', updated_at=? WHERE id=? AND account_id=?",
            )
            .run([
              projectId,
              sourcePath,
              digest,
              bytes.length,
              now,
              id,
              accountId,
            ]);
      }
      _event(accountId, id, 'stage_started', {'bytes': bytes.length});
    });

    try {
      _objects.putBytes(attachmentTempKey(id), bytes);
      final stored = _objects.getBytes(attachmentTempKey(id));
      final observed = _digest.digest(stored);
      if (observed != digest) {
        return _fail(
          accountId,
          id,
          AttachmentTransferStep.stage,
          AttachmentFailureKind.digestMismatch,
          'Stored photo bytes do not match the input digest.',
        );
      }
      mount.outbox.withImmediateTransaction(() {
        _setState(accountId, id, AttachmentTransferState.staged, {
          'object_key': attachmentFinalKey(id),
          'digest': digest,
          'bytes': bytes.length,
        });
        mount.outbox.transitionAttachment(accountId, id, 'staged');
        _event(accountId, id, 'staged_verified', {
          'digest': digest,
          'bytes': bytes.length,
        });
      });
      return get(accountId, id)!;
    } on ObjectStoreError catch (error) {
      return _fail(
        accountId,
        id,
        AttachmentTransferStep.stage,
        error.kind == 'full'
            ? AttachmentFailureKind.storage
            : AttachmentFailureKind.internal,
        error.message,
      );
    } catch (_) {
      return _fail(
        accountId,
        id,
        AttachmentTransferStep.stage,
        AttachmentFailureKind.internal,
        'Photo staging failed. The local source and journal were retained.',
      );
    }
  }

  AttachmentTransferRecord finalize(String accountId, String id) {
    final current = get(accountId, id);
    if (current == null) {
      throw RepositoryError(
        'not_found',
        'Attachment not found for this account.',
      );
    }
    if (current.state != AttachmentTransferState.staged) {
      throw RepositoryError(
        'illegal_transition',
        'Only a staged attachment can be finalized.',
      );
    }
    try {
      _objects.renameBytes(attachmentTempKey(id), attachmentFinalKey(id));
      final finalBytes = _objects.getBytes(attachmentFinalKey(id));
      final digest = _digest.digest(finalBytes);
      if (digest != current.digest) {
        return _fail(
          accountId,
          id,
          AttachmentTransferStep.finalize,
          AttachmentFailureKind.digestMismatch,
          'Final photo bytes failed digest verification.',
        );
      }
      mount.outbox.withImmediateTransaction(() {
        _setState(accountId, id, AttachmentTransferState.finalized, {});
        mount.outbox.transitionAttachment(accountId, id, 'finalized');
        _event(accountId, id, 'finalized', {
          'digest': digest,
          'bytes': finalBytes.length,
        });
      });
      return get(accountId, id)!;
    } on ObjectStoreError catch (error) {
      return _fail(
        accountId,
        id,
        AttachmentTransferStep.finalize,
        error.kind == 'full'
            ? AttachmentFailureKind.storage
            : AttachmentFailureKind.internal,
        error.message,
      );
    }
  }

  Future<AttachmentTransferRecord> register(String accountId, String id) async {
    final current = get(accountId, id);
    if (current == null) {
      throw RepositoryError(
        'not_found',
        'Attachment not found for this account.',
      );
    }
    if (current.state != AttachmentTransferState.finalized ||
        current.digest == null ||
        current.bytes == null ||
        current.objectKey == null) {
      throw RepositoryError(
        'illegal_transition',
        'Only a verified finalized photo can be registered.',
      );
    }
    try {
      final uploadId = await registrar.openUpload(
        attachmentId: id,
        accountId: accountId,
        projectId: current.projectId,
        dailyReportId: current.dailyReportId,
        digest: current.digest!,
        bytes: current.bytes!,
      );
      _event(accountId, id, 'upload_opened', {'uploadId': uploadId});
      var offset = await registrar.queryUpload(uploadId);
      final bytes = _objects.getBytes(current.objectKey!);
      while (offset < current.bytes!) {
        final end = (offset + chunkBytes).clamp(0, current.bytes!);
        final chunk = Uint8List.sublistView(bytes, offset, end);
        offset = await registrar.putChunk(uploadId, offset, chunk);
        _event(accountId, id, 'chunk_ack', {
          'offset': offset,
          'chunkBytes': chunk.length,
        });
      }
      final receipt = await registrar.completeUpload(
        uploadId,
        current.digest!,
        current.bytes!,
      );
      if (receipt.isEmpty) {
        throw const AttachmentRegistrarError(
          AttachmentFailureKind.retryable,
          'Missing server receipt.',
        );
      }
      mount.outbox.withImmediateTransaction(() {
        _setState(accountId, id, AttachmentTransferState.registered, {
          'receipt': receipt,
          'failure_kind': null,
          'failure_step': null,
          'failure_detail': null,
          'next_attempt_at_ms': null,
        });
        mount.outbox.transitionAttachment(accountId, id, 'registered');
        _event(accountId, id, 'registered', {
          'receipt': receipt,
          'bytes': current.bytes,
        });
      });
      return get(accountId, id)!;
    } on AttachmentRegistrarError catch (error) {
      return _fail(
        accountId,
        id,
        AttachmentTransferStep.register,
        error.kind,
        error.message,
      );
    } on ObjectStoreError catch (error) {
      return _fail(
        accountId,
        id,
        AttachmentTransferStep.register,
        error.kind == 'full'
            ? AttachmentFailureKind.storage
            : AttachmentFailureKind.internal,
        error.message,
      );
    } catch (_) {
      return _fail(
        accountId,
        id,
        AttachmentTransferStep.register,
        AttachmentFailureKind.retryable,
        'Photo upload interrupted; it can resume from the server offset.',
      );
    }
  }

  /// Restore a registered object onto a new device. Bytes pass through the
  /// same durable stage/finalize journal and SHA-256 checks as a new capture;
  /// the existing server receipt is retained, so restore never re-uploads.
  Future<AttachmentTransferRecord> restoreRegistered({
    required String accountId,
    required String attachmentId,
    required String projectId,
    required String dailyReportId,
    required String objectId,
    required String receipt,
    required String expectedDigest,
    required String sourcePath,
    required ScopeClaims scope,
    required RegisteredAttachmentFetchPort fetcher,
  }) async {
    if (scope.projectId != projectId ||
        dailyReportId.isEmpty ||
        receipt.isEmpty ||
        objectId.isEmpty) {
      throw RepositoryError(
        'misconfigured',
        'Restore requires a report id, receipt, and object id scoped to the requested project.',
      );
    }
    Uint8List bytes;
    try {
      bytes = await fetcher.fetchRegistered(
        receipt: receipt,
        objectId: objectId,
        scope: scope,
      );
    } on AttachmentRegistrarError catch (error) {
      return _recordRestoreFailure(
        accountId,
        attachmentId,
        projectId,
        dailyReportId,
        sourcePath,
        error.kind,
        error.message,
      );
    } catch (_) {
      return _recordRestoreFailure(
        accountId,
        attachmentId,
        projectId,
        dailyReportId,
        sourcePath,
        AttachmentFailureKind.retryable,
        'Photo download failed; it can be fetched again.',
      );
    }
    if (_digest.digest(bytes) != expectedDigest) {
      return _recordRestoreFailure(
        accountId,
        attachmentId,
        projectId,
        dailyReportId,
        sourcePath,
        AttachmentFailureKind.digestMismatch,
        'Downloaded photo does not match the registered SHA-256 digest.',
      );
    }
    var restored = stageBytes(
      accountId: accountId,
      id: attachmentId,
      projectId: projectId,
      dailyReportId: dailyReportId,
      sourcePath: sourcePath,
      bytes: bytes,
    );
    if (restored.state == AttachmentTransferState.failed) return restored;
    restored = finalize(accountId, attachmentId);
    if (restored.state == AttachmentTransferState.failed) return restored;
    mount.outbox.withImmediateTransaction(() {
      _setState(accountId, attachmentId, AttachmentTransferState.registered, {
        'receipt': receipt,
        'failure_kind': null,
        'failure_step': null,
        'failure_detail': null,
      });
      mount.outbox.transitionAttachment(accountId, attachmentId, 'registered');
      _event(accountId, attachmentId, 'registered', {
        'receipt': receipt,
        'restored': true,
        'digest': expectedDigest,
      });
    });
    return get(accountId, attachmentId)!;
  }

  AttachmentTransferRecord _recordRestoreFailure(
    String accountId,
    String id,
    String projectId,
    String dailyReportId,
    String sourcePath,
    AttachmentFailureKind kind,
    String detail,
  ) {
    var current = get(accountId, id);
    if (current == null) {
      mount.outbox.withImmediateTransaction(() {
        final now = nowMs();
        mount.driver
            .prepare(
              'INSERT INTO attachment (id, account_id, project_id, daily_report_id, source_path, state, failure_kind, failure_step, failure_detail, created_at, updated_at) '
              "VALUES (?, ?, ?, ?, ?, 'failed', ?, 'stage', ?, ?, ?)",
            )
            .run([
              id,
              accountId,
              projectId,
              dailyReportId,
              sourcePath,
              _failureWire(kind),
              detail,
              now,
              now,
            ]);
        mount.outbox.stageAttachment(
          accountId,
          attachmentId: id,
          projectId: projectId,
          localPath: sourcePath,
          digest: '',
          bytes: 0,
        );
        mount.outbox.transitionAttachment(accountId, id, 'failed');
        _event(accountId, id, 'failed', {
          'step': 'download',
          'kind': _failureWire(kind),
        });
      });
      current = get(accountId, id);
    }
    return current!;
  }

  Future<AttachmentTransferRecord> resume(
    String accountId,
    String id, {
    bool force = false,
  }) async {
    var current = get(accountId, id);
    if (current == null) {
      throw RepositoryError(
        'not_found',
        'Attachment not found for this account.',
      );
    }
    if (current.state == AttachmentTransferState.registered) return current;
    if (current.state == AttachmentTransferState.failed) {
      if (!force &&
          (current.failureKind != AttachmentFailureKind.retryable ||
              current.nextAttemptAtMs == null ||
              nowMs() < current.nextAttemptAtMs!)) {
        return current;
      }
      final next =
          current.failureKind == AttachmentFailureKind.digestMismatch ||
              current.failureStep == AttachmentTransferStep.stage
          ? AttachmentTransferState.staging
          : current.failureStep == AttachmentTransferStep.finalize
          ? AttachmentTransferState.staged
          : AttachmentTransferState.finalized;
      mount.outbox.withImmediateTransaction(() {
        _setState(accountId, id, next, {
          'failure_kind': null,
          'failure_step': null,
          'failure_detail': null,
          'next_attempt_at_ms': null,
        });
        mount.driver
            .prepare(
              'UPDATE attachment_stage SET state=?, updated_at=? WHERE id=? AND account_id=?',
            )
            .run([next.name, nowMs(), id, accountId]);
        _event(accountId, id, 'recovered', {
          'step': current!.failureStep?.name,
          'to': next.name,
        });
      });
    }
    for (var hop = 0; hop < 4; hop++) {
      current = get(accountId, id)!;
      switch (current.state) {
        case AttachmentTransferState.registered:
        case AttachmentTransferState.failed:
          return current;
        case AttachmentTransferState.staging:
          Uint8List source;
          try {
            source = _sourceReader.readBytes(current.sourcePath);
          } on ObjectStoreError catch (error) {
            return _fail(
              accountId,
              id,
              AttachmentTransferStep.stage,
              AttachmentFailureKind.sourceMissing,
              error.message,
            );
          }
          stageBytes(
            accountId: accountId,
            id: id,
            projectId: current.projectId,
            dailyReportId: current.dailyReportId,
            sourcePath: current.sourcePath,
            bytes: source,
          );
        case AttachmentTransferState.staged:
          finalize(accountId, id);
        case AttachmentTransferState.finalized:
          return register(accountId, id);
      }
    }
    return get(accountId, id)!;
  }

  Future<AttachmentTransferRecord> retry(String accountId, String id) =>
      resume(accountId, id, force: true);

  Future<AttachmentResumeSummary> resumeAll(String accountId) async {
    final completed = <String>[];
    final stillPending = <String>[];
    final failed = <({String id, AttachmentFailureKind kind, String detail})>[];
    for (final initial in list(accountId)) {
      if (initial.state == AttachmentTransferState.registered) continue;
      if (initial.state == AttachmentTransferState.failed &&
          initial.failureKind == AttachmentFailureKind.retryable &&
          initial.nextAttemptAtMs != null &&
          nowMs() < initial.nextAttemptAtMs!) {
        stillPending.add(initial.id);
        continue;
      }
      try {
        final record = await resume(accountId, initial.id);
        if (record.complete) {
          completed.add(record.id);
        } else if (record.state == AttachmentTransferState.failed) {
          failed.add((
            id: record.id,
            kind: record.failureKind ?? AttachmentFailureKind.internal,
            detail: record.failureDetail ?? 'Photo transfer failed.',
          ));
        } else {
          stillPending.add(record.id);
        }
      } catch (_) {
        failed.add((
          id: initial.id,
          kind: AttachmentFailureKind.internal,
          detail: 'Photo recovery failed; the local journal was retained.',
        ));
      }
    }
    return AttachmentResumeSummary(
      completed: List.unmodifiable(completed),
      stillPending: List.unmodifiable(stillPending),
      failed: List.unmodifiable(failed),
    );
  }

  bool isComplete(String accountId, String id) =>
      get(accountId, id)?.complete ?? false;

  AttachmentTransferRecord _fail(
    String accountId,
    String id,
    AttachmentTransferStep step,
    AttachmentFailureKind kind,
    String detail,
  ) {
    final current = get(accountId, id);
    if (current == null) {
      throw RepositoryError(
        'not_found',
        'Attachment not found for this account.',
      );
    }
    final attempts =
        step == AttachmentTransferStep.register &&
            kind == AttachmentFailureKind.retryable
        ? current.attempts + 1
        : current.attempts;
    final nextAt =
        kind == AttachmentFailureKind.retryable && attempts < maxRetries
        ? nowMs() + (backoffBaseMs * (1 << attempts)).clamp(0, backoffCapMs)
        : null;
    mount.outbox.withImmediateTransaction(() {
      _setState(accountId, id, AttachmentTransferState.failed, {
        'failure_kind': _failureWire(kind),
        'failure_step': step.name,
        'failure_detail': detail,
        'attempts': attempts,
        'next_attempt_at_ms': nextAt,
      });
      mount.driver
          .prepare(
            'UPDATE attachment_stage SET state="failed", updated_at=? WHERE id=? AND account_id=?',
          )
          .run([nowMs(), id, accountId]);
      _event(accountId, id, 'failed', {
        'step': step.name,
        'kind': _failureWire(kind),
        'detail': detail,
        'attempts': attempts,
      });
    });
    return get(accountId, id)!;
  }

  void _setState(
    String accountId,
    String id,
    AttachmentTransferState state,
    Map<String, Object?> values,
  ) {
    final assignments = <String>['state=?', 'updated_at=?'];
    final params = <Object?>[state.name, nowMs()];
    for (final entry in values.entries) {
      assignments.add('${entry.key}=?');
      params.add(entry.value);
    }
    params.addAll([id, accountId]);
    mount.driver
        .prepare(
          'UPDATE attachment SET ${assignments.join(', ')} WHERE id=? AND account_id=?',
        )
        .run(params);
  }

  void _event(
    String accountId,
    String id,
    String kind,
    Map<String, Object?> detail,
  ) {
    mount.driver
        .prepare(
          'INSERT INTO attachment_event (attachment_id, account_id, kind, detail, at_ms) VALUES (?, ?, ?, ?, ?)',
        )
        .run([id, accountId, kind, jsonEncode(detail), nowMs()]);
  }

  AttachmentTransferRecord _record(Map<String, Object?> row) =>
      AttachmentTransferRecord(
        id: '${row['id']}',
        accountId: '${row['account_id']}',
        projectId: row['project_id'] as String?,
        dailyReportId: row['daily_report_id'] as String?,
        sourcePath: '${row['source_path']}',
        objectKey: row['object_key'] as String?,
        digest: row['digest'] as String?,
        bytes: row['bytes'] as int?,
        state: AttachmentTransferState.values.byName('${row['state']}'),
        failureKind: _failureFromWire(row['failure_kind'] as String?),
        failureStep: row['failure_step'] == null
            ? null
            : AttachmentTransferStep.values.byName('${row['failure_step']}'),
        failureDetail: row['failure_detail'] as String?,
        attempts: row['attempts'] as int,
        nextAttemptAtMs: row['next_attempt_at_ms'] as int?,
        receipt: row['receipt'] as String?,
        createdAtMs: row['created_at'] as int,
        updatedAtMs: row['updated_at'] as int,
      );
}

String _failureWire(AttachmentFailureKind kind) => switch (kind) {
  AttachmentFailureKind.digestMismatch => 'digest_mismatch',
  AttachmentFailureKind.sourceMissing => 'source_missing',
  _ => kind.name,
};

AttachmentFailureKind? _failureFromWire(String? kind) => switch (kind) {
  null => null,
  'digest_mismatch' => AttachmentFailureKind.digestMismatch,
  'source_missing' => AttachmentFailureKind.sourceMissing,
  'retryable' => AttachmentFailureKind.retryable,
  'rejection' => AttachmentFailureKind.rejection,
  'revoked' => AttachmentFailureKind.revoked,
  'storage' => AttachmentFailureKind.storage,
  _ => AttachmentFailureKind.internal,
};
