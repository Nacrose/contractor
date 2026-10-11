import 'dart:convert';
import 'dart:typed_data';

import 'package:construction_client/mount/attachment_transfer.dart';
import 'package:construction_client/mount/photo_upload_transport.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  final digest = List.filled(64, 'a').join();
  final storedDigest = List.filled(64, 'b').join();
  HttpPhotoUploadRegistrar registrar(MockClient client) =>
      HttpPhotoUploadRegistrar(
        endpoint: Uri.parse('http://localhost/api/native/photos/upload'),
        accountId: 'account',
        client: client,
        authorizationHeaders: () async => {
          'authorization': 'Bearer test-token',
        },
      );

  test(
    'uses authenticated chunk protocol and preserves sanitized object metadata',
    () async {
      final requests = <Map<String, dynamic>>[];
      final port = registrar(
        MockClient((request) async {
          expect(request.headers['authorization'], 'Bearer test-token');
          final input = jsonDecode(request.body) as Map<String, dynamic>;
          expect(input.containsKey('accountId'), isFalse);
          requests.add(input);
          final response = input['action'] == 'complete'
              ? {
                  'kind': 'registered',
                  'receipt': 'photo-id',
                  'uploadedDigest': digest,
                  'uploadedBytes': 3,
                  'digest': storedDigest,
                  'fileSize': 2,
                }
              : {
                  'kind': 'upload',
                  'uploadId': 'upload-id',
                  'receivedBytes': input['action'] == 'chunk' ? 3 : 0,
                };
          return http.Response(jsonEncode(response), 200);
        }),
      );
      final id = await port.openUpload(
        attachmentId: 'photo',
        accountId: 'account',
        projectId: 'project',
        dailyReportId: 'report',
        digest: digest,
        bytes: 3,
      );
      expect(await port.queryUpload(id), 0);
      expect(await port.putChunk(id, 0, Uint8List.fromList([1, 2, 3])), 3);
      final registration = await port.completeVerifiedUpload(id, digest, 3);
      expect(registration.receipt, 'photo-id');
      expect(registration.digest, storedDigest);
      expect(registration.bytes, 2);
      expect(requests.map((value) => value['action']), [
        'open',
        'query',
        'chunk',
        'complete',
      ]);
    },
  );

  test('rejects a mismatched completion receipt', () async {
    final port = registrar(
      MockClient(
        (_) async => http.Response(
          jsonEncode({
            'kind': 'registered',
            'uploadedDigest': storedDigest,
            'uploadedBytes': 3,
          }),
          200,
        ),
      ),
    );
    await expectLater(
      port.completeVerifiedUpload('id', digest, 3),
      throwsA(
        isA<AttachmentRegistrarError>().having(
          (error) => error.kind,
          'kind',
          AttachmentFailureKind.digestMismatch,
        ),
      ),
    );
  });

  test('maps access revocation and untyped server failures without exposing response bodies', () async {
    for (final entry in [
      (403, '{"kind":"revoked"}', AttachmentFailureKind.revoked),
      (502, 'private proxy error details', AttachmentFailureKind.retryable),
    ]) {
      final port = registrar(
        MockClient((_) async => http.Response(entry.$2, entry.$1)),
      );
      await expectLater(
        port.queryUpload('id'),
        throwsA(
          isA<AttachmentRegistrarError>()
              .having((error) => error.kind, 'kind', entry.$3)
              .having(
                (error) => error.message.contains('private proxy'),
                'redacted',
                isFalse,
              ),
        ),
      );
    }
  });
}
