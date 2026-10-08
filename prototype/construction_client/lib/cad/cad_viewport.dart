import 'dart:math' as math;
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'cad_geometry.dart';
import 'cad_spatial_index.dart';
import 'cad_fixture_loader.dart';

/// Interactive CAD Viewport Prototype (M01-T05)
class CadViewport extends StatefulWidget {
  final List<CadEntity>? initialEntities;

  const CadViewport({
    super.key,
    this.initialEntities,
  });

  @override
  State<CadViewport> createState() => _CadViewportState();
}

class _CadViewportState extends State<CadViewport> {
  final CadSpatialIndex _spatialIndex = CadSpatialIndex(cellSize: 150.0);
  final Set<String> _visibleLayers = {'WALLS', 'DOORS', 'WINDOWS', 'COLUMNS', 'GRID', 'ANNOTATIONS'};

  Offset _pan = const Offset(120, 80);
  double _zoom = 0.65; // World units to screen pixels
  Offset? _cursorScreenPos;
  SnapPoint? _activeSnap;
  CadEntity? _selectedEntity;

  // Performance telemetry
  double _lastFrameMs = 0.0;
  int _renderedEntityCount = 0;
  bool _isDenseMode = false;

  @override
  void initState() {
    super.initState();
    _loadEntities(widget.initialEntities ?? CadFixtureLoader.loadStandardSitePlan());
  }

  void _loadEntities(List<CadEntity> entities) {
    _spatialIndex.clear();
    _spatialIndex.insertAll(entities);
    setState(() {
      _selectedEntity = null;
      _activeSnap = null;
    });
  }

  void _toggleDenseMode() {
    setState(() => _isDenseMode = !_isDenseMode);
    if (_isDenseMode) {
      _loadEntities(CadFixtureLoader.generateDenseCadDrawing(densityMultiplier: 8));
    } else {
      _loadEntities(CadFixtureLoader.loadStandardSitePlan());
    }
  }

  Offset _screenToWorld(Offset screenPos) {
    return (screenPos - _pan) / _zoom;
  }

  void _zoomToExtents(Size viewportSize) {
    final bounds = _spatialIndex.computeTotalBounds();
    if (bounds.isEmpty) return;

    final padding = 60.0;
    final scaleX = (viewportSize.width - padding * 2) / bounds.width;
    final scaleY = (viewportSize.height - padding * 2) / bounds.height;
    final newZoom = math.min(scaleX, scaleY).clamp(0.1, 5.0);

    final centerWorld = bounds.center;
    final centerScreen = Offset(viewportSize.width / 2, viewportSize.height / 2);
    final newPan = centerScreen - (centerWorld * newZoom);

    setState(() {
      _zoom = newZoom;
      _pan = newPan;
      _activeSnap = null;
    });
  }

  void _handlePointerHover(PointerHoverEvent event) {
    final screenPos = event.localPosition;
    final worldPos = _screenToWorld(screenPos);
    final snapToleranceWorld = 14.0 / _zoom; // 14 pixels in screen space

    final nearestSnap = _spatialIndex.findNearestSnap(worldPos, snapToleranceWorld);

    setState(() {
      _cursorScreenPos = screenPos;
      _activeSnap = nearestSnap;
    });
  }

  void _handleTapDown(TapDownDetails details) {
    final screenPos = details.localPosition;
    final worldPos = _screenToWorld(screenPos);
    final pickToleranceWorld = 10.0 / _zoom;

    final picked = _spatialIndex.pickEntity(worldPos, pickToleranceWorld);
    setState(() {
      _selectedEntity = picked;
    });
  }

  void _handlePanUpdate(DragUpdateDetails details) {
    setState(() {
      _pan += details.delta;
      _cursorScreenPos = details.localPosition;
      _activeSnap = null;
    });
  }

