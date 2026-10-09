import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:construction_client/mount/object_store.dart';
import 'package:construction_client/mount/ports.dart';

void main() {
  late Directory tmp;

  setUp(() async {
    tmp = await Directory.systemTemp.createTemp('mount_objects_test');
  });

  tearDown(() async {
    await tmp.delete(recursive: true);
  });

  group('FilesystemObjectStore (durable-before-return binding)', () {
    test('putBytes/getBytes/statBytes round-trip', () {
      final store = FilesystemObjectStore(tmp);
      final bytes = Uint8List.fromList(List.generate(1024, (i) => i % 251));
      store.putBytes('attachments/a-1/object.bin', bytes);
      expect(store.getBytes('attachments/a-1/object.bin'), bytes);
      expect(store.statBytes('attachments/a-1/object.bin'), 1024);
      expect(store.statBytes('attachments/a-1/missing.bin'), isNull);
    });

    test('putBytes is durable-before-return: a NEW store instance sees the bytes', () {
      final bytes = Uint8List.fromList([9, 8, 7, 6]);
      FilesystemObjectStore(tmp).putBytes('attachments/a-2/object.bin', bytes);
      // Fresh instance = fresh handle over the same root; the temp+flush+
      // atomic-rename sequence means the object is complete or absent.
      final second = FilesystemObjectStore(tmp);
      expect(second.getBytes('attachments/a-2/object.bin'), bytes);
    });

    test('renameBytes is an atomic move tolerating crash-recovery re-entry', () {
      final store = FilesystemObjectStore(tmp);
      store.putBytes('attachments/a-3/staged.bin', Uint8List.fromList([1, 2, 3]));
      store.renameBytes('attachments/a-3/staged.bin', 'attachments/a-3/final.bin');
      expect(store.statBytes('attachments/a-3/staged.bin'), isNull);
      expect(store.getBytes('attachments/a-3/final.bin'), Uint8List.fromList([1, 2, 3]));

      // Crash re-entry: source already moved, destination present -> no-op.
      store.renameBytes('attachments/a-3/staged.bin', 'attachments/a-3/final.bin');
      expect(store.getBytes('attachments/a-3/final.bin'), Uint8List.fromList([1, 2, 3]));

      // Source AND destination missing -> typed 'io', never a conjured file.
      expect(
        () => store.renameBytes('attachments/ghost/a', 'attachments/ghost/b'),
        throwsA(isA<ObjectStoreError>().having((e) => e.kind, 'kind', 'io')),
      );
    });

    test('removeBytes is idempotent; listKeys honors prefixes and hides temp artifacts', () {
      final store = FilesystemObjectStore(tmp);
      store.putBytes('attachments/a-4/a.bin', Uint8List.fromList([1]));
      store.putBytes('attachments/a-5/b.bin', Uint8List.fromList([2]));
      store.putBytes('attachments/other/c.bin', Uint8List.fromList([3]));
      store.removeBytes('attachments/a-4/a.bin');
      store.removeBytes('attachments/a-4/a.bin'); // idempotent

      expect(store.listKeys('attachments/a-4/'), isEmpty);
      expect(store.listKeys('attachments/a-5/'), ['attachments/a-5/b.bin']);
      expect(store.listKeys('attachments/'), containsAll(<String>[
        'attachments/a-5/b.bin',
        'attachments/other/c.bin',
      ]));
      // No .tmp staging artifacts ever surface under a domain prefix.
      expect(store.listKeys('attachments/').any((k) => k.contains('.tmp')), isFalse);
    });

    test('unsafe keys are rejected (no traversal, no absolute paths)', () {
      final store = FilesystemObjectStore(tmp);
      for (final key in ['../escape.bin', '/etc/passwd', 'a/../b', 'bad\x00key']) {
        expect(
          () => store.putBytes(key, Uint8List.fromList([1])),
          throwsA(isA<ObjectStoreError>().having((e) => e.kind, 'kind', 'io')),
          reason: 'key "$key" must be rejected',
        );
      }
    });

    test('getBytes on a missing object is a typed io error', () {
      final store = FilesystemObjectStore(tmp);
      expect(
        () => store.getBytes('attachments/ghost/object.bin'),
        throwsA(isA<ObjectStoreError>().having((e) => e.kind, 'kind', 'io')),
      );
    });
  });

  group('Sha256DigestPort (REAL sha-256, no fallback path)', () {
    const digest = Sha256DigestPort();

    test('algorithm is pinned to sha-256', () {
      expect(digest.algorithm, 'sha-256');
    });

    test('FIPS 180-2 test vectors', () {
      // sha256("") .
      expect(digest.digest(Uint8List.fromList([])),
          'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
      // sha256("abc") .
      expect(digest.digest('abc'.codeUnits),
          'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    });

    test('output is always lowercase hex', () {
      final hex = digest.digest(Uint8List.fromList(List.filled(32, 0xff)));
      expect(hex, matches(RegExp(r'^[0-9a-f]{64}$')));
    });
  });

  group('FileSourceReader', () {
    test('reads source bytes back; missing sources are typed io errors', () {
      const reader = FileSourceReader();
      final src = File('${tmp.path}/camera.jpg')..writeAsBytesSync(Uint8List.fromList([4, 5, 6]));
      expect(reader.readBytes(src.path), Uint8List.fromList([4, 5, 6]));
      expect(
        () => reader.readBytes('${tmp.path}/missing.jpg'),
        throwsA(isA<ObjectStoreError>().having((e) => e.kind, 'kind', 'io')),
      );
    });
  });
}
