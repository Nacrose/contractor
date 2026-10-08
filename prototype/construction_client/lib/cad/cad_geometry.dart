import 'dart:math' as math;
import 'package:flutter/material.dart';

/// Geometry types supported by the CAD Viewport
enum CadEntityType {
  line,
  circle,
  arc,
  polyline,
  text,
}

/// Snap point kinds
enum SnapType {
  endpoint,
  midpoint,
  center,
}

/// Snap candidate result
class SnapPoint {
  final Offset position;
  final SnapType type;
  final String label;

  const SnapPoint({
    required this.position,
    required this.type,
    required this.label,
  });
}

/// Base class for all CAD entities
abstract class CadEntity {
  final String id;
  final String layer;
  final Color color;
  final double strokeWidth;

  const CadEntity({
    required this.id,
    required this.layer,
    this.color = Colors.white,
    this.strokeWidth = 1.0,
  });

  CadEntityType get type;
  Rect get boundingBox;

  /// Check if the entity intersects a screen pick point within [tolerance] world units
  bool hitTest(Offset point, double tolerance);

  /// Return snap points (endpoints, midpoints, centers) for this entity
  List<SnapPoint> getSnapPoints();

  /// Render entity on canvas
  void draw(Canvas canvas, Paint basePaint);
}

/// CAD Line segment
class CadLine extends CadEntity {
  final Offset start;
  final Offset end;

  const CadLine({
    required super.id,
    required super.layer,
    required this.start,
    required this.end,
    super.color,
    super.strokeWidth,
  });

  @override
  CadEntityType get type => CadEntityType.line;

  @override
  Rect get boundingBox => Rect.fromPoints(start, end).inflate(strokeWidth / 2);

  @override
  bool hitTest(Offset point, double tolerance) {
    final l2 = (end.dx - start.dx) * (end.dx - start.dx) + (end.dy - start.dy) * (end.dy - start.dy);
    if (l2 == 0) return (point - start).distance <= tolerance;

    final t = (((point.dx - start.dx) * (end.dx - start.dx) + (point.dy - start.dy) * (end.dy - start.dy)) / l2).clamp(0.0, 1.0);
    final projection = Offset(start.dx + t * (end.dx - start.dx), start.dy + t * (end.dy - start.dy));
    return (point - projection).distance <= tolerance;
  }

  @override
  List<SnapPoint> getSnapPoints() {
    final mid = Offset((start.dx + end.dx) / 2, (start.dy + end.dy) / 2);
    return [
      SnapPoint(position: start, type: SnapType.endpoint, label: 'Endpoint'),
      SnapPoint(position: end, type: SnapType.endpoint, label: 'Endpoint'),
      SnapPoint(position: mid, type: SnapType.midpoint, label: 'Midpoint'),
    ];
  }

  @override
  void draw(Canvas canvas, Paint basePaint) {
    basePaint.color = color;
    basePaint.strokeWidth = strokeWidth;
    canvas.drawLine(start, end, basePaint);
  }
}

/// CAD Circle
class CadCircle extends CadEntity {
  final Offset center;
  final double radius;

  const CadCircle({
    required super.id,
    required super.layer,
    required this.center,
    required this.radius,
    super.color,
    super.strokeWidth,
  });

  @override
  CadEntityType get type => CadEntityType.circle;

  @override
  Rect get boundingBox => Rect.fromCircle(center: center, radius: radius);

  @override
  bool hitTest(Offset point, double tolerance) {
    final dist = (point - center).distance;
    return (dist - radius).abs() <= tolerance;
  }

  @override
  List<SnapPoint> getSnapPoints() {
    return [
      SnapPoint(position: center, type: SnapType.center, label: 'Center'),
      SnapPoint(position: Offset(center.dx + radius, center.dy), type: SnapType.endpoint, label: 'Quadrant 0°'),
      SnapPoint(position: Offset(center.dx, center.dy + radius), type: SnapType.endpoint, label: 'Quadrant 90°'),
      SnapPoint(position: Offset(center.dx - radius, center.dy), type: SnapType.endpoint, label: 'Quadrant 180°'),
      SnapPoint(position: Offset(center.dx, center.dy - radius), type: SnapType.endpoint, label: 'Quadrant 270°'),
    ];
  }

  @override
  void draw(Canvas canvas, Paint basePaint) {
    basePaint.color = color;
    basePaint.strokeWidth = strokeWidth;
    basePaint.style = PaintingStyle.stroke;
    canvas.drawCircle(center, radius, basePaint);
  }
}

/// CAD Arc
class CadArc extends CadEntity {
  final Offset center;
  final double radius;
  final double startAngle; // in radians
  final double sweepAngle; // in radians

  const CadArc({
    required super.id,
    required super.layer,
    required this.center,
    required this.radius,
    required this.startAngle,
    required this.sweepAngle,
    super.color,
    super.strokeWidth,
  });

  @override
  CadEntityType get type => CadEntityType.arc;

  @override
  Rect get boundingBox => Rect.fromCircle(center: center, radius: radius);