  void _handleScroll(PointerScrollEvent event) {
    final zoomFactor = event.scrollDelta.dy < 0 ? 1.15 : 0.85;
    final newZoom = (_zoom * zoomFactor).clamp(0.05, 30.0);

    final focalPointScreen = event.localPosition;
    final focalPointWorld = _screenToWorld(focalPointScreen);
    final newPan = focalPointScreen - (focalPointWorld * newZoom);

    setState(() {
      _zoom = newZoom;
      _pan = newPan;
    });
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final viewportSize = Size(constraints.maxWidth, constraints.maxHeight);

        return Container(
          color: const Color(0xFF090D16), // Dark CAD backdrop
          child: Column(
            children: [
              // 1. CAD Viewport Control Toolbar
              _buildToolbar(viewportSize),

              // 2. Main Interactive Drawing Surface
              Expanded(
                child: Listener(
                  onPointerSignal: (pointerSignal) {
                    if (pointerSignal is PointerScrollEvent) {
                      _handleScroll(pointerSignal);
                    }
                  },
                  onPointerHover: _handlePointerHover,
                  child: GestureDetector(
                    onTapDown: _handleTapDown,
                    onPanUpdate: _handlePanUpdate,
                    child: ClipRect(
                      child: CustomPaint(
                        size: Size.infinite,
                        painter: _CadCanvasPainter(
                          spatialIndex: _spatialIndex,
                          visibleLayers: _visibleLayers,
                          pan: _pan,
                          zoom: _zoom,
                          cursorScreenPos: _cursorScreenPos,
                          activeSnap: _activeSnap,
                          selectedEntity: _selectedEntity,
                          onFrameRendered: (ms, count) {
                            WidgetsBinding.instance.addPostFrameCallback((_) {
                              if (mounted && (_lastFrameMs != ms || _renderedEntityCount != count)) {
                                setState(() {
                                  _lastFrameMs = ms;
                                  _renderedEntityCount = count;
                                });
                              }
                            });
                          },
                        ),
                      ),
                    ),
                  ),
                ),
              ),

              // 3. Entity Inspector & Coordinate HUD
              _buildHudFooter(),
            ],
          ),
        );
      },
    );
  }

  Widget _buildToolbar(Size viewportSize) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      color: const Color(0xFF0F172A),
      child: Wrap(
        spacing: 8,
        runSpacing: 6,
        crossAxisAlignment: WrapCrossAlignment.center,
        alignment: WrapAlignment.spaceBetween,
        children: [
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.architecture, color: Color(0xFF06B6D4), size: 20),
              const SizedBox(width: 8),
              Text(
                'CAD Viewport Prototype (${_spatialIndex.count} Entities)',
                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: Colors.white),
              ),
              const SizedBox(width: 10),
              // Dense benchmark toggle
              ActionChip(
                label: Text(_isDenseMode ? 'Mode: Dense (Bench)' : 'Mode: Standard'),
                backgroundColor: _isDenseMode ? const Color(0xFF7C3AED) : const Color(0xFF1E293B),
                labelStyle: const TextStyle(fontSize: 11, color: Colors.white),
                onPressed: _toggleDenseMode,
              ),
            ],
          ),

          // Layer filter chips
          Wrap(
            spacing: 4,
            runSpacing: 4,
            children: ['WALLS', 'DOORS', 'WINDOWS', 'COLUMNS', 'GRID', 'ANNOTATIONS'].map((layer) {
              final isVisible = _visibleLayers.contains(layer);
              return FilterChip(
                label: Text(layer, style: const TextStyle(fontSize: 10)),
                selected: isVisible,
                selectedColor: const Color(0xFF06B6D4).withValues(alpha: 0.3),
                checkmarkColor: const Color(0xFF06B6D4),
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 0),
                onSelected: (val) {
                  setState(() {
                    if (val) {
                      _visibleLayers.add(layer);
                    } else {
                      _visibleLayers.remove(layer);
                    }
                  });
                },
              );
            }).toList(),
          ),

          // Navigation buttons
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              IconButton(
                icon: const Icon(Icons.zoom_in, size: 20),
                tooltip: 'Zoom In',
                onPressed: () => setState(() => _zoom = (_zoom * 1.25).clamp(0.05, 30.0)),
              ),
              IconButton(
                icon: const Icon(Icons.zoom_out, size: 20),
                tooltip: 'Zoom Out',
                onPressed: () => setState(() => _zoom = (_zoom * 0.8).clamp(0.05, 30.0)),
              ),
              IconButton(
                icon: const Icon(Icons.fit_screen, size: 20),
                tooltip: 'Fit Drawing Extents',
                onPressed: () => _zoomToExtents(viewportSize),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildHudFooter() {
    final worldPos = _cursorScreenPos != null ? _screenToWorld(_cursorScreenPos!) : Offset.zero;
    final snapDesc = _activeSnap != null ? '${_activeSnap!.label} at [${_activeSnap!.position.dx.toStringAsFixed(1)}, ${_activeSnap!.position.dy.toStringAsFixed(1)}]' : 'None';

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
              Text('Coord: (${worldPos.dx.toStringAsFixed(1)}, ${worldPos.dy.toStringAsFixed(1)}) mm',
                  style: const TextStyle(fontSize: 11, fontFamily: 'monospace', color: Color(0xFF94A3B8))),
              const SizedBox(width: 14),
              Text('Snap: $snapDesc',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: _activeSnap != null ? FontWeight.bold : FontWeight.normal,
                    color: _activeSnap != null ? const Color(0xFF10B981) : const Color(0xFF64748B),
                  )),
            ],
          ),

          // Telemetry
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('Rendered: $_renderedEntityCount / ${_spatialIndex.count}',
                  style: const TextStyle(fontSize: 11, color: Color(0xFF94A3B8))),
              const SizedBox(width: 12),
              Text('Frame: ${_lastFrameMs.toStringAsFixed(1)} ms (${(_lastFrameMs > 0 ? (1000 / _lastFrameMs).toStringAsFixed(0) : "60")} fps)',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    color: _lastFrameMs < 16.7 ? const Color(0xFF10B981) : const Color(0xFFF59E0B),
                  )),
            ],
          ),

          // Selected Entity info
          Text(
            _selectedEntity != null
                ? 'Selected: [${_selectedEntity!.layer}] ${_selectedEntity!.id} (${_selectedEntity!.type.name})'
                : 'Selection: None (Click entity to select)',
            style: TextStyle(
              fontSize: 11,
              color: _selectedEntity != null ? const Color(0xFF06B6D4) : const Color(0xFF64748B),
            ),
          ),
        ],
      ),
    );
  }
}

