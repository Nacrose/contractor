import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:construction_client/pdf/pdf_document_model.dart';
import 'package:construction_client/pdf/pdf_page_cache.dart';
import 'package:construction_client/pdf/pdf_viewport.dart';

void main() {
  group('Bounded PDF Page Cache Unit Tests (M01-T06)', () {
    test('enforces bounded LRU capacity across 120-page document', () async {
      final cache = BoundedPdfPageCache(totalPages: 120, maxCapacity: 4);

      expect(cache.telemetry.cachedPagesCount, equals(0));

      // Decode pages 0, 1, 2, 3
      await cache.getOrDecodePage(0);
      final p1 = await cache.getOrDecodePage(1);
      await cache.getOrDecodePage(2);
      await cache.getOrDecodePage(3);

      expect(cache.telemetry.cachedPagesCount, equals(4));
      expect(cache.telemetry.cacheMisses, equals(4));
      expect(cache.telemetry.evictionsCount, equals(0));
      expect(cache.isCached(0), isTrue);

      // Decoding page 4 should evict page 0 (LRU)
      await cache.getOrDecodePage(4);
      expect(cache.telemetry.cachedPagesCount, equals(4));
      expect(cache.telemetry.evictionsCount, equals(1));
      expect(cache.isCached(0), isFalse); // Page 0 was evicted
      expect(cache.isCached(4), isTrue);

      // Fetching page 1 should be a warm cache hit
      final p1Hit = await cache.getOrDecodePage(1);
      expect(cache.telemetry.cacheHits, equals(1));
      expect(identical(p1, p1Hit), isTrue);
    });

    test('verifies single-page blueprint element structure', () async {
      final cache = BoundedPdfPageCache(totalPages: 10, maxCapacity: 2);
      final page = await cache.getOrDecodePage(0);

      expect(page.elements, isNotEmpty);
      expect(page.pageSize, equals(PdfPageSize.a3));
      expect(page.scaleRatio, equals(100.0));

      // Check title element exists
      expect(page.elements.any((e) => e.type == 'text' && (e.text?.contains('KATHMANDU METRO') ?? false)), isTrue);
    });
  });

  group('PDF Viewport Widget & Takeoff Interaction Tests (M01-T06)', () {
    testWidgets('renders PDF viewport, thumbnail ribbon and takeoff controls', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: PdfViewport(totalPages: 20, maxCachePages: 3),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Verify header controls
      expect(find.textContaining('PDF Blueprint Viewport (20 Pages)'), findsOneWidget);
      expect(find.text('Sheet 1 of 20'), findsOneWidget);
      expect(find.text('Distance Ruler'), findsOneWidget);
      expect(find.text('Polygon Area'), findsOneWidget);

      // Verify page ribbon
      expect(find.text('P.1'), findsOneWidget);
      expect(find.text('P.2'), findsOneWidget);
      expect(find.text('CACHED'), findsOneWidget); // Page 1 is cached

      // Verify HUD footer
      expect(find.textContaining('LRU Cache:'), findsOneWidget);
      expect(find.textContaining('Decode Latency:'), findsOneWidget);
    });

    testWidgets('next page button navigates and lazy-decodes new page', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: PdfViewport(totalPages: 10, maxCachePages: 3),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Tap Next Page
      final nextBtn = find.byTooltip('Next Page');
      expect(nextBtn, findsOneWidget);

      await tester.tap(nextBtn);
      await tester.pumpAndSettle();

      // Active sheet is now Sheet 2
      expect(find.text('Sheet 2 of 10'), findsOneWidget);
    });

    testWidgets('takeoff mode selector toggles between Distance and Area', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: PdfViewport(totalPages: 5, maxCachePages: 2),
          ),
        ),
      );
      await tester.pumpAndSettle();

      final areaChip = find.widgetWithText(ChoiceChip, 'Polygon Area');
      expect(areaChip, findsOneWidget);

      await tester.tap(areaChip);
      await tester.pumpAndSettle();

      // Area chip is selected
      final choiceChipWidget = tester.widget<ChoiceChip>(areaChip);
      expect(choiceChipWidget.selected, isTrue);
    });
  });
}
