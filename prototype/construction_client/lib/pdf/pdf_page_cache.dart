import 'dart:async';
import 'package:flutter/material.dart';
import 'pdf_document_model.dart';

/// Telemetry metrics for bounded PDF page cache
class PdfCacheTelemetry {
  final int totalPages;
  final int cachedPagesCount;
  final int maxCacheCapacity;
  final int cacheHits;
  final int cacheMisses;
  final int evictionsCount;
  final double lastDecodeTimeMs;

  const PdfCacheTelemetry({
    required this.totalPages,
    required this.cachedPagesCount,
    required this.maxCacheCapacity,
    required this.cacheHits,
    required this.cacheMisses,
    required this.evictionsCount,
    required this.lastDecodeTimeMs,
  });

  double get hitRate => (cacheHits + cacheMisses) > 0 ? (cacheHits / (cacheHits + cacheMisses)) * 100 : 0.0;
}

/// Bounded LRU Decoded-Page Cache with explicit disposal and lazy decoding (M01-T06)
class BoundedPdfPageCache {
  final int totalPages;
  final int maxCapacity;

  // LRU linked map: key is pageIndex
  final Map<int, PdfBlueprintPage> _cache = {};
  final List<int> _lruOrder = [];

  int _cacheHits = 0;
  int _cacheMisses = 0;
  int _evictionsCount = 0;
  double _lastDecodeTimeMs = 0.0;

  BoundedPdfPageCache({
    this.totalPages = 120, // 100+ page civil package fixture
    this.maxCapacity = 5,   // Strictly bounded decoded-page ceiling
  });

  PdfCacheTelemetry get telemetry => PdfCacheTelemetry(
    totalPages: totalPages,
    cachedPagesCount: _cache.length,
    maxCacheCapacity: maxCapacity,
    cacheHits: _cacheHits,
    cacheMisses: _cacheMisses,
    evictionsCount: _evictionsCount,
    lastDecodeTimeMs: _lastDecodeTimeMs,
  );

  bool isCached(int pageIndex) => _cache.containsKey(pageIndex);

  /// Retrieves a page from cache or lazy-decodes it with bounded eviction
  Future<PdfBlueprintPage> getOrDecodePage(int pageIndex) async {
    if (pageIndex < 0 || pageIndex >= totalPages) {
      throw RangeError('pageIndex $pageIndex out of range [0, $totalPages)');
    }

    if (_cache.containsKey(pageIndex)) {
      _cacheHits++;
      // Move to back of LRU order
      _lruOrder.remove(pageIndex);
      _lruOrder.add(pageIndex);
      _lastDecodeTimeMs = 0.05; // Instantaneous warm hit
      return _cache[pageIndex]!;
    }

    // Cache miss: execute on-demand decode
    _cacheMisses++;
    final stopwatch = Stopwatch()..start();

    // Decode page elements deterministically
    final page = _decodePageSynthetically(pageIndex);

    stopwatch.stop();
    _lastDecodeTimeMs = stopwatch.elapsedMicroseconds / 1000.0;

    // Enforce bounded cache capacity (LRU Eviction)
    if (_cache.length >= maxCapacity) {
      final victimIndex = _lruOrder.removeAt(0);
      final victimPage = _cache.remove(victimIndex);
      if (victimPage != null) {
        victimPage.dispose(); // Explicit disposal (v3 §6 M01)
        _evictionsCount++;
      }
    }

    _cache[pageIndex] = page;
    _lruOrder.add(pageIndex);

    return page;
  }

  /// Synthetically decodes a dense structural blueprint page
  PdfBlueprintPage _decodePageSynthetically(int pageIndex) {
    final elements = <PdfVectorElement>[];

    // Page outer & inner border
    elements.add(const PdfVectorElement(
      id: 'border_outer',
      type: 'rect',
      bounds: Rect.fromLTWH(10, 10, 400, 277),
      strokeColor: Colors.white,
      strokeWidth: 1.5,
    ));
    elements.add(const PdfVectorElement(
      id: 'border_inner',
      type: 'rect',
      bounds: Rect.fromLTWH(15, 15, 390, 267),
      strokeColor: Color(0xFF64748B),
      strokeWidth: 0.5,
    ));

    // Title Block Header
    elements.add(PdfVectorElement(
      id: 'title_text',
      type: 'text',
      bounds: const Rect.fromLTWH(260, 240, 140, 14),
      text: 'KATHMANDU METRO DEPOT — SHEET ${pageIndex + 1} OF $totalPages',
      strokeColor: const Color(0xFF06B6D4),
      fontSize: 10,
    ));
    elements.add(PdfVectorElement(
      id: 'meta_text',
      type: 'text',
      bounds: const Rect.fromLTWH(260, 255, 140, 10),
      text: 'SCALE: 1:100 | STR-DWG-${pageIndex + 101} | REV 2',
      strokeColor: const Color(0xFF94A3B8),
      fontSize: 8,
    ));

    // Column Grid Lines
    for (int col = 0; col < 6; col++) {
      final x = 40.0 + col * 40.0;
      elements.add(PdfVectorElement(
        id: 'grid_col_$col',
        type: 'line',
        start: Offset(x, 30),
        end: Offset(x, 230),
        strokeColor: const Color(0xFF334155),
        strokeWidth: 0.5,
      ));
    }
    for (int row = 0; row < 5; row++) {
      final y = 40.0 + row * 40.0;
      elements.add(PdfVectorElement(
        id: 'grid_row_$row',
        type: 'line',
        start: Offset(30, y),
        end: Offset(250, y),
        strokeColor: const Color(0xFF334155),
        strokeWidth: 0.5,
      ));
    }

    // Structural Concrete Footings & Foundation Walls
    for (int col = 0; col < 5; col++) {
      for (int row = 0; row < 4; row++) {
        final cx = 40.0 + col * 40.0 + 20.0;
        final cy = 40.0 + row * 40.0 + 20.0;
        elements.add(PdfVectorElement(
          id: 'footing_${col}_$row',
          type: 'rect',
          bounds: Rect.fromCenter(center: Offset(cx, cy), width: 22, height: 22),
          strokeColor: const Color(0xFF10B981),
          fillColor: const Color(0xFF10B981).withValues(alpha: 0.15),
          strokeWidth: 1.0,
        ));
      }
    }

    // Reinforcement detail polyline
    elements.add(const PdfVectorElement(
      id: 'rebar_perimeter',
      type: 'polygon',
      points: [
        Offset(50, 50),
        Offset(230, 50),
        Offset(230, 210),
        Offset(50, 210),
      ],
      strokeColor: Color(0xFFF59E0B),
      strokeWidth: 1.2,
    ));

    return PdfBlueprintPage(
      pageIndex: pageIndex,
      pageTitle: 'Sheet ${pageIndex + 1}: Foundation & Rebar Plan',
      pageSize: PdfPageSize.a3,
      scaleRatio: 100.0,
      elements: elements,
    );
  }

  void clear() {
    for (final page in _cache.values) {
      page.dispose();
    }
    _cache.clear();
    _lruOrder.clear();
  }
}
