import 'package:flutter/material.dart';

import 'generated_tokens.dart';

/// Standard dialog sizes from DLG-01 and scroll/footer behavior from DLG-02/03.
enum ConstructionDialogSize {
  xs(360),
  sm(480),
  md(560),
  lg(640),
  xl(768),
  xxl(900),
  xxxl(1024),
  xxxxl(1280);

  const ConstructionDialogSize(this.width);
  final double width;
}

class ConstructionDialog extends StatelessWidget {
  const ConstructionDialog({
    required this.title,
    required this.description,
    required this.content,
    this.actions = const <Widget>[],
    this.size = ConstructionDialogSize.md,
    this.busy = false,
    super.key,
  });

  final String title;
  final String description;
  final Widget content;
  final List<Widget> actions;
  final ConstructionDialogSize size;
  final bool busy;

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !busy,
    child: Dialog(
      insetPadding: const EdgeInsets.all(ConstructionTokens.space6),
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: size.width, maxHeight: 720),
        child: Padding(
          padding: const EdgeInsets.all(ConstructionTokens.space6),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(title, style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: ConstructionTokens.space1),
              Text(description, style: Theme.of(context).textTheme.bodyMedium),
              const SizedBox(height: ConstructionTokens.space4),
              Flexible(child: SingleChildScrollView(child: content)),
              if (actions.isNotEmpty) ...[
                const SizedBox(height: ConstructionTokens.space4),
                Wrap(
                  alignment: WrapAlignment.end,
                  spacing: ConstructionTokens.space2,
                  children: actions,
                ),
              ],
            ],
          ),
        ),
      ),
    ),
  );
}

/// Confirmation dialog with the cancel action first and primary action last.
class ConstructionConfirmDialog extends StatelessWidget {
  const ConstructionConfirmDialog({
    required this.title,
    required this.description,
    required this.onConfirm,
    this.confirmLabel = 'Confirm',
    this.cancelLabel = 'Cancel',
    this.destructive = false,
    this.busy = false,
    super.key,
  });

  final String title;
  final String description;
  final VoidCallback? onConfirm;
  final String confirmLabel;
  final String cancelLabel;
  final bool destructive;
  final bool busy;

  @override
  Widget build(BuildContext context) => ConstructionDialog(
    title: title,
    description: description,
    size: ConstructionDialogSize.xs,
    busy: busy,
    content: const SizedBox.shrink(),
    actions: [
      TextButton(
        onPressed: busy ? null : () => Navigator.of(context).maybePop(),
        child: Text(cancelLabel),
      ),
      FilledButton(
        onPressed: busy ? null : onConfirm,
        style: destructive
            ? FilledButton.styleFrom(
                backgroundColor: Theme.of(context).colorScheme.error,
                foregroundColor: Theme.of(context).colorScheme.onError,
              )
            : null,
        child: busy
            ? const SizedBox.square(
                dimension: 16,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : Text(confirmLabel),
      ),
    ],
  );

  static Future<bool?> show(
    BuildContext context, {
    required String title,
    required String description,
    required String confirmLabel,
    bool destructive = false,
  }) => showDialog<bool>(
    context: context,
    builder: (context) => ConstructionConfirmDialog(
      title: title,
      description: description,
      confirmLabel: confirmLabel,
      destructive: destructive,
      onConfirm: () => Navigator.of(context).pop(true),
    ),
  );
}
