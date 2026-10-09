import 'package:flutter/material.dart';

import 'semantic_colors.dart';

/// Shared status vocabulary and tone resolution (STATUS-01/04).
///
/// This map controls presentation only. It does not authorize transitions or
/// infer lifecycle rules; unknown values use a neutral tone.
enum ConstructionStatusTone {
  neutral,
  amber,
  info,
  success,
  destructive,
  muted,
}

ConstructionStatusTone constructionStatusTone(String? status) {
  final value = (status ?? 'draft').trim().toLowerCase();
  if ({
        'submitted',
        'pending',
        'maintenance',
        'revise_resubmit',
        'reported',
        'clarifications_requested',
        'partially_completed',
        'unbilled',
        'stored_on_site',
        'partial',
        'unpaid',
        'exceeds_ipc',
      }.contains(value) ||
      value.startsWith('awaiting_')) {
    return ConstructionStatusTone.amber;
  }
  if ({
        'in_review',
        'in_progress',
        'in_transit',
        'dispatched',
        'checked',
        'partially_paid',
        'partially_received',
        'postponed',
        'info',
      }.contains(value) ||
      value.startsWith('in_')) {
    return ConstructionStatusTone.info;
  }
  if ({
        'approved',
        'active',
        'delivered',
        'released',
        'settled',
        'paid',
        'completed',
        'verified',
        'resolved',
        'finalized',
        'certified',
        'repaired',
        'ok',
        'done',
        'billed',
        'disbursed',
      }.contains(value) ||
      value.startsWith('approved')) {
    return ConstructionStatusTone.success;
  }
  if ({
    'rejected',
    'failed',
    'overdue',
    'expired',
    'defaulted',
    'breakdown',
    'open',
    'disputed',
    'exceeds_boq',
    'uncompleted',
  }.contains(value)) {
    return ConstructionStatusTone.destructive;
  }
  if ({
    'on_hold',
    'cancelled',
    'closed',
    'archived',
    'idle',
    'suspended',
    'returned',
    'ended',
  }.contains(value)) {
    return ConstructionStatusTone.muted;
  }
  return ConstructionStatusTone.neutral;
}

/// Compact semantic status chip (STATUS-01/04).
class StatusBadge extends StatelessWidget {
  const StatusBadge({
    required this.status,
    this.label,
    this.showIcon = true,
    this.size = StatusBadgeSize.small,
    super.key,
  });

  final String? status;
  final String? label;
  final bool showIcon;
  final StatusBadgeSize size;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.constructionColors;
    final tone = constructionStatusTone(status);
    final foreground = switch (tone) {
      ConstructionStatusTone.amber => colors.amber,
      ConstructionStatusTone.info => colors.info,
      ConstructionStatusTone.success => colors.success,
      ConstructionStatusTone.destructive => theme.colorScheme.error,
      ConstructionStatusTone.muted ||
      ConstructionStatusTone.neutral => colors.neutral,
    };
    final text = label ?? _sentenceCase(status ?? 'draft');
    final compact = size == StatusBadgeSize.small;
    return Semantics(
      label: 'Status: $text',
      child: Container(
        padding: EdgeInsets.symmetric(
          horizontal: compact ? 8 : 10,
          vertical: compact ? 3 : 5,
        ),
        decoration: BoxDecoration(
          color: foreground.withValues(alpha: .10),
          border: Border.all(color: foreground.withValues(alpha: .25)),
          borderRadius: BorderRadius.circular(999),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (showIcon) ...[
              Icon(
                _statusIcon(tone),
                size: compact ? 12 : 14,
                color: foreground,
              ),
              const SizedBox(width: 4),
            ],
            Text(
              text,
              style:
                  (compact
                          ? theme.textTheme.labelSmall
                          : theme.textTheme.labelMedium)
                      ?.copyWith(
                        color: foreground,
                        fontWeight: FontWeight.w600,
                      ),
            ),
          ],
        ),
      ),
    );
  }
}

enum StatusBadgeSize { small, medium }

IconData _statusIcon(ConstructionStatusTone tone) => switch (tone) {
  ConstructionStatusTone.amber => Icons.schedule,
  ConstructionStatusTone.info => Icons.verified_user_outlined,
  ConstructionStatusTone.success => Icons.check_circle_outline,
  ConstructionStatusTone.destructive => Icons.cancel_outlined,
  ConstructionStatusTone.neutral => Icons.description_outlined,
  ConstructionStatusTone.muted => Icons.block_outlined,
};

String _sentenceCase(String value) => value
    .split('_')
    .where((part) => part.isNotEmpty)
    .map((part) => '${part[0].toUpperCase()}${part.substring(1)}')
    .join(' ');
