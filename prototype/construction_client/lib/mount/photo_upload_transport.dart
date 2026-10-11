import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;

import 'attachment_transfer.dart';
import 'ports.dart';

/// One protocol for Flutter web and installed clients. The session owner
/// supplies current authorization headers; tokens are never journaled here.
class HttpPhotoUploadRegistrar
    implements AttachmentRegistrarPort, VerifiedAttachmentRegistrarPort {
  final Uri endpoint;
  final String accountId;
  final Future<Map<String, String>> Function() authorizationHeaders;
  final http.Client client;
  final Duration timeout;

  HttpPhotoUploadRegistrar({
    required this.endpoint,
    required this.accountId,
    required this.authorizationHeaders,
    required this.client,
    this.timeout = const Duration(seconds: 30),
  });

  @override
  Future<String> openUpload({
    required String attachmentId,
    required String accountId,
    required String? projectId,
    required String? dailyReportId,
    required String digest,
    required int bytes,
  }) async {
    if (accountId != this.accountId || projectId == null || projectId.isEmpty) {
      throw const AttachmentRegistrarError(
        AttachmentFailureKind.revoked,
        'Select an authorized account and project.',
      );
    }
    final response = await _post({
      'action': 'open',
      'attachmentId': attachmentId,
      'projectId': projectId,
      'digest': digest,
      'bytes': bytes,
    });
    final id = response['uploadId'];
    if (id is! String || id.isEmpty) throw _protocolError();
    return id;
  }

  @override
  Future<int> queryUpload(String uploadId) async =>
      _offset(await _post({'action': 'query', 'uploadId': uploadId}));

  @override
  Future<int> putChunk(String uploadId, int offset, Uint8List chunk) async {
    final received = _offset(
      await _post({
        'action': 'chunk',
        'uploadId': uploadId,
        'offset': offset,
        'data': base64Encode(chunk),
      }),
    );
    if (received < offset + chunk.length) throw _protocolError();
    return received;
  }

  @override
  Future<String> completeUpload(
    String uploadId,
    String digest,
    int bytes,
  ) async => (await completeVerifiedUpload(uploadId, digest, bytes)).receipt;

  @override
  Future<VerifiedAttachmentRegistration> completeVerifiedUpload(
    String uploadId,
    String digest,
    int bytes,
  ) async {
    final response = await _post({
      'action': 'complete',
      'uploadId': uploadId,
      'digest': digest,
      'bytes': bytes,
    });
    if (response['uploadedDigest'] != digest ||
        response['uploadedBytes'] != bytes) {
      throw const AttachmentRegistrarError(
        AttachmentFailureKind.digestMismatch,
        'The server receipt does not match this photo.',
      );
    }
    final receipt = response['receipt'];
    final storedDigest = response['digest'];
    final storedBytes = response['fileSize'];
    if (receipt is! String ||
        receipt.isEmpty ||
        storedDigest is! String ||
        !RegExp(r'^[a-f0-9]{64}$').hasMatch(storedDigest) ||
        storedBytes is! int ||
        storedBytes < 1) {
      throw _protocolError();
    }
    return VerifiedAttachmentRegistration(receipt, storedDigest, storedBytes);
  }

  Future<Map<String, dynamic>> _post(Map<String, Object> command) async {
    try {
      final headers = await authorizationHeaders();
      final response = await client
          .post(
            endpoint,
            headers: {...headers, 'content-type': 'application/json'},
            body: jsonEncode(command),
          )
          .timeout(timeout);
      final decoded = jsonDecode(response.body);
      if (decoded is! Map<String, dynamic>) throw _protocolError();
      final kind = decoded['kind'];
      if (response.statusCode >= 200 &&
          response.statusCode < 300 &&
          (kind == 'upload' || kind == 'registered')) {
        return decoded;
      }
      final failure = switch (kind) {
        'revoked' || 'authentication_required' => AttachmentFailureKind.revoked,
        'rejection' => AttachmentFailureKind.rejection,
        'digest_mismatch' => AttachmentFailureKind.digestMismatch,
        _ => AttachmentFailureKind.retryable,
      };
      throw AttachmentRegistrarError(
        failure,
        failure == AttachmentFailureKind.revoked
            ? 'Sign in and check project access before retrying.'
            : 'Photo upload needs attention; the local photo is retained.',
      );
    } on AttachmentRegistrarError {
      rethrow;
    } catch (_) {
      throw const AttachmentRegistrarError(
        AttachmentFailureKind.retryable,
        'Photo upload is unavailable; retry when connected.',
      );
    }
  }

  int _offset(Map<String, dynamic> response) {
    final value = response['receivedBytes'];
    if (value is! int || value < 0 || value > 10 * 1024 * 1024) {
      throw _protocolError();
    }
    return value;
  }

  AttachmentRegistrarError _protocolError() => const AttachmentRegistrarError(
    AttachmentFailureKind.retryable,
    'The server returned an invalid photo upload response.',
  );
}

/// Downloads an already registered object through the product's authenticated
/// file route. That route rechecks tenant and project permissions on every read.
class HttpRegisteredAttachmentFetcher implements RegisteredAttachmentFetchPort {
  final Uri server;
  final http.Client client;
  final Duration timeout;

  HttpRegisteredAttachmentFetcher({
    required this.server,
    required this.client,
    this.timeout = const Duration(seconds: 30),
  });

  @override
  Future<Uint8List> fetchRegistered({
    required String receipt,
    required String objectId,
    required ScopeClaims scope,
  }) async {
    if (receipt.isEmpty ||
        objectId.isEmpty ||
        scope.projectId == null ||
        scope.projectId!.isEmpty ||
        scope.tenantId.isEmpty) {
      throw const AttachmentRegistrarError(
        AttachmentFailureKind.rejection,
        'Photo restore requires a registered receipt and project scope.',
      );
    }
    final uri = server.resolve('/api/files/${Uri.encodeComponent(objectId)}');
    final response = await client.get(uri).timeout(timeout);
    if (response.statusCode == 401 || response.statusCode == 403) {
      throw const AttachmentRegistrarError(
        AttachmentFailureKind.revoked,
        'Project access changed. Sign in and check your project access.',
      );
    }
    if (response.statusCode == 404) {
      throw const AttachmentRegistrarError(
        AttachmentFailureKind.rejection,
        'The registered photo is no longer available.',
      );
    }
    if (response.statusCode != 200) {
      throw const AttachmentRegistrarError(
        AttachmentFailureKind.retryable,
        'Photo download failed; it can be retried.',
      );
    }
    return response.bodyBytes;
  }
}
