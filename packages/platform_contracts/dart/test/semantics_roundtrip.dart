import 'dart:convert';
import 'dart:io';

import '../lib/generated/contractor/platform/contracts/v1/semantics.pb.dart';
import '../lib/generated/contractor/platform/contracts/v1/save_sync.pb.dart';

Never fail(String message) => throw StateError(message);

void expectEqual(Object? actual, Object? expected, String context) {
  if (actual != expected) fail('$context: expected $expected, got $actual');
}

BigInt parseScaledInteger(String input, int scale) {
  final match = RegExp(r'^([+-]?)(\d+)(?:\.(\d+))?$').firstMatch(input);
  if (match == null) throw FormatException('invalid decimal', input);
  final sign = match.group(1) == '-' ? -1 : 1;
  final whole = match.group(2)!;
  final fraction = match.group(3) ?? '';
  if (fraction.length > scale &&
      fraction.substring(scale).split('').any((digit) => digit != '0')) {
    throw FormatException('decimal is inexact at scale $scale', input);
  }
  final keptFraction =
      fraction.length > scale ? fraction.substring(0, scale) : fraction;
  final scaled = '$whole${keptFraction.padRight(scale, '0')}';
  final magnitude = BigInt.parse(scaled);
  return sign < 0 ? -magnitude : magnitude;
}

String dateForInstant(String input, int offsetMinutes) {
  if (!input.endsWith('Z'))
    throw FormatException('instant must be explicit UTC', input);
  final instant = DateTime.parse(input).toUtc();
  return instant
      .add(Duration(minutes: offsetMinutes))
      .toIso8601String()
      .split('T')
      .first;
}

