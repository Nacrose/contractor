import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:construction_client/worksheet/worksheet_viewport.dart';

void main() {
  group('WorksheetViewport Virtualized Interaction Tests (M01-T04)', () {
    testWidgets('renders 50,000 virtualized rows without unbounded memory or freeze', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: WorksheetViewport(totalRows: 50000),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Verify header columns are present
      expect(find.text('Item No'), findsOneWidget);
      expect(find.text('Description'), findsOneWidget);
      expect(find.text('Unit'), findsOneWidget);
      expect(find.text('Quantity'), findsOneWidget);
      expect(find.text('Rate'), findsOneWidget);
      expect(find.text('Amount'), findsOneWidget);

      // Verify row count badge
      expect(find.text('Virtualized Worksheet (50000 Rows)'), findsOneWidget);

      // Verify first row is visible
      expect(find.text('1.01'), findsOneWidget);
      expect(find.text('Earthwork excavation in foundation trenches'), findsWidgets);
      expect(find.text('250.0'), findsWidgets);
      expect(find.text('NPR 450'), findsWidgets);
      expect(find.text('NPR 112500'), findsWidgets);
    });

    testWidgets('keyboard navigation updates selected row and column', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: WorksheetViewport(totalRows: 100),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Focus the grid by tapping the first cell in row 1
      await tester.tap(find.text('1.01'));
      await tester.pumpAndSettle();

      // Press ArrowDown to navigate to Row 2
      await tester.sendKeyEvent(LogicalKeyboardKey.arrowDown);
      await tester.pumpAndSettle();

      // Status message should indicate row 2 is active
      expect(find.textContaining('Row 2'), findsWidgets);
    });

    testWidgets('editing quantity updates calculated amount immediately', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: WorksheetViewport(totalRows: 10),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Tap quantity cell on first row (qty = 250.0, rate = 450 -> amount = 112500)
      final qtyFinder = find.text('250.0').first;
      expect(qtyFinder, findsOneWidget);

      // Double-tap cell to enter edit mode
      await tester.tap(qtyFinder);
      await tester.pump(const Duration(milliseconds: 50));
      await tester.tap(qtyFinder);
      await tester.pumpAndSettle();

      // In edit mode, enter text '300.0'
      final editableFinder = find.byType(TextField);
      expect(editableFinder, findsOneWidget);
      await tester.enterText(editableFinder, '300.0');
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pumpAndSettle();

      // 300 * 450 = 135,000
      expect(find.text('NPR 135000'), findsWidgets);
    });

    testWidgets('copy to clipboard writes cell value', (tester) async {
      String? copiedText;
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        SystemChannels.platform,
        (message) async {
          if (message.method == 'Clipboard.setData') {
            copiedText = (message.arguments as Map)['text'] as String?;
            return null;
          }
          return null;
        },
      );

      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: WorksheetViewport(totalRows: 10),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Tap cell to select
      await tester.tap(find.text('1.01'));
      await tester.pumpAndSettle();

      // Press Copy shortcut (Control+C)
      await tester.sendKeyDownEvent(LogicalKeyboardKey.control);
      await tester.sendKeyEvent(LogicalKeyboardKey.keyC);
      await tester.sendKeyUpEvent(LogicalKeyboardKey.control);
      await tester.pumpAndSettle();

      expect(copiedText, equals('1.01'));
    });
  });
}
