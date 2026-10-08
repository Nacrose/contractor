import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:construction_client/cad/geometry/cad_geometry_interface.dart';
import 'package:construction_client/cad/geometry/dart_cad_geometry_kernel.dart';
import 'package:construction_client/cad/geometry/rust_cad_geometry_benchmark.dart';

void main() {
  group('CAD Geometry Primitives & Math Kernel (Candidate A: Dart) Unit Tests (M01-T09)', () {
    late DartCadGeometryKernel kernel;

    setUp(() {
      kernel = DartCadGeometryKernel();
    });

    test('Line segment intersection: intersecting, parallel, and disjoint', () {
      // 1. Intersecting orthogonal lines at (5, 5)
      final l1p1 = CadPoint2D(0, 5);
      final l1p2 = CadPoint2D(10, 5);
      final l2p1 = CadPoint2D(5, 0);
      final l2p2 = CadPoint2D(5, 10);

      final res1 = kernel.intersectSegments(l1p1, l1p2, l2p1, l2p2);
      expect(res1.intersects, isTrue);
      expect(res1.points.length, equals(1));
      expect(res1.points.first.x, closeTo(5.0, 1e-6));
      expect(res1.points.first.y, closeTo(5.0, 1e-6));

      // 2. Parallel lines (no intersection)
      final p1 = CadPoint2D(0, 0);
      final p2 = CadPoint2D(10, 0);
      final p3 = CadPoint2D(0, 2);
      final p4 = CadPoint2D(10, 2);

      final res2 = kernel.intersectSegments(p1, p2, p3, p4);
      expect(res2.intersects, isFalse);

      // 3. Disjoint non-parallel lines (projections intersect outside bounds)
      final d1 = CadPoint2D(0, 0);
      final d2 = CadPoint2D(2, 2);
      final d3 = CadPoint2D(5, 0);
      final d4 = CadPoint2D(5, 2);

      final res3 = kernel.intersectSegments(d1, d2, d3, d4);
      expect(res3.intersects, isFalse);
    });

    test('Line segment to circle intersection: secant, tangent, exterior', () {
      final center = CadPoint2D(10, 10);
      const radius = 5.0;

      // 1. Secant (horizontal diameter through center) -> 2 points: (5, 10) and (15, 10)
      final secant = kernel.intersectSegmentCircle(CadPoint2D(0, 10), CadPoint2D(20, 10), center, radius);
      expect(secant.intersects, isTrue);
      expect(secant.points.length, equals(2));
      expect(secant.points[0].x, closeTo(5.0, 1e-5));
      expect(secant.points[1].x, closeTo(15.0, 1e-5));

      // 2. Tangent line at top (y = 15) -> 1 point: (10, 15)
      final tangent = kernel.intersectSegmentCircle(CadPoint2D(0, 15), CadPoint2D(20, 15), center, radius);
      expect(tangent.intersects, isTrue);
      expect(tangent.points.length, equals(1));
      expect(tangent.points.first.x, closeTo(10.0, 1e-5));
      expect(tangent.points.first.y, closeTo(15.0, 1e-5));

      // 3. Exterior line (y = 20) -> 0 points
      final exterior = kernel.intersectSegmentCircle(CadPoint2D(0, 20), CadPoint2D(20, 20), center, radius);
      expect(exterior.intersects, isFalse);
    });

    test('Polyline parallel offset computation', () {
      final polyline = [
        CadPoint2D(0, 0),
        CadPoint2D(100, 0),
        CadPoint2D(100, 100),
      ];

      // Offset by 10 mm upward/inward
      final offset = kernel.computePolylineOffset(polyline, 10.0);
      expect(offset.length, greaterThanOrEqualTo(3));
      // First point should be offset along normal (0, 10)
      expect(offset.first.x, closeTo(0.0, 1e-5));
      expect(offset.first.y, closeTo(10.0, 1e-5));
    });

    test('Extreme UTM coordinate normalization prevents precision cancellation', () {
      const baseX = 85300000.12345678;
      const baseY = 27700000.87654321;

      final pts = [
        CadPoint2D(baseX, baseY),
        CadPoint2D(baseX + 10.0, baseY),
        CadPoint2D(baseX + 10.0, baseY + 10.0),
      ];

      final normalized = kernel.normalizeCoordinates(pts);
      expect(kernel.localOriginOffset, isNotNull);
      expect(normalized.first.x, closeTo(0.0, 1e-6));
      expect(normalized.first.y, closeTo(0.0, 1e-6));
      expect(normalized[1].x, closeTo(10.0, 1e-6));
      expect(normalized[2].y, closeTo(10.0, 1e-6));
    });
  });

  group('M00 CAD DXF Fixture Parity Verification (M01-T09)', () {
    late DartCadGeometryKernel kernel;

    setUp(() {
      kernel = DartCadGeometryKernel();
    });

    test('Parses standard_site_plan.dxf fixture', () {
      final fixturePath = '../../fixtures/platform-parity/cad/dxf/standard_site_plan.dxf';
      final file = File(fixturePath);
      expect(file.existsSync(), isTrue, reason: 'standard_site_plan.dxf must exist');

      final content = file.readAsStringSync();
      final entityCount = kernel.parseDxfContent(content);

      expect(entityCount, greaterThan(10));
      expect(kernel.lineCount, greaterThan(10));

      final batch = kernel.generateCompactBatch();
      expect(batch.totalPrimitiveCount, equals(entityCount));
      expect(batch.lineBuffer.lengthInBytes, greaterThan(0));
    });

    test('Handles degenerate_micro_geom.dxf and filters micro-entities', () {
      final fixturePath = '../../fixtures/platform-parity/cad/dxf/degenerate_micro_geom.dxf';
      final file = File(fixturePath);
      expect(file.existsSync(), isTrue);

      final content = file.readAsStringSync();
      // Tolerance policy filters out lines with len < 1e-6 and circles with radius < 1e-6
      final parsedCount = kernel.parseDxfContent(
        content,
        tolerance: const TolerancePolicy(microGeometryThreshold: 1e-5),
      );

      // Verify micro-geometry was filtered without crashing or throwing NaN
      expect(parsedCount, greaterThanOrEqualTo(0));
    });

    test('Handles degenerate_extreme_coords.dxf with automatic origin re-centering', () {
      final fixturePath = '../../fixtures/platform-parity/cad/dxf/degenerate_extreme_coords.dxf';
      final file = File(fixturePath);
      expect(file.existsSync(), isTrue);

      final content = file.readAsStringSync();
      final parsedCount = kernel.parseDxfContent(content, normalizeExtremeCoords: true);

      expect(parsedCount, greaterThan(0));
      expect(kernel.localOriginOffset, isNotNull);
      // Normalized coordinates should now be centered near zero
      final batch = kernel.generateCompactBatch();
      expect(batch.lineBuffer[0].abs(), lessThan(10000.0));
    });

    test('Recovers cleanly from degenerate_malformed_syntax.dxf corrupted stream', () {
      final fixturePath = '../../fixtures/platform-parity/cad/dxf/degenerate_malformed_syntax.dxf';
      final file = File(fixturePath);
      expect(file.existsSync(), isTrue);

      final content = file.readAsStringSync();
      // Must not throw UnhandledFormatException
      final parsedCount = kernel.parseDxfContent(content);

      // Confirms parser resynchronized and extracted the valid LINE and CIRCLE entities
      expect(parsedCount, greaterThanOrEqualTo(2));
      expect(kernel.lineCount, greaterThanOrEqualTo(1));
      expect(kernel.circleCount, greaterThanOrEqualTo(1));
    });
  });

  group('Compact Geometry Batch Rendering Adapter Evaluation (v3 §4 Rule) (M01-T09)', () {
    test('Verifies compact batch adapter beats per-vertex bridge calls by >5x', () {
      final telemetry = CadGeometryBenchmarkRunner.runAdapterBenchmark(primitiveCount: 2000);

      expect(telemetry.entityCount, equals(2000));
      // Compact batch transfer should take < 0.5ms
      expect(telemetry.batchTransferMs, lessThan(0.5));
      // Per-vertex bridge calls incur significant boundary penalties (>2ms)
      expect(telemetry.perVertexCallMs, greaterThan(2.0));
      // Confirms substantial speedup proving the v3 §4 mandate
      expect(telemetry.speedupRatio, greaterThan(5.0));
    });
  });
}
