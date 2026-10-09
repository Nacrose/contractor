import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'pdf_document_model.dart';
import 'pdf_page_cache.dart';

/// Interactive PDF Blueprint Measurement & Takeoff Viewport (M01-T06)
class PdfViewport extends StatefulWidget {
  final int totalPages;
  final int maxCachePages;

  const PdfViewport({
    super.key,
    this.totalPages = 120, // 100+ page civil blueprint package
    this.maxCachePages = 5,
  });

  @override
  State<PdfViewport> createState() => _PdfViewportState();
}

class _PdfViewportState extends State<PdfViewport> {
  late final BoundedPdfPageCache _cache;
  int _currentPageIndex = 0;
  PdfBlueprintPage? _currentPage;
  bool _isLoadingPage = false;

  // Canvas Viewport transform
  Offset _pan = const Offset(60, 40);
  double _zoom = 1.8;

  // Active Takeoff Tool Mode: 'none', 'distance', 'area'
  String _activeTool = 'distance';
  final List<TakeoffMeasurement> _measurements = [];
  final List<Offset> _inProgressPoints = [];

  @override
  void initState() {
    super.initState();
    _cache = BoundedPdfPageCache(
      totalPages: widget.totalPages,
      maxCapacity: widget.maxCachePages,
    );
    _loadPage(_currentPageIndex);
  }

  Future<void> _loadPage(int pageIndex) async {
    setState(() => _isLoadingPage = true);
    final page = await _cache.getOrDecodePage(pageIndex);
    if (mounted) {
      setState(() {
        _currentPageIndex = pageIndex;
        _currentPage = page;
        _isLoadingPage = false;
        _inProgressPoints.clear();
      });
    }
  }

  void _nextPage() {
    if (_currentPageIndex < widget.totalPages - 1) {
      _loadPage(_currentPageIndex + 1);
    }
  }

  void _prevPage() {
    if (_currentPageIndex > 0) {
      _loadPage(_currentPageIndex - 1);
    }
  }

  void _handleCanvasTap(Offset localPos) {
    // Transform screen position to page coordinates (mm)
    final pagePos = (localPos - _pan) / _zoom;

    if (_activeTool == 'distance') {
      if (_inProgressPoints.isEmpty) {
        setState(() => _inProgressPoints.add(pagePos));
      } else {
        final start = _inProgressPoints.first;
        final end = pagePos;
        // In A3 page coords: 1 unit = 1 mm. With 1:100 scale, 1 mm = 100 mm = 0.1 m.
        final distMm = (end - start).distance;
        final distMeters = (distMm * (_currentPage?.scaleRatio ?? 100.0)) / 1000.0;

        final measurement = TakeoffMeasurement(
          id: 'meas_${DateTime.now().millisecondsSinceEpoch}',
          pageIndex: _currentPageIndex,
          type: TakeoffType.distance,
          points: [start, end],
          measuredValue: distMeters,
          label: '${distMeters.toStringAsFixed(2)} m',
          color: const Color(0xFFF59E0B),
        );

        setState(() {
          _measurements.add(measurement);
          _inProgressPoints.clear();
        });
      }
    } else if (_activeTool == 'area') {
      if (_inProgressPoints.length >= 2 && (pagePos - _inProgressPoints.first).distance < 15.0) {
        // Closed polygon: compute area via Shoelace formula
        final areaSqMeters = _calculatePolygonArea(_inProgressPoints, _currentPage?.scaleRatio ?? 100.0);
        final measurement = TakeoffMeasurement(
          id: 'area_${DateTime.now().millisecondsSinceEpoch}',
          pageIndex: _currentPageIndex,
          type: TakeoffType.area,
          points: List.from(_inProgressPoints),
          measuredValue: areaSqMeters,
          label: '${areaSqMeters.toStringAsFixed(2)} m²',
          color: const Color(0xFF10B981),
        );

        setState(() {
          _measurements.add(measurement);
          _inProgressPoints.clear();
        });
      } else {
        setState(() => _inProgressPoints.add(pagePos));
      }
    }
  }

  double _calculatePolygonArea(List<Offset> pts, double scaleRatio) {
    if (pts.length < 3) return 0.0;
    double sum = 0.0;
    for (int i = 0; i < pts.length; i++) {
      final p1 = pts[i];
      final p2 = pts[(i + 1) % pts.length];
      sum += (p1.dx * p2.dy) - (p2.dx * p1.dy);
    }
    final areaSqMm = (sum.abs() / 2.0);
    // Convert mm² to m²: (1 mm * scaleRatio = scaleRatio mm = scaleRatio / 1000 m)
    final meterPerMm = scaleRatio / 1000.0;
    return areaSqMm * meterPerMm * meterPerMm;
  }

