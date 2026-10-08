import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:construction_client/cad/cad_geometry.dart';
import 'package:construction_client/cad/cad_spatial_index.dart';
import 'package:construction_client/cad/cad_fixture_loader.dart';
import 'package:construction_client/cad/cad_viewport.dart';

void main() {
  group('CAD Geometry & Spatial Index Unit Tests (M01-T05)', () {
    test('CadLine hitTest and snap points calculation', () {
      const line = CadLine(
        id: 'line_1',
        layer: 'WALLS',
        start: Offset(0, 0),
        end: Offset(100, 0),
      );

      // Hit test near center of line
      expect(line.hitTest(const Offset(50, 2), 5.0), isTrue);
      // Hit test far from line
      expect(line.hitTest(const Offset(50, 20), 5.0), isFalse);

      // Snap points: start, end, mid
      final snaps = line.getSnapPoints();
      expect(snaps.length, equals(3));
      expect(snaps[0].position, equals(const Offset(0, 0)));
      expect(snaps[0].type, equals(SnapType.endpoint));
      expect(snaps[1].position, equals(const Offset(100, 0)));
      expect(snaps[1].type, equals(SnapType.endpoint));
      expect(snaps[2].position, equals(const Offset(50, 0)));
      expect(snaps[2].type, equals(SnapType.midpoint));
    });

    test('CadCircle hitTest and snap points calculation', () {
      const circle = CadCircle(
        id: 'col_1',
        layer: 'COLUMNS',
        center: Offset(200, 200),
        radius: 20.0,
      );

      // Hit test on boundary (radius 20)
      expect(circle.hitTest(const Offset(220, 200), 2.0), isTrue);
      // Hit test way inside or outside
      expect(circle.hitTest(const Offset(200, 200), 2.0), isFalse);

      // Center snap
      final snaps = circle.getSnapPoints();
      expect(snaps.any((s) => s.type == SnapType.center && s.position == const Offset(200, 200)), isTrue);
    });

    test('CadSpatialIndex frustum query, entity picking and nearest snap', () {
      final index = CadSpatialIndex(cellSize: 100.0);
      final entities = CadFixtureLoader.loadStandardSitePlan();
      index.insertAll(entities);

      expect(index.count, greaterThan(20));

      // Query bounding box over room 1 (0 to 400, 0 to 400)
      final queried = index.queryRect(const Rect.fromLTWH(0, 0, 400, 400));
      expect(queried, isNotEmpty);

      // Pick interior partition wall_p3 at (100, 300)
      final picked = index.pickEntity(const Offset(100, 300), 5.0);
      expect(picked, isNotNull);
      expect(picked!.layer, equals('WALLS'));

      // Find snap near origin (0, 0)
      final snap = index.findNearestSnap(const Offset(2, 2), 15.0);
      expect(snap, isNotNull);
      expect(snap!.position, equals(const Offset(0, 0)));
      expect(snap.type, equals(SnapType.endpoint));
    });
  });

  group('CAD Viewport Widget & Interaction Tests (M01-T05)', () {
    testWidgets('renders CAD viewport surface, toolbar and HUD', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: CadViewport(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Verify toolbar elements
      expect(find.textContaining('CAD Viewport Prototype'), findsOneWidget);
      expect(find.text('WALLS'), findsOneWidget);
      expect(find.text('DOORS'), findsOneWidget);
      expect(find.text('WINDOWS'), findsOneWidget);
      expect(find.text('COLUMNS'), findsOneWidget);
      expect(find.text('GRID'), findsOneWidget);
      expect(find.text('ANNOTATIONS'), findsOneWidget);

      // Verify coordinate HUD footer
      expect(find.textContaining('Coord:'), findsOneWidget);
      expect(find.textContaining('Snap:'), findsOneWidget);
      expect(find.textContaining('Rendered:'), findsOneWidget);
    });

    testWidgets('toggling layer filter chip updates visible layers', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: CadViewport(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Tap 'GRID' filter chip to hide grid lines
      final gridChip = find.widgetWithText(FilterChip, 'GRID');
      expect(gridChip, findsOneWidget);

      await tester.tap(gridChip);
      await tester.pumpAndSettle();

      // Tap again to re-enable
      await tester.tap(gridChip);
      await tester.pumpAndSettle();
    });

    testWidgets('dense benchmark mode switches entity load dynamically', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: CadViewport(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      final modeToggle = find.text('Mode: Standard');
      expect(modeToggle, findsOneWidget);

      // Toggle to dense benchmark mode
      await tester.tap(modeToggle);
      await tester.pumpAndSettle();

      expect(find.text('Mode: Dense (Bench)'), findsOneWidget);
      expect(find.textContaining('Entities)'), findsOneWidget);
    });
  });
}
