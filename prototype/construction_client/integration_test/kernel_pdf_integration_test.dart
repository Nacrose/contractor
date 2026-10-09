import 'package:construction_client/pdf/kernel_candidate_comparison.dart';
import 'package:construction_client/pdf/m01_t10_fixture.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  final bytes = createM01T10PdfFixture();

  testWidgets('M01-T10 compares PDF open, render, and close', (_) async {
    final result = await PdfrxPdfiumCandidate().openRenderClose(
      bytes,
      renderWidth: 640,
      renderHeight: 480,
    );
    expect(result.pageCount, 1);
    expect(result.pageWidth, greaterThan(0));
    expect(result.pageHeight, greaterThan(0));
    expect(result.outputBytes, greaterThan(0));
    expect(result.explicitlyClosed, isTrue);
    expect(result.supportsRenderCancellation, isTrue);
    // ignore: avoid_print
    print('M01-T10 $result');

    final pdfxResult = await PdfxPlatformCandidate().openRenderClose(
      bytes,
      renderWidth: 640,
      renderHeight: 480,
    );
    expect(pdfxResult.pageCount, 1);
    expect(pdfxResult.pageWidth, greaterThan(0));
    expect(pdfxResult.pageHeight, greaterThan(0));
    expect(pdfxResult.outputBytes, greaterThan(0));
    expect(pdfxResult.explicitlyClosed, isTrue);
    expect(pdfxResult.supportsRenderCancellation, isFalse);
    // ignore: avoid_print
    print('M01-T10 $pdfxResult');
  });
}
