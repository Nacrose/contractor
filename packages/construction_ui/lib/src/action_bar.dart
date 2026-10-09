import 'package:flutter/material.dart';

/// The shared command row (PAGE-03/04/05, ACT-01, BTN-06).
///
/// It remains a single clipped row. Secondary actions collapse into a menu
/// under constrained widths; the labeled primary action remains visible.
class ActionBar extends StatelessWidget {
  const ActionBar({
    required this.primary,
    this.leading,
    this.search,
    this.filters,
    this.actions = const <ActionBarAction>[],
    this.overflow = const <ActionBarAction>[],
    this.filterCount = 0,
    this.ariaLabel = 'Page actions',
    super.key,
  });

  final Widget primary;
  final Widget? leading;
  final Widget? search;
  final Widget? filters;
  final List<ActionBarAction> actions;
  final List<ActionBarAction> overflow;
  final int filterCount;
  final String ariaLabel;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final compact = constraints.maxWidth < 560;
      final menuActions = <ActionBarAction>[
        ...overflow,
        if (compact) ...actions,
      ];
      return Semantics(
        container: true,
        explicitChildNodes: true,
        label: ariaLabel,
        child: Container(
          height: 40,
          decoration: BoxDecoration(
            border: Border(
              bottom: BorderSide(
                color: Theme.of(context).dividerColor.withValues(alpha: .6),
              ),
            ),
          ),
          clipBehavior: Clip.hardEdge,
          child: Row(
            children: [
              if (leading != null) ...[
                ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 160),
                  child: leading!,
                ),
                const SizedBox(width: 6),
              ],
              if (search != null)
                Flexible(
                  flex: 3,
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 256),
                    child: search!,
                  ),
                )
              else
                const Spacer(),
              if (filters != null)
                _FiltersMenu(content: filters!, count: filterCount),
              if (!compact)
                for (final action in actions) _IconAction(action: action),
              if (menuActions.isNotEmpty)
                PopupMenuButton<ActionBarAction>(
                  tooltip: 'More actions',
                  icon: const Icon(Icons.more_horiz, size: 18),
                  onSelected: (action) => action.onPressed?.call(),
                  itemBuilder: (context) => menuActions
                      .map(
                        (action) => PopupMenuItem<ActionBarAction>(
                          value: action,
                          enabled: !action.disabled,
                          child: Row(
                            children: [
                              Icon(action.icon, size: 18),
                              const SizedBox(width: 8),
                              Text(action.label),
                            ],
                          ),
                        ),
                      )
                      .toList(),
                ),
              const SizedBox(width: 4),
              primary,
            ],
          ),
        ),
      );
    },
  );
}

@immutable
class ActionBarAction {
  const ActionBarAction({
    required this.label,
    required this.icon,
    this.onPressed,
    this.disabled = false,
  });

  final String label;
  final IconData icon;
  final VoidCallback? onPressed;
  final bool disabled;
}

class _IconAction extends StatelessWidget {
  const _IconAction({required this.action});

  final ActionBarAction action;

  @override
  Widget build(BuildContext context) => IconButton(
    tooltip: action.label,
    onPressed: action.disabled ? null : action.onPressed,
    icon: Icon(action.icon, size: 18),
    constraints: const BoxConstraints.tightFor(width: 32, height: 32),
    padding: EdgeInsets.zero,
  );
}

class _FiltersMenu extends StatelessWidget {
  const _FiltersMenu({required this.content, required this.count});

  final Widget content;
  final int count;

  @override
  Widget build(BuildContext context) => MenuAnchor(
    menuChildren: [SizedBox(width: 288, child: content)],
    builder: (context, controller, child) => TextButton.icon(
      onPressed: () =>
          controller.isOpen ? controller.close() : controller.open(),
      icon: const Icon(Icons.tune, size: 18),
      label: Text(count > 0 ? 'Filters ($count)' : 'Filters'),
    ),
  );
}
