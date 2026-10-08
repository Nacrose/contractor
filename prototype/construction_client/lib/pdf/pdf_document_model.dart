import 'package:flutter/material.dart';

/// PDF Page Size definition
enum PdfPageSize {
  a4(210.0, 297.0),
  a3(420.0, 297.0),
  a1(841.0, 594.0),
  a0(1189.0, 841.0);

  final double widthMm;
  final double heightMm;
  const PdfPageSize(this.widthMm, this.heightMm);
}

/// Representation of a single element inside a blueprint page
class PdfVectorElement {
  final String id;
  final String type; // 'rect', 'line', 'circle', 'text', 'polygon'
  final Rect? bounds;
  final Offset? start;
  final Offset? end;
  final Offset? center;
  final double? radius;
  final List<Offset>? points;
  final String? text;
  final double? fontSize;
  final Color strokeColor;
  final Color? fillColor;
  final double strokeWidth;

  const PdfVectorElement({
    required this.id,
    required this.type,
    this.bounds,
    this.start,
    this.end,
    this.center,
    this.radius,
    this.points,
    this.text,
    this.fontSize,
    this.strokeColor = Colors.white,
    this.fillColor,
    this.strokeWidth = 1.0,
  });
}

/// Representation of a single decoded page in the blueprint document
class PdfBlueprintPage {
  final int pageIndex;
  final String pageTitle;
  final PdfPageSize pageSize;
  final double scaleRatio; // e.g., 100 for 1:100 scale
  final List<PdfVectorElement> elements;
  final DateTime decodedAt;

  PdfBlueprintPage({
    required this.pageIndex,
    required this.pageTitle,
    this.pageSize = PdfPageSize.a3,
    this.scaleRatio = 100.0,
    required this.elements,
    DateTime? decodedAt,
  }) : decodedAt = decodedAt ?? DateTime.now();

  Size get dimensions => Size(pageSize.widthMm, pageSize.heightMm);

  void dispose() {
    // Explicit resource cleanup
    elements.clear();
  }
}

/// Takeoff measurement annotation on a blueprint page
enum TakeoffType {
  distance,
  area,
}

class TakeoffMeasurement {
  final String id;
  final int pageIndex;
  final TakeoffType type;
  final List<Offset> points;
  final double measuredValue; // meters or square meters
  final String label;
  final Color color;

  const TakeoffMeasurement({
    required this.id,
    required this.pageIndex,
    required this.type,
    required this.points,
    required this.measuredValue,
    required this.label,
    this.color = const Color(0xFFF59E0B),
  });
}
