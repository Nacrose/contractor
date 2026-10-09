import 'package:flutter/material.dart';

import 'states.dart';

/// Headless table surface (TABLE-01, PAGE-03).
///
/// Search, filters, export, selection actions, and pagination belong to the
/// surrounding page and its [ActionBar]. This component only presents the
/// supplied columns and rows; it has no persistence or domain calculations.
class ConstructionTable<T> extends StatelessWidget {
  const ConstructionTable({
    required this.columns,
    required this.rows,
    this.isLoading = false,
    this.error = false,
    this.entity = 'records',
    this.onRetry,
    this.isEmpty = false,
    this.emptyTitle,
    this.emptyHint,
    this.filtered = false,
    this.rowKey,
    super.key,
  });

  final List<ConstructionTableColumn<T>> columns;
  final List<T> rows;
  final bool isLoading;
  final bool error;
  final String entity;
  final VoidCallback? onRetry;
  final bool isEmpty;
  final String? emptyTitle;
  final String? emptyHint;
  final bool filtered;
  final String Function(T row)? rowKey;

  @override
  Widget build(BuildContext context) {
    if (isLoading) return const ConstructionLoadingState();
    if (error) return ConstructionErrorState(entity: entity, onRetry: onRetry);
    if (isEmpty || rows.isEmpty) {
      return ConstructionEmptyState(
        title: emptyTitle ?? 'No $entity yet',
        hint: emptyHint,
        filtered: filtered,
      );
    }
    final table = DataTable(
      columns: [
        for (final column in columns)
          DataColumn(
            label: column.header,
            numeric: column.alignment == TextAlign.right,
          ),
      ],
      rows: [
        for (var index = 0; index < rows.length; index++)
          DataRow(
            key: rowKey == null ? null : ValueKey(rowKey!(rows[index])),
            cells: [
              for (final column in columns)
                DataCell(
                  Align(
                    alignment: _alignment(column.alignment),
                    child: column.cellBuilder(rows[index], index),
                  ),
                ),
            ],
          ),
      ],
      headingRowHeight: 40,
      dataRowMinHeight: 40,
      dataRowMaxHeight: 64,
      horizontalMargin: 16,
      columnSpacing: 24,
    );

    return Semantics(
      container: true,
      label: '$entity table',
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: SingleChildScrollView(child: table),
      ),
    );
  }

  Alignment _alignment(TextAlign alignment) => switch (alignment) {
    TextAlign.left ||
    TextAlign.start ||
    TextAlign.justify => Alignment.centerLeft,
    TextAlign.center => Alignment.center,
    TextAlign.right || TextAlign.end => Alignment.centerRight,
  };
}

@immutable
class ConstructionTableColumn<T> {
  const ConstructionTableColumn({
    required this.header,
    required this.cellBuilder,
    this.alignment = TextAlign.left,
  });

  final Widget header;
  final Widget Function(T row, int index) cellBuilder;
  final TextAlign alignment;
}
