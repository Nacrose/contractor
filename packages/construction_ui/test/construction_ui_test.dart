import 'package:construction_ui/construction_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('shared presentation components', () {
    testWidgets('save and sync states remain independent and non-blocking', (
      tester,
    ) async {
      final status = SaveSyncStatus()
        ..localPersistence = LocalPersistenceState.LOCAL_PERSISTENCE_STATE_SAVED
        ..serverAcceptance =
            ServerAcceptanceState.SERVER_ACCEPTANCE_STATE_ACCEPTED
        ..attachmentCompletion =
            AttachmentCompletionState.ATTACHMENT_COMPLETION_STATE_UPLOADING
        ..backup = BackupState.BACKUP_STATE_STALE
        ..pendingWorkRetained = true
        ..nextUserAction = NextUserAction.NEXT_USER_ACTION_NONE;
      var otherInteractionAvailable = false;

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Column(
              children: [
                SaveSyncStatusPanel(status: status),
                TextButton(
                  onPressed: () => otherInteractionAvailable = true,
                  child: const Text('Open another task'),
                ),
              ],
            ),
          ),
        ),
      );

      expect(find.text('Saved locally'), findsOneWidget);
      expect(find.text('Accepted'), findsOneWidget);
      expect(find.text('Uploading in background'), findsOneWidget);
      expect(find.text('Out of date'), findsOneWidget);
      expect(
        find.text('Pending work remains saved on this device.'),
        findsOneWidget,
      );
      expect(find.textContaining('Retry'), findsNothing);
      await tester.tap(find.text('Open another task'));
      expect(otherInteractionAvailable, isTrue);
    });

    testWidgets('retryable attachment status retains work and offers retry', (
      tester,
    ) async {
      final status = SaveSyncStatus()
        ..localPersistence = LocalPersistenceState.LOCAL_PERSISTENCE_STATE_SAVED
        ..serverAcceptance =
            ServerAcceptanceState.SERVER_ACCEPTANCE_STATE_ACCEPTED
        ..attachmentCompletion = AttachmentCompletionState
            .ATTACHMENT_COMPLETION_STATE_RETRYABLE_FAILURE
        ..backup = BackupState.BACKUP_STATE_CURRENT
        ..pendingWorkRetained = true
        ..nextUserAction = NextUserAction.NEXT_USER_ACTION_RETRY_ATTACHMENTS;
      var retryRequested = false;

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SaveSyncStatusPanel(
              status: status,
              onNextAction: () => retryRequested = true,
            ),
          ),
        ),
      );

      expect(find.text('Upload delayed'), findsOneWidget);
      expect(
        find.text('Pending work remains saved on this device.'),
        findsOneWidget,
      );
      await tester.tap(find.text('Retry attachment uploads'));
      expect(retryRequested, isTrue);
    });

    testWidgets('server rejection keeps local work and names the next step', (
      tester,
    ) async {
      final status = SaveSyncStatus()
        ..localPersistence = LocalPersistenceState.LOCAL_PERSISTENCE_STATE_SAVED
        ..serverAcceptance =
            ServerAcceptanceState.SERVER_ACCEPTANCE_STATE_REJECTED
        ..attachmentCompletion =
            AttachmentCompletionState.ATTACHMENT_COMPLETION_STATE_COMPLETE
        ..backup = BackupState.BACKUP_STATE_CURRENT
        ..pendingWorkRetained = true
        ..nextUserAction =
            NextUserAction.NEXT_USER_ACTION_REVIEW_SERVER_REJECTION;

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: SaveSyncStatusPanel(status: status)),
        ),
      );

      expect(find.text('Rejected'), findsOneWidget);
      expect(
        find.text(
          'The server rejected this update. Pending work remains saved on this device.',
        ),
        findsOneWidget,
      );
      expect(find.text('Next: Review the server message'), findsOneWidget);
    });

    test(
      'platform tokens use the generated semantic light and dark palettes',
      () {
        final light = ConstructionSemanticColors.fromBrightness(
          Brightness.light,
        );
        final dark = ConstructionSemanticColors.fromBrightness(Brightness.dark);

        expect(light.success, ConstructionTokens.lightSuccess);
        expect(light.amber, ConstructionTokens.lightAmber);
        expect(dark.info, ConstructionTokens.darkInfo);
        expect(dark.neutral, ConstructionTokens.darkMutedForeground);
        expect(ConstructionTokens.space4, 16);
        expect(ConstructionTokens.fontSize2xs, 10);
      },
    );

    testWidgets('ActionBar keeps its primary action and collapses actions', (
      tester,
    ) async {
      await tester.binding.setSurfaceSize(const Size(390, 800));
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ActionBar(
              primary: FilledButton(
                onPressed: () {},
                child: const Text('New RFI'),
              ),
              search: const TextField(
                decoration: InputDecoration(hintText: 'Search RFIs'),
              ),
              actions: const [
                ActionBarAction(label: 'Refresh', icon: Icons.refresh),
              ],
            ),
          ),
        ),
      );

      expect(find.text('New RFI'), findsOneWidget);
      expect(find.byTooltip('More actions'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.binding.setSurfaceSize(null);
    });

    testWidgets('status labels and unknown values render neutrally', (
      tester,
    ) async {
      await tester.pumpWidget(
        MaterialApp(
          home: const Scaffold(
            body: Column(
              children: [
                StatusBadge(status: 'in_progress'),
                StatusBadge(status: 'future_custom_state', showIcon: false),
              ],
            ),
          ),
        ),
      );

      expect(find.text('In Progress'), findsOneWidget);
      expect(find.text('Future Custom State'), findsOneWidget);
      expect(constructionStatusTone('submitted'), ConstructionStatusTone.amber);
      expect(
        constructionStatusTone('future_custom_state'),
        ConstructionStatusTone.neutral,
      );
    });

    test('currency formatter groups decimal strings without binary floats', () {
      expect(formatNpr('12345678.5'), 'Rs. 1,23,45,678.50');
      expect(formatNpr('999.995'), 'Rs. 1,000.00');
      expect(formatNpr('-001.2'), '-Rs. 1.20');
      expect(formatNpr('-0.004'), 'Rs. 0.00');
      expect(formatNpr('not-an-amount'), '—');
      expect(formatNpr('1234', prefix: 'none', decimals: 0), '1,234');
    });

    testWidgets('query boundary presents loading, empty, and error states', (
      tester,
    ) async {
      Widget view({
        required bool loading,
        required bool error,
        required bool empty,
      }) => MaterialApp(
        home: Scaffold(
          body: ConstructionQueryState<void>(
            entity: 'projects',
            isLoading: loading,
            hasError: error,
            isEmpty: empty,
            data: const Text('Project rows'),
            filtered: true,
          ),
        ),
      );

      await tester.pumpWidget(view(loading: true, error: false, empty: false));
      expect(find.bySemanticsLabel('Loading'), findsOneWidget);

      await tester.pumpWidget(view(loading: false, error: false, empty: true));
      expect(
        find.text('Try adjusting your search or active filters.'),
        findsOneWidget,
      );

      await tester.pumpWidget(view(loading: false, error: true, empty: false));
      expect(find.text('Could not load projects'), findsOneWidget);
      expect(find.text('Project rows'), findsNothing);
    });

    testWidgets('ConstructionTable presents supplied rows without a toolbar', (
      tester,
    ) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ConstructionTable<String>(
              columns: [
                ConstructionTableColumn<String>(
                  header: const Text('Project'),
                  cellBuilder: (row, _) => Text(row),
                ),
              ],
              rows: const ['Bridge North'],
            ),
          ),
        ),
      );

      expect(find.text('Project'), findsOneWidget);
      expect(find.text('Bridge North'), findsOneWidget);
      expect(find.byTooltip('More actions'), findsNothing);
    });

    testWidgets('busy dialog disables cancel and primary actions', (
      tester,
    ) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => Scaffold(
              body: TextButton(
                onPressed: () => showDialog<void>(
                  context: context,
                  builder: (_) => const ConstructionConfirmDialog(
                    title: 'Delete record',
                    description: 'This cannot be undone.',
                    onConfirm: null,
                    busy: true,
                  ),
                ),
                child: const Text('Open'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Open'));
      await tester.pump(const Duration(milliseconds: 250));

      expect(find.text('Delete record'), findsOneWidget);
      expect(
        tester
            .widget<TextButton>(find.widgetWithText(TextButton, 'Cancel'))
            .onPressed,
        isNull,
      );
      expect(
        tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
        isNull,
      );
    });
  });

  test(
    'action coordinator rejects overlapping commands and clears busy state',
    () async {
      final coordinator = ConstructionActionCoordinator();
      var completeFirst = false;
      final first = coordinator.run('Saving record…', () async {
        while (!completeFirst) {
          await Future<void>.delayed(Duration.zero);
        }
      });

      expect(coordinator.isBusy, isTrue);
      expect(coordinator.pendingLabel, 'Saving record…');
      await expectLater(
        coordinator.run('Another action…', () async {}),
        throwsA(isA<StateError>()),
      );
      completeFirst = true;
      await first;
      expect(coordinator.isBusy, isFalse);
      coordinator.dispose();
    },
  );
}