Future<void> main() async {
  final fixtureFile = File(
    '../../../fixtures/platform-parity/semantics/cross-language.json',
  );
  final fixture =
      jsonDecode(await fixtureFile.readAsString()) as Map<String, dynamic>;
  final money = fixture['contracts']['money'] as Map<String, dynamic>;
  final scale = money['scale'] as int;
  final decimals = fixture['decimalCases'] as List<dynamic>;

  for (final row in decimals.cast<Map<String, dynamic>>()) {
    final input = row['input'] as String;
    if (row['reject'] == true) {
      try {
        parseScaledInteger(input, scale);
        fail('${row['id']}: expected decimal rejection');
      } on FormatException {
        // The fixture requires rejection rather than rounding.
      }
      continue;
    }
    expectEqual(
      parseScaledInteger(input, scale).toString(),
      row['expectedScaled'],
      row['id'] as String,
    );
    final decoded = ExactDecimal.fromBuffer(
      (ExactDecimal()..value = input).writeToBuffer(),
    );
    expectEqual(decoded.value, input, '${row['id']} Protobuf round-trip');
  }

  final calendar = fixture['contracts']['calendar'] as Map<String, dynamic>;
  final offsetMinutes = calendar['utcOffsetMinutes'] as int;
  final dateCases = fixture['dateCases'] as List<dynamic>;
  for (final row in dateCases.cast<Map<String, dynamic>>()) {
    final input = row['input'] as String;
    if (row['kind'] == 'date-only') {
      final parsedDate = DateTime.parse('${input}T00:00:00Z').toUtc();
      expectEqual(
        parsedDate.toIso8601String().split('T').first,
        input,
        '${row['id']} valid date-only',
      );
      final decoded = DateOnly.fromBuffer(
        (DateOnly()..isoDate = input).writeToBuffer(),
      );
      expectEqual(decoded.isoDate, input, '${row['id']} Protobuf round-trip');
      expectEqual(decoded.isoDate, row['expectedDate'], row['id'] as String);
    } else {
      expectEqual(
        dateForInstant(input, offsetMinutes),
        row['expectedDate'],
        row['id'] as String,
      );
      final decoded = UtcInstant.fromBuffer(
        (UtcInstant()..rfc3339Utc = input).writeToBuffer(),
      );
      expectEqual(
        decoded.rfc3339Utc,
        input,
        '${row['id']} Protobuf round-trip',
      );
    }
  }

  const localPersistenceValues = {
    'SAVED': LocalPersistenceState.LOCAL_PERSISTENCE_STATE_SAVED,
    'FAILED': LocalPersistenceState.LOCAL_PERSISTENCE_STATE_FAILED,
  };
  const serverAcceptanceValues = {
    'ACCEPTED': ServerAcceptanceState.SERVER_ACCEPTANCE_STATE_ACCEPTED,
    'RETRYABLE_FAILURE':
        ServerAcceptanceState.SERVER_ACCEPTANCE_STATE_RETRYABLE_FAILURE,
    'REJECTED': ServerAcceptanceState.SERVER_ACCEPTANCE_STATE_REJECTED,
    'NOT_QUEUED': ServerAcceptanceState.SERVER_ACCEPTANCE_STATE_NOT_QUEUED,
  };
  const attachmentValues = {
    'UPLOADING':
        AttachmentCompletionState.ATTACHMENT_COMPLETION_STATE_UPLOADING,
    'NOT_REQUIRED':
        AttachmentCompletionState.ATTACHMENT_COMPLETION_STATE_NOT_REQUIRED,
    'COMPLETE': AttachmentCompletionState.ATTACHMENT_COMPLETION_STATE_COMPLETE,
    'RETRYABLE_FAILURE':
        AttachmentCompletionState.ATTACHMENT_COMPLETION_STATE_RETRYABLE_FAILURE,
  };
  const backupValues = {
    'STALE': BackupState.BACKUP_STATE_STALE,
    'CURRENT': BackupState.BACKUP_STATE_CURRENT,
  };
  const nextActionValues = {
    'NONE': NextUserAction.NEXT_USER_ACTION_NONE,
    'RETRY_SYNC': NextUserAction.NEXT_USER_ACTION_RETRY_SYNC,
    'REVIEW_SERVER_REJECTION':
        NextUserAction.NEXT_USER_ACTION_REVIEW_SERVER_REJECTION,
    'RETRY_ATTACHMENTS': NextUserAction.NEXT_USER_ACTION_RETRY_ATTACHMENTS,
    'RETRY_LOCAL_SAVE': NextUserAction.NEXT_USER_ACTION_RETRY_LOCAL_SAVE,
  };
  final saveSyncCases = fixture['saveSyncCases'] as List<dynamic>;
  for (final row in saveSyncCases.cast<Map<String, dynamic>>()) {
    final id = row['id'] as String;
    final value =
        SaveSyncStatus()
          ..localPersistence = localPersistenceValues[row['localPersistence']]!
          ..serverAcceptance = serverAcceptanceValues[row['serverAcceptance']]!
          ..attachmentCompletion =
              attachmentValues[row['attachmentCompletion']]!
          ..backup = backupValues[row['backup']]!
          ..pendingWorkRetained = row['pendingWorkRetained'] as bool
          ..nextUserAction = nextActionValues[row['nextUserAction']]!;
    final decoded = SaveSyncStatus.fromBuffer(value.writeToBuffer());
    expectEqual(
      decoded.localPersistence,
      value.localPersistence,
      '$id local persistence',
    );
    expectEqual(
      decoded.serverAcceptance,
      value.serverAcceptance,
      '$id server acceptance',
    );
    expectEqual(
      decoded.attachmentCompletion,
      value.attachmentCompletion,
      '$id attachments',
    );
    expectEqual(decoded.backup, value.backup, '$id backup');
    expectEqual(
      decoded.pendingWorkRetained,
      value.pendingWorkRetained,
      '$id retained work',
    );
    expectEqual(
      decoded.nextUserAction,
      value.nextUserAction,
      '$id next action',
    );
  }

  stdout.writeln(
    'PASS Dart Protobuf semantics (${decimals.length} decimal, ${dateCases.length} date cases, ${saveSyncCases.length} save/sync cases)',
  );
}