  @override
  bool hitTest(Offset point, double tolerance) {
    final dist = (point - center).distance;
    if ((dist - radius).abs() > tolerance) return false;

    var angle = math.atan2(point.dy - center.dy, point.dx - center.dx);
    if (angle < 0) angle += 2 * math.pi;

    var s = startAngle % (2 * math.pi);
    if (s < 0) s += 2 * math.pi;
    var e = (s + sweepAngle) % (2 * math.pi);

    if (sweepAngle >= 2 * math.pi) return true;
    if (s < e) return angle >= s && angle <= e;
    return angle >= s || angle <= e;
  }

  @override
  List<SnapPoint> getSnapPoints() {
    final startPt = Offset(center.dx + radius * math.cos(startAngle), center.dy + radius * math.sin(startAngle));
    final endPt = Offset(center.dx + radius * math.cos(startAngle + sweepAngle), center.dy + radius * math.sin(startAngle + sweepAngle));
    final midAngle = startAngle + sweepAngle / 2;
    final midPt = Offset(center.dx + radius * math.cos(midAngle), center.dy + radius * math.sin(midAngle));

    return [
      SnapPoint(position: startPt, type: SnapType.endpoint, label: 'Arc Start'),
      SnapPoint(position: endPt, type: SnapType.endpoint, label: 'Arc End'),
      SnapPoint(position: midPt, type: SnapType.midpoint, label: 'Arc Mid'),
      SnapPoint(position: center, type: SnapType.center, label: 'Arc Center'),
    ];
  }

  @override
  void draw(Canvas canvas, Paint basePaint) {
    basePaint.color = color;
    basePaint.strokeWidth = strokeWidth;
    basePaint.style = PaintingStyle.stroke;
    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      startAngle,
      sweepAngle,
      false,
      basePaint,
    );
  }
}

/// CAD Polyline (sequence of vertices)
class CadPolyline extends CadEntity {
  final List<Offset> vertices;
  final bool isClosed;

  const CadPolyline({
    required super.id,
    required super.layer,
    required this.vertices,
    this.isClosed = false,
    super.color,
    super.strokeWidth,
  });

  @override
  CadEntityType get type => CadEntityType.polyline;

  @override
  Rect get boundingBox {
    if (vertices.isEmpty) return Rect.zero;
    double minX = vertices.first.dx;
    double maxX = vertices.first.dx;
    double minY = vertices.first.dy;
    double maxY = vertices.first.dy;

    for (final v in vertices) {
      minX = math.min(minX, v.dx);
      maxX = math.max(maxX, v.dx);
      minY = math.min(minY, v.dy);
      maxY = math.max(maxY, v.dy);
    }
    return Rect.fromLTRB(minX, minY, maxX, maxY).inflate(strokeWidth / 2);
  }

  @override
  bool hitTest(Offset point, double tolerance) {
    final count = isClosed ? vertices.length : vertices.length - 1;
    for (int i = 0; i < count; i++) {
      final v1 = vertices[i];
      final v2 = vertices[(i + 1) % vertices.length];
      final line = CadLine(id: '', layer: layer, start: v1, end: v2);
      if (line.hitTest(point, tolerance)) return true;
    }
    return false;
  }

  @override
  List<SnapPoint> getSnapPoints() {
    final points = <SnapPoint>[];
    for (int i = 0; i < vertices.length; i++) {
      points.add(SnapPoint(position: vertices[i], type: SnapType.endpoint, label: 'Vertex ${i + 1}'));
      if (i < vertices.length - 1 || isClosed) {
        final next = vertices[(i + 1) % vertices.length];
        final mid = Offset((vertices[i].dx + next.dx) / 2, (vertices[i].dy + next.dy) / 2);
        points.add(SnapPoint(position: mid, type: SnapType.midpoint, label: 'Seg $i Mid'));
      }
    }
    return points;
  }

  @override
  void draw(Canvas canvas, Paint basePaint) {
    if (vertices.length < 2) return;
    basePaint.color = color;
    basePaint.strokeWidth = strokeWidth;
    basePaint.style = PaintingStyle.stroke;

    final path = Path();
    path.moveTo(vertices.first.dx, vertices.first.dy);
    for (int i = 1; i < vertices.length; i++) {
      path.lineTo(vertices[i].dx, vertices[i].dy);
    }
    if (isClosed) path.close();
    canvas.drawPath(path, basePaint);
  }
}

/// CAD Text annotation
class CadText extends CadEntity {
  final Offset position;
  final String text;
  final double fontSize;

  const CadText({
    required super.id,
    required super.layer,
    required this.position,
    required this.text,
    this.fontSize = 12.0,
    super.color,
  });

  @override
  CadEntityType get type => CadEntityType.text;

  @override
  Rect get boundingBox => Rect.fromLTWH(position.dx, position.dy, text.length * fontSize * 0.6, fontSize * 1.2);

  @override
  bool hitTest(Offset point, double tolerance) => boundingBox.inflate(tolerance).contains(point);

  @override
  List<SnapPoint> getSnapPoints() => [
    SnapPoint(position: position, type: SnapType.endpoint, label: 'Text Origin'),
  ];

  @override
  void draw(Canvas canvas, Paint basePaint) {
    final textSpan = TextSpan(
      text: text,
      style: TextStyle(color: color, fontSize: fontSize, fontFamily: 'monospace'),
    );
    final textPainter = TextPainter(
      text: textSpan,
      textDirection: TextDirection.ltr,
    );
    textPainter.layout();
    textPainter.paint(canvas, position);
  }
}
