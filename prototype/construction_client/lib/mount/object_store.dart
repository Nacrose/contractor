/// Device filesystem bindings for the attachment ports (M04-T02).
///
/// Binds the M03-T06 ObjectStore / SourceReaderPort / DigestPort shapes
/// (native_attachment contract.ts lines 174-206) to the device filesystem:
///   - putBytes is durable-before-return: bytes go to a temp file on the
///     SAME filesystem, are flushed, then atomically renamed into place.
///   - renameBytes tolerates a source already moved (crash-recovery
///     re-entry) as a no-op when the destination exists.
///   - quota/disk-full surfaces as the typed 'full' kind (ENOSPC, errno 28)
///     so the transfer manager maps it to the typed recoverable 'storage'
///     failure; every other IO error is the typed 'io' kind.
///   - digest is a REAL SHA-256 (package:crypto) — no fallback digest path
///     exists in the binding.
library;

import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:crypto/crypto.dart' as crypto;

import 'ports.dart';

class FilesystemObjectStore implements ObjectStore {
  final Directory root;
  final Random _random;

  FilesystemObjectStore(this.root, {Random? random}) : _random = random ?? Random.secure() {
    if (!root.existsSync()) root.createSync(recursive: true);
    if (!_tmpDir.existsSync()) _tmpDir.createSync(recursive: true);
  }

  Directory get _tmpDir => Directory('${root.path}${Platform.pathSeparator}.tmp');

  File _fileFor(String key) {
    _assertSafeKey(key);
    return File('${root.path}${Platform.pathSeparator}'
        '${key.replaceAll('/', Platform.pathSeparator)}');
  }

  /// Keys are app-generated namespaced paths; reject traversal and absolute
  /// forms so a hostile key can never escape the store root.
  void _assertSafeKey(String key) {
    if (key.isEmpty ||
        key.startsWith('/') ||
        key.contains('\\') ||
        key.contains('..') ||
        key.contains('\x00')) {
      throw ObjectStoreError('io', 'Unsafe object key rejected: length ${key.length}.');
    }
  }

  String _freshTmpName() {
    final n = _random.nextInt(1 << 32);
    return '.tmp-$n-${DateTime.now().microsecondsSinceEpoch}';
  }

  ObjectStoreError _mapFileSystemError(Object e) {
    if (e is FileSystemException) {
      final code = e.osError?.errorCode;
      if (code == 28) {
        return ObjectStoreError('full', 'Storage is full; the write was not acknowledged.');
      }
      if (code == 2 || code == 20) {
        return ObjectStoreError('io', 'Object path is missing.');
      }
      return ObjectStoreError('io', 'Object store IO failure.');
    }
    return ObjectStoreError('io', 'Object store failure.');
  }

  @override
  void putBytes(String key, Uint8List bytes) {
    try {
      final target = _fileFor(key);
      if (!target.parent.existsSync()) target.parent.createSync(recursive: true);
      final tmp = File('${_tmpDir.path}${Platform.pathSeparator}${_freshTmpName()}');
      final sink = tmp.openSync(mode: FileMode.write);
      try {
        sink.writeFromSync(bytes);
        sink.flushSync();
      } finally {
        sink.closeSync();
      }
      // Atomic same-filesystem move: the object appears complete or not at all.
      tmp.renameSync(target.path);
    } on ObjectStoreError {
      rethrow;
    } catch (e) {
      throw _mapFileSystemError(e);
    }
  }

  @override
  Uint8List getBytes(String key) {
    try {
      return _fileFor(key).readAsBytesSync();
    } on ObjectStoreError {
      rethrow;
    } catch (e) {
      throw _mapFileSystemError(e);
    }
  }

  @override
  int? statBytes(String key) {
    try {
      final f = _fileFor(key);
      return f.existsSync() ? f.lengthSync() : null;
    } on ObjectStoreError {
      rethrow;
    } catch (e) {
      throw _mapFileSystemError(e);
    }
  }

  @override
  void removeBytes(String key) {
    try {
      final f = _fileFor(key);
      if (f.existsSync()) f.deleteSync();
    } on ObjectStoreError {
      rethrow;
    } catch (e) {
      throw _mapFileSystemError(e);
    }
  }

  @override
  void renameBytes(String fromKey, String toKey) {
    try {
      final from = _fileFor(fromKey);
      final to = _fileFor(toKey);
      if (!from.existsSync()) {
        // Crash-recovery re-entry: source already moved. A present
        // destination makes this a no-op; an absent one cannot be conjured.
        if (to.existsSync()) return;
        throw ObjectStoreError('io', 'renameBytes: source and destination are both missing.');
      }
      if (!to.parent.existsSync()) to.parent.createSync(recursive: true);
      from.renameSync(to.path);
    } on ObjectStoreError {
      rethrow;
    } catch (e) {
      throw _mapFileSystemError(e);
    }
  }

  @override
  List<String> listKeys(String prefix) {
    _assertSafeKey(prefix);
    final rootPrefix = root.path;
    final keys = <String>[];
    final sep = Platform.pathSeparator;
    void walk(Directory dir) {
      for (final entity in dir.listSync(followLinks: false)) {
        if (entity is Directory) {
          walk(entity);
        } else if (entity is File) {
          final rel = entity.path.substring(rootPrefix.length + 1).replaceAll(sep, '/');
          if (rel.startsWith(prefix)) keys.add(rel);
        }
      }
    }

    walk(root);
    keys.sort();
    return keys;
  }
}

/// SourceReaderPort over the device filesystem — reads the source path
/// recorded on a journal row back for re-staging; throws (typed 'io') when
/// the source is gone.
class FileSourceReader implements SourceReaderPort {
  const FileSourceReader();

  @override
  Uint8List readBytes(String path) {
    try {
      return File(path).readAsBytesSync();
    } on FileSystemException catch (e) {
      final code = e.osError?.errorCode;
      if (code == 28) throw ObjectStoreError('full', 'Storage is full during source read.');
      throw ObjectStoreError('io', 'Source file is missing or unreadable.');
    }
  }
}

/// REAL SHA-256 (package:crypto, pure Dart) — lowercase hex. The attachment
/// registration contract requires SHA-256; no fallback digest path exists.
class Sha256DigestPort implements DigestPort {
  const Sha256DigestPort();

  @override
  String get algorithm => 'sha-256';

  @override
  String digest(List<int> bytes) {
    return crypto.sha256.convert(bytes).toString();
  }
}
