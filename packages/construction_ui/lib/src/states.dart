import 'package:flutter/material.dart';

/// Skeleton for initial data loading (STATE-01).
class ConstructionLoadingState extends StatelessWidget {
  const ConstructionLoadingState({this.rows = 4, super.key});

  final int rows;

  @override
  Widget build(BuildContext context) => Semantics(
    label: 'Loading',
    liveRegion: true,
    child: Column(
      children: List.generate(
        rows,
        (index) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Row(
            children: [
              for (var cell = 0; cell < 4; cell++)
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: Container(
                      height: index == 0 ? 20 : 28,
                      decoration: BoxDecoration(
                        color: Theme.of(context)
                            .colorScheme
                            .surfaceContainerHighest,
                        borderRadius: BorderRadius.circular(6),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    ),
  );
}

/// Canonical nothing-yet / no-filter-results state (STATE-01/02, BP-01).
class ConstructionEmptyState extends StatelessWidget {
  const ConstructionEmptyState({
    required this.title,
    this.hint,
    this.filteredHint,
    this.filtered = false,
    this.icon = Icons.inbox_outlined,
    this.action,
    super.key,
  });

  final String title;
  final String? hint;
  final String? filteredHint;
  final bool filtered;
  final IconData icon;
  final Widget? action;

  @override
  Widget build(BuildContext context) => ConstructionBlueprintGrid(
    color: Theme.of(context).colorScheme.outlineVariant,
    child: Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 40),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface.withValues(alpha: .5),
        border: Border.all(
          color: Theme.of(context).dividerColor.withValues(alpha: .6),
          style: BorderStyle.solid,
        ),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            icon,
            size: 40,
            color: Theme.of(context).colorScheme.onSurfaceVariant
                .withValues(alpha: .4),
          ),
          const SizedBox(height: 12),
          Text(
            title,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleSmall,
          ),
          if ((filtered
                  ? filteredHint ??
                        'Try adjusting your search or active filters.'
                  : hint) !=
              null) ...[
            const SizedBox(height: 6),
            Text(
              filtered
                  ? filteredHint ??
                        'Try adjusting your search or active filters.'
                  : hint!,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          ],
          if (action != null) ...[const SizedBox(height: 12), action!],
        ],
      ),
    ),
  );
}

/// Friendly, retryable query error (STATE-01). Raw exception text is not shown.
class ConstructionErrorState extends StatelessWidget {
  const ConstructionErrorState({required this.entity, this.onRetry, super.key});

  final String entity;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Semantics(
      liveRegion: true,
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.error_outline, color: theme.colorScheme.error),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Could not load $entity',
                      style: theme.textTheme.titleSmall,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Check your connection, then try again.',
                      style: theme.textTheme.bodySmall,
                    ),
                    if (onRetry != null) ...[
                      const SizedBox(height: 8),
                      TextButton.icon(
                        onPressed: onRetry,
                        icon: const Icon(Icons.refresh, size: 18),
                        label: const Text('Retry'),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// A reusable loading/error/empty/data boundary for query-driven views.
class ConstructionQueryState<T> extends StatelessWidget {
  const ConstructionQueryState({
    required this.entity,
    required this.isLoading,
    required this.hasError,
    required this.isEmpty,
    required this.data,
    this.onRetry,
    this.emptyTitle,
    this.emptyHint,
    this.filtered = false,
    super.key,
  });

  final String entity;
  final bool isLoading;
  final bool hasError;
  final bool isEmpty;
  final Widget data;
  final VoidCallback? onRetry;
  final String? emptyTitle;
  final String? emptyHint;
  final bool filtered;

  @override
  Widget build(BuildContext context) {
    if (isLoading) return const ConstructionLoadingState();
    if (hasError) {
      return ConstructionErrorState(entity: entity, onRetry: onRetry);
    }
    if (isEmpty) {
      return ConstructionEmptyState(
        title: emptyTitle ?? 'No $entity yet',
        hint: emptyHint,
        filtered: filtered,
      );
    }
    return data;
  }
}

/// Decorative 32px drafting grid for empty surfaces (BP-01/03).
class ConstructionBlueprintGrid extends StatelessWidget {
  const ConstructionBlueprintGrid({
    required this.color,
    required this.child,
    super.key,
  });

  final Color color;
  final Widget child;

  @override
  Widget build(BuildContext context) => IgnorePointer(
    child: ExcludeSemantics(
      child: CustomPaint(painter: _BlueprintGridPainter(color), child: child),
    ),
  );
}

class _BlueprintGridPainter extends CustomPainter {
  const _BlueprintGridPainter(this.color);

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color.withValues(alpha: .12)
      ..strokeWidth = 1;
    for (double x = 0; x <= size.width; x += 32) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), paint);
    }
    for (double y = 0; y <= size.height; y += 32) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), paint);
    }
  }

  @override
  bool shouldRepaint(covariant _BlueprintGridPainter oldDelegate) =>
      color != oldDelegate.color;
}
