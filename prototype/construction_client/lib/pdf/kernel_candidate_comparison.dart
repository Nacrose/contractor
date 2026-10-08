import 'dart:typed_data';

import 'package:pdfrx/pdfrx.dart' as pdfrx;
import 'package:pdfx/pdfx.dart' as pdfx;

/// One-shot evidence collected by the M01-T10 disposable comparison harness.
class PdfCandidateResult {
  const PdfCandidateResult({
    required this.name,
    required this.pageCount,
    required this.pageWidth,
    required this.pageHeight,
    required this.outputBytes,
    required this.elapsedMicros,
    required this.explicitlyClosed,
    required this.supportsRenderCancellation,
  });

  final String name;
  final int pageCount;
  final double pageWidth;
  final double pageHeight;
  final int outputBytes;
  final int elapsedMicros;
  final bool explicitlyClosed;
  final bool supportsRenderCancellation;

  @override
  String toString() =>
      '$name pages=$pageCount size=${pageWidth.toStringAsFixed(1)}x'
      '${pageHeight.toStringAsFixed(1)} output=$outputBytes bytes '
      'open+first-render+close=${elapsedMicros}us '
      'closed=$explicitlyClosed cancellation=$supportsRenderCancellation';
}

/// M01-T10 candidates. This is prototype-only and is not an application API.
abstract interface class PdfKernelCandidate {
  String get name;

  bool get supportsRenderCancellation;

  Future<PdfCandidateResult> openRenderClose(
    Uint8List pdfBytes, {
    required int renderWidth,
    required int renderHeight,
  });
}

class PdfrxPdfiumCandidate implements PdfKernelCandidate {
  @override
  String get name => 'pdfrx/PDFium';

  @override
  bool get supportsRenderCancellation => true;

  @override
  Future<PdfCandidateResult> openRenderClose(
    Uint8List pdfBytes, {
    required int renderWidth,
    required int renderHeight,
  }) async {
    final stopwatch = Stopwatch()..start();
    await pdfrx.pdfrxFlutterInitialize();
    final candidateBytes = Uint8List.fromList(pdfBytes);
    final document = await pdfrx.PdfDocument.openData(
      candidateBytes,
      sourceName: 'm01-t10-generated-fixture.pdf',
      useProgressiveLoading: true,
      maxSizeToCacheOnMemory: 1024 * 1024,
    );
    pdfrx.PdfImage? image;
    var closed = false;
    try {
      final page = document.pages.first;
      final pageCount = document.pages.length;
      image = await page.render(width: renderWidth, height: renderHeight);
      if (image == null) {
        throw StateError('PDFium returned no image for a non-canceled render.');
      }
      final outputBytes = image.pixels.lengthInBytes;
      final pageWidth = page.width;
      final pageHeight = page.height;
      image.dispose();
      image = null;
      await document.dispose();
      closed = true;
      stopwatch.stop();
      return PdfCandidateResult(
        name: name,
        pageCount: pageCount,
        pageWidth: pageWidth,
        pageHeight: pageHeight,
        outputBytes: outputBytes,
        elapsedMicros: stopwatch.elapsedMicroseconds,
        explicitlyClosed: true,
        supportsRenderCancellation: supportsRenderCancellation,
      );
    } finally {
      image?.dispose();
      if (!closed) await document.dispose();
      stopwatch.stop();
    }
  }
}

class PdfxPlatformCandidate implements PdfKernelCandidate {
  @override
  String get name => 'pdfx/platform renderers';

  @override
  bool get supportsRenderCancellation => false;

  @override
  Future<PdfCandidateResult> openRenderClose(
    Uint8List pdfBytes, {
    required int renderWidth,
    required int renderHeight,
  }) async {
    final stopwatch = Stopwatch()..start();
    // pdfx/PDF.js may transfer the input ArrayBuffer to its worker. Give each
    // run its own buffer and include the copy cost in the measured interval.
    final candidateBytes = Uint8List.fromList(pdfBytes);
    final document = await pdfx.PdfDocument.openData(candidateBytes);
    pdfx.PdfPage? page;
    var documentClosed = false;
    try {
      page = await document.getPage(1);
      final image = await page.render(
        width: renderWidth.toDouble(),
        height: renderHeight.toDouble(),
      );
      if (image == null) {
        throw StateError('pdfx returned no image for the first page.');
      }
      final result = PdfCandidateResult(
        name: name,
        pageCount: document.pagesCount,
        pageWidth: page.width.toDouble(),
        pageHeight: page.height.toDouble(),
        outputBytes: image.bytes.lengthInBytes,
        elapsedMicros: stopwatch.elapsedMicroseconds,
        explicitlyClosed: true,
        supportsRenderCancellation: supportsRenderCancellation,
      );
      await page.close();
      page = null;
      await document.close();
      documentClosed = true;
      stopwatch.stop();
      return PdfCandidateResult(
        name: result.name,
        pageCount: result.pageCount,
        pageWidth: result.pageWidth,
        pageHeight: result.pageHeight,
        outputBytes: result.outputBytes,
        elapsedMicros: stopwatch.elapsedMicroseconds,
        explicitlyClosed: true,
        supportsRenderCancellation: supportsRenderCancellation,
      );
    } finally {
      if (page != null) await page.close();
      if (!documentClosed) await document.close();
      stopwatch.stop();
    }
  }
}
