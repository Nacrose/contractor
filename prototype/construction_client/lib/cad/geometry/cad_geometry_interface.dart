import 'dart:typed_data';

/// 2D Cartesian Coordinate Point with high-precision double coordinates
class CadPoint2D {
  final double x;
  final double y;

  const CadPoint2D(this.x, this.y);

  CadPoint2D operator +(CadPoint2D other) => CadPoint2D(x + other.x, y + other.y);
  CadPoint2D operator -(CadPoint2D other) => CadPoint2D(x - other.x, y - other.y);
  CadPoint2D operator *(double scalar) => CadPoint2D(x * scalar, y * scalar);

  double distanceTo(CadPoint2D other) {
    final dx = x - other.x;
    final dy = y - other.y;
    return (dx * dx + dy * dy);
  }

  double euclideanDistance(CadPoint2D other) {
    final dx = x - other.x;
    final dy = y - other.y;
    return dx == 0 && dy == 0 ? 0.0 : (dx * dx + dy * dy > 0 ? (dx * dx + dy * dy).abs() : 0.0);
  }

  @override
  String toString() => '($x, $y)';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is CadPoint2D && runtimeType == other.runtimeType && x == other.x && y == other.y;

  @override
  int get hashCode => x.hashCode ^ y.hashCode;
}

/// Tolerance and precision policy for CAD geometric calculations (M01-T09)
class TolerancePolicy {
  final double epsilon; // Coincident point tolerance (e.g. 1e-5 mm)
  final double collinearAngleTolerance; // Collinear angle threshold in radians
  final double microGeometryThreshold; // Minimum length/radius before entity is culled (e.g. 1e-6 mm)

  const TolerancePolicy({
    this.epsilon = 1e-5,
    this.collinearAngleTolerance = 1e-6,
    this.microGeometryThreshold = 1e-6,
  });

  bool isCoincident(CadPoint2D a, CadPoint2D b) {
    return (a.x - b.x).abs() <= epsilon && (a.y - b.y).abs() <= epsilon;
  }

  bool isZero(double val) => val.abs() <= epsilon;
}

/// Intersection Result packet
class IntersectionResult {
  final bool intersects;
  final List<CadPoint2D> points;
  final bool isCoincident;

  const IntersectionResult({
    required this.intersects,
    this.points = const [],
    this.isCoincident = false,
  });

  static const IntersectionResult none = IntersectionResult(intersects: false);
}

/// Compact contiguous geometry batch for high-performance GPU/Canvas rendering (v3 §4)
/// Avoids per-vertex bridge calls by encoding primitives into flat Float32 arrays.
class GeometryBatchBuffer {
  /// Packed lines: [x0, y0, x1, y1, colorR, colorG, colorB, strokeWidth] (8 floats per line)
  final Float32List lineBuffer;
  final int lineCount;

  /// Packed circles/arcs: [cx, cy, radius, startAngle, sweepAngle, colorR, colorG, colorB] (8 floats)
  final Float32List circleBuffer;
  final int circleCount;

  const GeometryBatchBuffer({
    required this.lineBuffer,
    required this.lineCount,
    required this.circleBuffer,
    required this.circleCount,
  });

  int get totalPrimitiveCount => lineCount + circleCount;
  int get totalSizeBytes => lineBuffer.lengthInBytes + circleBuffer.lengthInBytes;
}

/// Abstract contract for CAD Geometry Primitives & Kernel (M01-T09)
abstract class CadGeometryKernel {
  /// Line-line segment intersection
  IntersectionResult intersectSegments(
    CadPoint2D p1,
    CadPoint2D p2,
    CadPoint2D p3,
    CadPoint2D p4, {
    TolerancePolicy tolerance = const TolerancePolicy(),
  });

  /// Line segment to circle intersection
  IntersectionResult intersectSegmentCircle(
    CadPoint2D p1,
    CadPoint2D p2,
    CadPoint2D center,
    double radius, {
    TolerancePolicy tolerance = const TolerancePolicy(),
  });

  /// Parallel offset curve computation for polyline
  List<CadPoint2D> computePolylineOffset(
    List<CadPoint2D> polyline,
    double offsetDistance, {
    TolerancePolicy tolerance = const TolerancePolicy(),
  });

  /// Tolerance-aware micro-geometry filter and UTM origin re-centering
  List<CadPoint2D> normalizeCoordinates(
    List<CadPoint2D> points, {
    CadPoint2D? localOrigin,
  });

  /// Generates a compact geometry batch buffer for zero-overhead rendering
  GeometryBatchBuffer generateCompactBatch();
}
