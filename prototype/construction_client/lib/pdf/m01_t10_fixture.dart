import 'dart:convert';
import 'dart:typed_data';

/// Small deterministic binary PDF input for the M01-T10 renderer comparison.
/// This deliberately exercises text and vector paths, not the large-file gate.
Uint8List createM01T10PdfFixture() {
  const content =
      '0.1 0.2 0.3 RG 1 w 36 36 540 720 re S\n'
      'BT /F1 16 Tf 48 744 Td (M01-T10 blueprint fixture) Tj ET\n'
      '0.8 0.1 0.1 RG 48 700 m 564 700 l S\n';
  final objects = <String>[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] '
        '/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    '<< /Length ${utf8.encode(content).length} >>\nstream\n$content'
        'endstream',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  final output = StringBuffer('%PDF-1.4\n');
  final offsets = <int>[];
  for (var i = 0; i < objects.length; i++) {
    offsets.add(utf8.encode(output.toString()).length);
    output.write('${i + 1} 0 obj\n${objects[i]}\nendobj\n');
  }
  final xrefOffset = utf8.encode(output.toString()).length;
  output.write('xref\n0 ${objects.length + 1}\n');
  output.write('0000000000 65535 f \n');
  for (final offset in offsets) {
    output.write('${offset.toString().padLeft(10, '0')} 00000 n \n');
  }
  output.write(
    'trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n'
    'startxref\n$xrefOffset\n%%EOF\n',
  );
  return Uint8List.fromList(utf8.encode(output.toString()));
}
