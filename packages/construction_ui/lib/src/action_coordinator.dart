import 'package:flutter/foundation.dart';

/// Coordinates one foreground user action at a time. The command and all
/// domain work are supplied by the application/service layer; this class owns
/// only UI state. Background sync and attachment transfers must not use this
/// coordinator: expose their progress through SaveSyncStatusPanel so unrelated
/// app interaction stays available.
class ConstructionActionCoordinator extends ChangeNotifier {
  String? _pendingLabel;

  String? get pendingLabel => _pendingLabel;
  bool get isBusy => _pendingLabel != null;

  /// Runs [command] and exposes its label while it is pending.
  ///
  /// A second command is rejected while one is running. Errors propagate to
  /// the caller; this coordinator never converts failures into success.
  Future<void> run(String label, Future<void> Function() command) async {
    if (isBusy) throw StateError('An action is already in progress.');
    _pendingLabel = label;
    notifyListeners();
    try {
      await command();
    } finally {
      _pendingLabel = null;
      notifyListeners();
    }
  }
}