  @override
  Widget build(BuildContext context) {
    final telemetry = _cache.telemetry;

    return Container(
      color: const Color(0xFF0F172A),
      child: Column(
        children: [
          // 1. Blueprint Navigation & Takeoff Tool Header
          _buildToolbar(telemetry),

          // 2. Main Page Surface with Left Thumbnail Ribbon
          Expanded(
            child: Row(
              children: [
                // Page List Ribbon
                _buildPageRibbon(),

                // Canvas Area
                Expanded(
                  child: Stack(
                    children: [
                      Listener(
                        onPointerSignal: (pointerSignal) {
                          if (pointerSignal is PointerScrollEvent) {
                            setState(() {
                              final factor = pointerSignal.scrollDelta.dy < 0 ? 1.15 : 0.85;
                              _zoom = (_zoom * factor).clamp(0.4, 10.0);
                            });
                          }
                        },
                        child: GestureDetector(
                          onPanUpdate: (d) => setState(() => _pan += d.delta),
                          onTapDown: (d) => _handleCanvasTap(d.localPosition),
                          child: Container(
                            color: const Color(0xFF0B132B),
                            child: ClipRect(
                              child: CustomPaint(
                                size: Size.infinite,
                                painter: _PdfPagePainter(
                                  page: _currentPage,
                                  pan: _pan,
                                  zoom: _zoom,
                                  measurements: _measurements.where((m) => m.pageIndex == _currentPageIndex).toList(),
                                  inProgressPoints: _inProgressPoints,
                                  activeTool: _activeTool,
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),

                      if (_isLoadingPage)
                        const Center(
                          child: CircularProgressIndicator(color: Color(0xFF06B6D4)),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          // 3. Cache Telemetry & Takeoff HUD Footer
          _buildFooterHud(telemetry),
        ],
      ),
    );
  }

  Widget _buildToolbar(PdfCacheTelemetry telemetry) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      color: const Color(0xFF1E293B),
      child: Wrap(
        spacing: 12,
        runSpacing: 6,
        crossAxisAlignment: WrapCrossAlignment.center,
        alignment: WrapAlignment.spaceBetween,
        children: [
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.picture_as_pdf, color: Color(0xFFEF4444), size: 20),
              const SizedBox(width: 8),
              Text(
                'PDF Blueprint Viewport (${widget.totalPages} Pages)',
                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: Colors.white),
              ),
              const SizedBox(width: 14),
              // Page step buttons
              IconButton(
                icon: const Icon(Icons.chevron_left, size: 20),
                onPressed: _currentPageIndex > 0 ? _prevPage : null,
                tooltip: 'Previous Page',
              ),
              Text('Sheet ${_currentPageIndex + 1} of ${widget.totalPages}',
                  style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF06B6D4))),
              IconButton(
                icon: const Icon(Icons.chevron_right, size: 20),
                onPressed: _currentPageIndex < widget.totalPages - 1 ? _nextPage : null,
                tooltip: 'Next Page',
              ),
            ],
          ),

          // Takeoff Tools Selector
          Wrap(
            spacing: 6,
            runSpacing: 4,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              const Text('Takeoff Mode: ', style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8))),
              ChoiceChip(
                label: const Text('Distance Ruler', style: TextStyle(fontSize: 11)),
                selected: _activeTool == 'distance',
                selectedColor: const Color(0xFFF59E0B).withValues(alpha: 0.3),
                onSelected: (val) => setState(() {
                  _activeTool = 'distance';
                  _inProgressPoints.clear();
                }),
              ),
              ChoiceChip(
                label: const Text('Polygon Area', style: TextStyle(fontSize: 11)),
                selected: _activeTool == 'area',
                selectedColor: const Color(0xFF10B981).withValues(alpha: 0.3),
                onSelected: (val) => setState(() {
                  _activeTool = 'area';
                  _inProgressPoints.clear();
                }),
              ),
              OutlinedButton(
                onPressed: () => setState(() {
                  _measurements.removeWhere((m) => m.pageIndex == _currentPageIndex);
                  _inProgressPoints.clear();
                }),
                style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2)),
                child: const Text('Clear Takeoffs', style: TextStyle(fontSize: 11)),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildPageRibbon() {
    return Container(
      width: 80,
      color: const Color(0xFF0F172A),
      child: ListView.builder(
        itemCount: widget.totalPages,
        itemBuilder: (context, index) {
          final isSelected = index == _currentPageIndex;
          final isCached = _cache.isCached(index);

          return InkWell(
            onTap: () => _loadPage(index),
            child: Container(
              margin: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
              padding: const EdgeInsets.symmetric(vertical: 8),
              decoration: BoxDecoration(
                color: isSelected ? const Color(0xFF06B6D4).withValues(alpha: 0.2) : const Color(0xFF1E293B),
                borderRadius: BorderRadius.circular(6),
                border: Border.all(
                  color: isSelected ? const Color(0xFF06B6D4) : (isCached ? const Color(0xFF10B981) : const Color(0xFF334155)),
                  width: isSelected ? 1.5 : 1.0,
                ),
              ),
              child: Column(
                children: [
                  Icon(
                    Icons.description_outlined,
                    color: isSelected ? const Color(0xFF06B6D4) : (isCached ? const Color(0xFF10B981) : const Color(0xFF64748B)),
                    size: 20,
                  ),
                  const SizedBox(height: 4),
                  Text('P.${index + 1}', style: const TextStyle(fontSize: 10, color: Colors.white)),
                  if (isCached)
                    const Text('CACHED', style: TextStyle(fontSize: 8, color: Color(0xFF10B981), fontWeight: FontWeight.bold)),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildFooterHud(PdfCacheTelemetry telemetry) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
      color: const Color(0xFF0B132B),
      child: Wrap(
        spacing: 16,
        runSpacing: 4,
        alignment: WrapAlignment.spaceBetween,
        children: [
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('LRU Cache: ${telemetry.cachedPagesCount} / ${telemetry.maxCacheCapacity} Pages',
                  style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF06B6D4))),
              const SizedBox(width: 14),
              Text('Hits: ${telemetry.cacheHits} | Misses: ${telemetry.cacheMisses} | Evicted: ${telemetry.evictionsCount}',
                  style: const TextStyle(fontSize: 11, color: Color(0xFF94A3B8))),
            ],
          ),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('Decode Latency: ${telemetry.lastDecodeTimeMs.toStringAsFixed(2)} ms',
                  style: const TextStyle(fontSize: 11, color: Color(0xFF10B981))),
              const SizedBox(width: 14),
              Text('Takeoff Measurements: ${_measurements.where((m) => m.pageIndex == _currentPageIndex).length}',
                  style: const TextStyle(fontSize: 11, color: Color(0xFFF59E0B))),
            ],
          ),
        ],
      ),
    );
  }
}

/// Canvas Painter for Blueprint PDF Page and Takeoff Overlays
class _PdfPagePainter extends CustomPainter {
  final PdfBlueprintPage? page;
  final Offset pan;
  final double zoom;
  final List<TakeoffMeasurement> measurements;
  final List<Offset> inProgressPoints;
  final String activeTool;

  _PdfPagePainter({
    required this.page,
    required this.pan,
    required this.zoom,
    required this.measurements,
    required this.inProgressPoints,
    required this.activeTool,
  });

  @override
  void paint(Canvas canvas, Size size) {
    if (page == null) return;

    canvas.save();
    canvas.translate(pan.dx, pan.dy);
    canvas.scale(zoom);

    // 1. Draw Page Sheet Backdrop (A3: 420mm x 297mm)
    final pageRect = Rect.fromLTWH(0, 0, page!.dimensions.width, page!.dimensions.height);
    final pageBgPaint = Paint()..color = const Color(0xFF020617); // Dark sheet background
    canvas.drawRect(pageRect, pageBgPaint);

    final borderPaint = Paint()
      ..color = const Color(0xFF334155)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 0.5;
    canvas.drawRect(pageRect, borderPaint);

    // 2. Render Page Vector Elements
    final baseStrokePaint = Paint()
      ..isAntiAlias = true
      ..style = PaintingStyle.stroke;

    for (final el in page!.elements) {
      baseStrokePaint.color = el.strokeColor;
      baseStrokePaint.strokeWidth = el.strokeWidth;

      if (el.type == 'rect' && el.bounds != null) {
        if (el.fillColor != null) {
          final fillPaint = Paint()..color = el.fillColor!;
          canvas.drawRect(el.bounds!, fillPaint);
        }
        canvas.drawRect(el.bounds!, baseStrokePaint);
      } else if (el.type == 'line' && el.start != null && el.end != null) {
        canvas.drawLine(el.start!, el.end!, baseStrokePaint);
      } else if (el.type == 'polygon' && el.points != null && el.points!.isNotEmpty) {
        final path = Path()..moveTo(el.points!.first.dx, el.points!.first.dy);
        for (int i = 1; i < el.points!.length; i++) {
          path.lineTo(el.points![i].dx, el.points![i].dy);
        }
        path.close();
        canvas.drawPath(path, baseStrokePaint);
      } else if (el.type == 'text' && el.bounds != null && el.text != null) {
        final span = TextSpan(
          text: el.text!,
          style: TextStyle(color: el.strokeColor, fontSize: el.fontSize ?? 10, fontFamily: 'monospace'),
        );
        final tp = TextPainter(text: span, textDirection: TextDirection.ltr)..layout();
        tp.paint(canvas, el.bounds!.topLeft);
      }
    }

    // 3. Render Committed Takeoff Measurements
    for (final m in measurements) {
      final measPaint = Paint()
        ..color = m.color
        ..strokeWidth = 2.0 / zoom
        ..style = PaintingStyle.stroke;

      if (m.type == TakeoffType.distance && m.points.length >= 2) {
        final p1 = m.points[0];
        final p2 = m.points[1];
        canvas.drawLine(p1, p2, measPaint);
        canvas.drawCircle(p1, 3.0 / zoom, measPaint..style = PaintingStyle.fill);
        canvas.drawCircle(p2, 3.0 / zoom, measPaint..style = PaintingStyle.fill);

        // Distance Text tag
        final mid = Offset((p1.dx + p2.dx) / 2, (p1.dy + p2.dy) / 2);
        _drawTag(canvas, mid, m.label, m.color);
      } else if (m.type == TakeoffType.area && m.points.length >= 3) {
        final path = Path()..moveTo(m.points[0].dx, m.points[0].dy);
        for (int i = 1; i < m.points.length; i++) {
          path.lineTo(m.points[i].dx, m.points[i].dy);
        }
        path.close();

        // Fill polygon
        final fillPaint = Paint()..color = m.color.withValues(alpha: 0.25);
        canvas.drawPath(path, fillPaint);
        canvas.drawPath(path, measPaint);

        // Center tag
        final centroid = _computeCentroid(m.points);
        _drawTag(canvas, centroid, m.label, m.color);
      }
    }

    // 4. Render In-Progress Takeoff Lines
    if (inProgressPoints.isNotEmpty) {
      final activePaint = Paint()
        ..color = const Color(0xFFF59E0B)
        ..strokeWidth = 1.5 / zoom
        ..style = PaintingStyle.stroke;

      for (int i = 0; i < inProgressPoints.length; i++) {
        canvas.drawCircle(inProgressPoints[i], 3.0 / zoom, activePaint..style = PaintingStyle.fill);
        if (i < inProgressPoints.length - 1) {
          canvas.drawLine(inProgressPoints[i], inProgressPoints[i + 1], activePaint);
        }
      }
    }

    canvas.restore();
  }

  void _drawTag(Canvas canvas, Offset pos, String text, Color color) {
    final span = TextSpan(
      text: text,
      style: TextStyle(color: Colors.white, fontSize: 10 / zoom, fontWeight: FontWeight.bold),
    );
    final tp = TextPainter(text: span, textDirection: TextDirection.ltr)..layout();
    final bgRect = Rect.fromCenter(center: pos, width: tp.width + (8 / zoom), height: tp.height + (4 / zoom));
    canvas.drawRRect(RRect.fromRectAndRadius(bgRect, Radius.circular(3 / zoom)), Paint()..color = const Color(0xFF1E293B));
    canvas.drawRRect(RRect.fromRectAndRadius(bgRect, Radius.circular(3 / zoom)), Paint()..color = color..style = PaintingStyle.stroke..strokeWidth = 1 / zoom);
    tp.paint(canvas, Offset(pos.dx - tp.width / 2, pos.dy - tp.height / 2));
  }

  Offset _computeCentroid(List<Offset> pts) {
    double sumX = 0;
    double sumY = 0;
    for (final p in pts) {
      sumX += p.dx;
      sumY += p.dy;
    }
    return Offset(sumX / pts.length, sumY / pts.length);
  }

  @override
  bool shouldRepaint(covariant _PdfPagePainter oldDelegate) {
    return oldDelegate.page != page ||
        oldDelegate.pan != pan ||
        oldDelegate.zoom != zoom ||
        oldDelegate.measurements != measurements ||
        oldDelegate.inProgressPoints != inProgressPoints ||
        oldDelegate.activeTool != activeTool;
  }
}
