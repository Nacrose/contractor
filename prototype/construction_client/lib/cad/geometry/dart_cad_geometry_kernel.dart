import 'dart:math' as math;
import 'dart:typed_data';
import 'cad_geometry_interface.dart';

/// Parsed primitive entity for internal CAD geometry engine
class _ParsedLine {
  final CadPoint2D p1;
  final CadPoint2D p2;
  final String layer;
  _ParsedLine(this.p1, this.p2, this.layer);
}

class _ParsedCircle {
  final CadPoint2D center;
  final double radius;
  final String layer;
  _ParsedCircle(this.center, this.radius, this.layer);
}

/// Candidate A: In-Process Dart CAD Geometry & Primitives Kernel (M01-T09)
class DartCadGeometryKernel implements CadGeometryKernel {
  final List<_ParsedLine> _lines = [];
  final List<_ParsedCircle> _circles = [];
  CadPoint2D? localOriginOffset;

  void clear() {
    _lines.clear();
    _circles.clear();
    localOriginOffset = null;
  }

  int get lineCount => _lines.length;
  int get circleCount => _circles.length;

  @override
  IntersectionResult intersectSegments(
    CadPoint2D p1,
    CadPoint2D p2,
    CadPoint2D p3,
    CadPoint2D p4, {
    TolerancePolicy tolerance = const TolerancePolicy(),
  }) {
    final d1x = p2.x - p1.x;
    final d1y = p2.y - p1.y;
    final d2x = p4.x - p3.x;
    final d2y = p4.y - p3.y;

    final denom = d1x * d2y - d1y * d2x;

    if (denom.abs() <= tolerance.epsilon) {
      // Parallel or collinear
      return IntersectionResult.none;
    }

    final t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denom;
    final u = ((p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x) / denom;

    const eps = 1e-7;
    if (t >= -eps && t <= 1.0 + eps && u >= -eps && u <= 1.0 + eps) {
      final ix = p1.x + t * d1x;
      final iy = p1.y + t * d1y;
      return IntersectionResult(
        intersects: true,
        points: [CadPoint2D(ix, iy)],
      );
    }

    return IntersectionResult.none;
  }

  @override
  IntersectionResult intersectSegmentCircle(
    CadPoint2D p1,
    CadPoint2D p2,
    CadPoint2D center,
    double radius, {
    TolerancePolicy tolerance = const TolerancePolicy(),
  }) {
    final dx = p2.x - p1.x;
    final dy = p2.y - p1.y;

    final a = dx * dx + dy * dy;
    if (a <= tolerance.epsilon) {
      return IntersectionResult.none;
    }

    final fx = p1.x - center.x;
    final fy = p1.y - center.y;

    final b = 2.0 * (fx * dx + fy * dy);
    final c = (fx * fx + fy * fy) - radius * radius;

    final discriminant = b * b - 4.0 * a * c;

    if (discriminant < -tolerance.epsilon) {
      return IntersectionResult.none;
    }

    if (discriminant.abs() <= tolerance.epsilon) {
      // Tangent (1 point)
      final t = -b / (2.0 * a);
      if (t >= 0.0 && t <= 1.0) {
        return IntersectionResult(
          intersects: true,
          points: [CadPoint2D(p1.x + t * dx, p1.y + t * dy)],
        );
      }
      return IntersectionResult.none;
    }

    // Secant (2 points)
    final sqrtDisc = math.sqrt(discriminant);
    final t1 = (-b - sqrtDisc) / (2.0 * a);
    final t2 = (-b + sqrtDisc) / (2.0 * a);

    final points = <CadPoint2D>[];
    if (t1 >= 0.0 && t1 <= 1.0) {
      points.add(CadPoint2D(p1.x + t1 * dx, p1.y + t1 * dy));
    }
    if (t2 >= 0.0 && t2 <= 1.0) {
      points.add(CadPoint2D(p1.x + t2 * dx, p1.y + t2 * dy));
    }

    return IntersectionResult(
      intersects: points.isNotEmpty,
      points: points,
    );
  }

  @override
  List<CadPoint2D> computePolylineOffset(
    List<CadPoint2D> polyline,
    double offsetDistance, {
    TolerancePolicy tolerance = const TolerancePolicy(),
  }) {
    if (polyline.length < 2) return polyline;

    final offsetSegments = <List<CadPoint2D>>[];

    for (int i = 0; i < polyline.length - 1; i++) {
      final p1 = polyline[i];
      final p2 = polyline[i + 1];

      final dx = p2.x - p1.x;
      final dy = p2.y - p1.y;
      final len = math.sqrt(dx * dx + dy * dy);

      if (len <= tolerance.microGeometryThreshold) continue;

      // Normal vector (-dy, dx) normalized and scaled by offset
      final nx = (-dy / len) * offsetDistance;
      final ny = (dx / len) * offsetDistance;

      offsetSegments.add([
        CadPoint2D(p1.x + nx, p1.y + ny),
        CadPoint2D(p2.x + nx, p2.y + ny),
      ]);
    }

    if (offsetSegments.isEmpty) return [];

    final result = <CadPoint2D>[];
    result.add(offsetSegments.first.first);

    for (int i = 0; i < offsetSegments.length - 1; i++) {
      final s1 = offsetSegments[i];
      final s2 = offsetSegments[i + 1];

      final isect = intersectSegments(
        s1[0],
        s1[1],
        s2[0],
        s2[1],
        tolerance: tolerance,
      );

      if (isect.intersects && isect.points.isNotEmpty) {
        result.add(isect.points.first);
      } else {
        result.add(s1[1]);
        result.add(s2[0]);
      }
    }

    result.add(offsetSegments.last.last);
    return result;
  }

  @override
  List<CadPoint2D> normalizeCoordinates(
    List<CadPoint2D> points, {
    CadPoint2D? localOrigin,
  }) {
    if (points.isEmpty) return points;
    final origin = localOrigin ?? points.first;
    localOriginOffset = origin;

    return points.map((p) => CadPoint2D(p.x - origin.x, p.y - origin.y)).toList();
  }

  /// Parses an ASCII DXF stream with resilient error recovery for corrupted / malformed files
  int parseDxfContent(
    String dxfString, {
    TolerancePolicy tolerance = const TolerancePolicy(),
    bool normalizeExtremeCoords = true,
  }) {
    clear();
    final rawLines = dxfString.split(RegExp(r'\r?\n'));
    final tokens = <String>[];
    for (final l in rawLines) {
      final trimmed = l.trim();
      if (trimmed.isNotEmpty) tokens.add(trimmed);
    }

    int i = 0;
    String currentSection = '';
    String currentEntity = '';
    String currentLayer = '0';

    // Temporary entity registers
    double x10 = 0.0, y20 = 0.0;
    double x11 = 0.0, y21 = 0.0;
    double radius40 = 0.0;
    List<CadPoint2D> polylinePts = [];

    void commitCurrentEntity() {
      if (currentEntity == 'LINE') {
        final p1 = CadPoint2D(x10, y20);
        final p2 = CadPoint2D(x11, y21);
        final lenSq = (p1.x - p2.x) * (p1.x - p2.x) + (p1.y - p2.y) * (p1.y - p2.y);
        // Clean micro-geometry
        if (lenSq > tolerance.microGeometryThreshold * tolerance.microGeometryThreshold) {
          _lines.add(_ParsedLine(p1, p2, currentLayer));
        }
      } else if (currentEntity == 'CIRCLE') {
        if (radius40 > tolerance.microGeometryThreshold) {
          _circles.add(_ParsedCircle(CadPoint2D(x10, y20), radius40, currentLayer));
        }
      } else if (currentEntity == 'LWPOLYLINE') {
        if (polylinePts.length >= 2) {
          for (int j = 0; j < polylinePts.length - 1; j++) {
            _lines.add(_ParsedLine(polylinePts[j], polylinePts[j + 1], currentLayer));
          }
        }
      }
      currentEntity = '';
      polylinePts = [];
    }

    while (i < tokens.length - 1) {
      final codeStr = tokens[i];
      final valStr = tokens[i + 1];
      final code = int.tryParse(codeStr);
      i += 2;

      if (code == null) continue; // Skip malformed code token

      if (code == 0) {
        commitCurrentEntity();
        if (valStr == 'SECTION') {
          currentSection = '';
        } else if (valStr == 'ENDSEC') {
          currentSection = '';
        } else if (valStr == 'EOF') {
          break;
        } else if (currentSection == 'ENTITIES') {
          currentEntity = valStr;
          currentLayer = '0';
          x10 = 0.0; y20 = 0.0;
          x11 = 0.0; y21 = 0.0;
          radius40 = 0.0;
          polylinePts = [];
        }
      } else if (code == 2 && currentSection.isEmpty) {
        currentSection = valStr;
      } else if (currentSection == 'ENTITIES') {
        if (code == 8) {
          currentLayer = valStr;
        } else if (code == 10) {
          x10 = double.tryParse(valStr) ?? 0.0;
          if (currentEntity == 'LWPOLYLINE') {
            // LWPOLYLINE vertex start
          }
        } else if (code == 20) {
          y20 = double.tryParse(valStr) ?? 0.0;
          if (currentEntity == 'LWPOLYLINE') {
            polylinePts.add(CadPoint2D(x10, y20));
          }
        } else if (code == 11) {
          x11 = double.tryParse(valStr) ?? 0.0;
        } else if (code == 21) {
          y21 = double.tryParse(valStr) ?? 0.0;
        } else if (code == 40) {
          radius40 = double.tryParse(valStr) ?? 0.0;
        }
      }
    }
    commitCurrentEntity();

    // Check for extreme UTM coordinates (e.g. > 1,000,000)
    if (normalizeExtremeCoords && _lines.isNotEmpty) {
      final firstPt = _lines.first.p1;
      if (firstPt.x.abs() > 1000000.0 || firstPt.y.abs() > 1000000.0) {
        localOriginOffset = firstPt;
        for (int k = 0; k < _lines.length; k++) {
          final l = _lines[k];
          _lines[k] = _ParsedLine(
            CadPoint2D(l.p1.x - firstPt.x, l.p1.y - firstPt.y),
            CadPoint2D(l.p2.x - firstPt.x, l.p2.y - firstPt.y),
            l.layer,
          );
        }
        for (int k = 0; k < _circles.length; k++) {
          final c = _circles[k];
          _circles[k] = _ParsedCircle(
            CadPoint2D(c.center.x - firstPt.x, c.center.y - firstPt.y),
            c.radius,
            c.layer,
          );
        }
      }
    }

    return _lines.length + _circles.length;
  }

  @override
  GeometryBatchBuffer generateCompactBatch() {
    // Pack lines: 8 floats per line [x0, y0, x1, y1, r, g, b, strokeWidth]
    final lineData = Float32List(_lines.length * 8);
    for (int i = 0; i < _lines.length; i++) {
      final l = _lines[i];
      final offset = i * 8;
      lineData[offset + 0] = l.p1.x;
      lineData[offset + 1] = l.p1.y;
      lineData[offset + 2] = l.p2.x;
      lineData[offset + 3] = l.p2.y;
      lineData[offset + 4] = 0.02; // R
      lineData[offset + 5] = 0.71; // G
      lineData[offset + 6] = 0.83; // B (Cyan)
      lineData[offset + 7] = 1.0;  // Stroke width
    }

    // Pack circles: 8 floats per circle [cx, cy, radius, startAngle, sweepAngle, r, g, b]
    final circleData = Float32List(_circles.length * 8);
    for (int i = 0; i < _circles.length; i++) {
      final c = _circles[i];
      final offset = i * 8;
      circleData[offset + 0] = c.center.x;
      circleData[offset + 1] = c.center.y;
      circleData[offset + 2] = c.radius;
      circleData[offset + 3] = 0.0;
      circleData[offset + 4] = math.pi * 2.0;
      circleData[offset + 5] = 0.23; // R
      circleData[offset + 6] = 0.51; // G
      circleData[offset + 7] = 0.96; // B
    }

    return GeometryBatchBuffer(
      lineBuffer: lineData,
      lineCount: _lines.length,
      circleBuffer: circleData,
      circleCount: _circles.length,
    );
  }
}
