import 'package:flutter_test/flutter_test.dart';
import 'package:construction_client/main.dart';

void main() {
  testWidgets('Prototype shell boots with governance banner and navigation', (WidgetTester tester) async {
    // Build our app and trigger a frame.
    await tester.pumpWidget(const ContractorPrototypeApp());

    // Verify the mandatory governance banner is displayed
    expect(find.textContaining('DISPOSABLE TECHNICAL PROTOTYPE (Milestone M01)'), findsOneWidget);

    // Verify navigation tabs exist
    expect(find.text('Overview'), findsOneWidget);
    expect(find.text('Worksheet (M04)'), findsOneWidget);
    expect(find.text('CAD View (M05)'), findsOneWidget);
    expect(find.text('PDF (M06)'), findsOneWidget);
    expect(find.text('Storage/Sync'), findsOneWidget);
    expect(find.text('Kernel (M07)'), findsOneWidget);

    // Verify platform feasibility cards
    expect(find.text('Platform Feasibility Shell'), findsOneWidget);
    expect(find.text('Target Surface'), findsOneWidget);
  });
}
