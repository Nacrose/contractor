import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:construction_client/mount/mount.dart';
import 'package:construction_client/mount/outbox_repository.dart';
import 'package:construction_client/mount/ports.dart';
import 'package:construction_client/mount/sync_health.dart';

/// The composition root wiring test (M04-T02): openMount binds every port
/// to a working device implementation and the pieces compose (outbox rows
/// are visible through the orchestrator source and the health surface).
void main() {
  late Directory tmp;

  setUp(() async {
    tmp = await Directory.systemTemp.createTemp('mount_root_test');
  });

  tearDown(() async {
    await tmp.delete(recursive: true);
  });

  ConstructionMount openIn(String name) {
    return openMount(
      options: MountOptions(
        dbPath: '${tmp.path}/$name.db',
        objectRoot: Directory('${tmp.path}/objects-$name'),
      ),
      credentials: _MemoryCredentialStoreForTest(),
      transport: _NoopTransport(),
    );
  }

  test('openMount wires the full bundle with durability enforced and migrations applied', () {
    final mount = openIn('wired');
    expect(mount.migrations.applied, [1, 2, 3]);
    expect(mount.migrations.currentVersion, 3);
    // Durability flags enforced at open (re-asserted inside openMount):
    expect(mount.driver.pragmaValue('PRAGMA journal_mode'), 'wal');
    expect(mount.driver.pragmaValue('PRAGMA synchronous'), 2);
    expect(mount.driver.pragmaValue('PRAGMA foreign_keys'), 1);
    // Port bundle types:
    expect(mount.outbox, isNotNull);
    expect(mount.pendingOps, isNotNull);
    expect(mount.objects, isNotNull);
    expect(mount.digest.algorithm, 'sha-256');
    mount.driver.close();
  });

  test('a corrupted database fails OPEN with a typed error (integrity check)', () {
    final garbage = File('${tmp.path}/garbage.db')..writeAsBytesSync(List.filled(64, 0x42));
    expect(
      () => openMount(
        options: MountOptions(dbPath: garbage.path, objectRoot: Directory('${tmp.path}/obj-g')),
        credentials: _MemoryCredentialStoreForTest(),
        transport: _NoopTransport(),
      ),
      throwsA(isA<RepositoryError>()),
    );
  });

  test('the composed pieces work together: save -> source -> health', () {
    final mount = openIn('compose');
    mount.outbox.saveMutation(SaveMutationInput(
      accountId: 'acc',
      projectId: 'proj-1',
      op: const PendingOpInput(
        opId: 'op-1',
        kind: 'fieldSubmission.submit',
        payload: '{"day":"2026-10-09"}',
        digest: 'dd',
        tenantId: 'tenant-1',
        role: 'lead',
      ),
    ));

    final op = mount.pendingOps.getOp('acc', 'op-1')!;
    expect(op.state, 'pending');
    expect(op.tenantId, 'tenant-1');

    // Envelope construction for the drain loop (M04-T03 consumes this).
    final envelope = mount.envelopeFor(
      op: op,
      deviceId: 'device-1',
      attempt: 1,
      nowMs: 7,
    );
    expect(envelope.syncProtocolVersion, kSyncProtocolVersion);
    expect(envelope.payloadDigest, mount.digest.digest('{"day":"2026-10-09"}'.codeUnits));

    // The health surface sees the pending op through the same store.
    final health = mount.healthSource(accountId: 'acc', tenantId: 'tenant-1');
    final now = DateTime.now().millisecondsSinceEpoch;
    final snapshot = buildDeviceSyncHealth(health, HealthOptions(nowMs: now));
    expect(snapshot.synced, isFalse);
    expect(snapshot.pendingOperationCount, 1);
    mount.driver.close();
  });

  test('a missing transport is a typed misconfiguration, never a silent no-sync mount', () {
    expect(
      () => openMount(
        options: MountOptions(dbPath: '${tmp.path}/nt.db', objectRoot: Directory('${tmp.path}/obj-nt')),
        credentials: _MemoryCredentialStoreForTest(),
      ),
      throwsA(isA<RepositoryError>().having((e) => e.kind, 'kind', 'misconfigured')),
    );
  });
}

class _NoopTransport implements SyncTransportPort {
  @override
  Future<SyncOutcome> send(SyncEnvelope envelope) async {
    throw StateError('no-op transport');
  }
}

/// Test double standing in for the channel-bound store (the channel itself
/// is bound in secure_store_test.dart).
class _MemoryCredentialStoreForTest implements SecureCredentialStore {
  @override
  SecureStorageBinding get binding => SecureStorageBinding.linuxSecretService;

  @override
  Future<void> save(CredentialRef ref, String value) async {}

  @override
  Future<String?> load(CredentialRef ref) async => null;

  @override
  Future<void> delete(CredentialRef ref) async {}

  @override
  Future<void> wipeAll() async {}
}