/// CustomPainter executing fast CAD canvas rendering with frustum culling & snap overlays
class _CadCanvasPainter extends CustomPainter {
  final CadSpatialIndex spatialIndex;
  final Set<String> visibleLayers;
  final Offset pan;
  final double zoom;
  final Offset? cursorScreenPos;
  final SnapPoint? activeSnap;
  final CadEntity? selectedEntity;
  final void Function(double ms, int count) onFrameRendered;

  _CadCanvasPainter({
    required this.spatialIndex,
    required this.visibleLayers,
    required this.pan,
    required this.zoom,
    required this.cursorScreenPos,
    required this.activeSnap,
    required this.selectedEntity,
    required this.onFrameRendered,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final stopwatch = Stopwatch()..start();

    // 1. Draw subtle background coordinate grid
    _drawBackgroundGrid(canvas, size);

    // 2. Set up World transform
    canvas.save();
    canvas.translate(pan.dx, pan.dy);
    canvas.scale(zoom);

    // Compute visible bounds in world space (Frustum)
    final worldRect = Rect.fromLTRB(
      -pan.dx / zoom,
      -pan.dy / zoom,
      (size.width - pan.dx) / zoom,
      (size.height - pan.dy) / zoom,
    );

    // Query spatial index for visible entities
    final candidates = spatialIndex.queryRect(worldRect);
    final basePaint = Paint()
      ..isAntiAlias = true
      ..style = PaintingStyle.stroke;

    int renderedCount = 0;
    for (final entity in candidates) {
      if (visibleLayers.contains(entity.layer)) {
        entity.draw(canvas, basePaint);
        renderedCount++;
      }
    }

    // 3. Highlight Selected Entity with glowing halo
    if (selectedEntity != null && visibleLayers.contains(selectedEntity!.layer)) {
      final highlightPaint = Paint()
        ..color = const Color(0xFF06B6D4).withValues(alpha: 0.5)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 6.0 / zoom
        ..isAntiAlias = true;
      selectedEntity!.draw(canvas, highlightPaint);

      final boxPaint = Paint()
        ..color = const Color(0xFF06B6D4)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.0 / zoom;
      canvas.drawRect(selectedEntity!.boundingBox.inflate(4.0 / zoom), boxPaint);
    }

    canvas.restore(); // Restore to screen coordinates

    // 4. Draw Snap Point Indicator (in screen coordinates)
    if (activeSnap != null) {
      final snapScreenPos = (activeSnap!.position * zoom) + pan;
      _drawSnapIndicator(canvas, snapScreenPos, activeSnap!.type);
    }

    // 5. Draw CAD Crosshair
    if (cursorScreenPos != null) {
      _drawCrosshair(canvas, size, activeSnap != null ? ((activeSnap!.position * zoom) + pan) : cursorScreenPos!);
    }

    stopwatch.stop();
    final elapsedMs = stopwatch.elapsedMicroseconds / 1000.0;
    onFrameRendered(elapsedMs, renderedCount);
  }

  void _drawBackgroundGrid(Canvas canvas, Size size) {
    final gridPaint = Paint()
      ..color = const Color(0xFF1E293B).withValues(alpha: 0.4)
      ..strokeWidth = 0.5;

    final worldSpacing = 100.0; // 100 mm in world units
    final screenSpacing = worldSpacing * zoom;

    if (screenSpacing > 20.0) {
      final startX = pan.dx % screenSpacing;
      final startY = pan.dy % screenSpacing;

      for (double x = startX; x < size.width; x += screenSpacing) {
        canvas.drawLine(Offset(x, 0), Offset(x, size.height), gridPaint);
      }
      for (double y = startY; y < size.height; y += screenSpacing) {
        canvas.drawLine(Offset(0, y), Offset(size.width, y), gridPaint);
      }
    }
  }

  void _drawSnapIndicator(Canvas canvas, Offset screenPos, SnapType type) {
    final snapPaint = Paint()
      ..color = const Color(0xFF10B981) // Emerald 500
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.0;

    switch (type) {
      case SnapType.endpoint:
        // Square marker
        canvas.drawRect(Rect.fromCenter(center: screenPos, width: 12, height: 12), snapPaint);
        break;
      case SnapType.midpoint:
        // Triangle marker
        final path = Path()
          ..moveTo(screenPos.dx, screenPos.dy - 7)
          ..lineTo(screenPos.dx - 6, screenPos.dy + 5)
          ..lineTo(screenPos.dx + 6, screenPos.dy + 5)
          ..close();
        canvas.drawPath(path, snapPaint);
        break;
      case SnapType.center:
        // Circle marker
        canvas.drawCircle(screenPos, 6, snapPaint);
        break;
    }
  }

  void _drawCrosshair(Canvas canvas, Size size, Offset center) {
    final crosshairPaint = Paint()
      ..color = const Color(0xFF64748B).withValues(alpha: 0.4)
      ..strokeWidth = 0.8;

    // Full screen horizontal and vertical crosshairs
    canvas.drawLine(Offset(0, center.dy), Offset(size.width, center.dy), crosshairPaint);
    canvas.drawLine(Offset(center.dx, 0), Offset(center.dx, size.height), crosshairPaint);

    // Center aperture box
    final aperturePaint = Paint()
      ..color = const Color(0xFF06B6D4)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.0;
    canvas.drawRect(Rect.fromCenter(center: center, width: 8, height: 8), aperturePaint);
  }

  @override
  bool shouldRepaint(covariant _CadCanvasPainter oldDelegate) {
    return oldDelegate.pan != pan ||
        oldDelegate.zoom != zoom ||
        oldDelegate.cursorScreenPos != cursorScreenPos ||
        oldDelegate.activeSnap != activeSnap ||
        oldDelegate.selectedEntity != selectedEntity ||
        oldDelegate.visibleLayers != visibleLayers ||
        oldDelegate.spatialIndex != spatialIndex;
  }
}
