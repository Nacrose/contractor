import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'cad_geometry.dart';

/// Loads representative CAD drawings for the M01-T05 Feasibility Viewport
class CadFixtureLoader {
  /// Loads standard structural architectural floor plan fixture
  static List<CadEntity> loadStandardSitePlan() {
    final entities = <CadEntity>[];

    // Layer 1: GRID (Column Grid Lines)
    for (int i = 0; i <= 6; i++) {
      final x = i * 200.0;
      entities.add(CadLine(
        id: 'grid_v_$i',
        layer: 'GRID',
        start: Offset(x, -50),
        end: Offset(x, 850),
        color: const Color(0xFF475569),
        strokeWidth: 0.8,
      ));
      entities.add(CadText(
        id: 'grid_label_v_$i',
        layer: 'GRID',
        position: Offset(x - 5, -70),
        text: String.fromCharCode(65 + i), // A, B, C...
        color: const Color(0xFF94A3B8),
        fontSize: 14,
      ));
    }
    for (int j = 0; j <= 4; j++) {
      final y = j * 200.0;
      entities.add(CadLine(
        id: 'grid_h_$j',
        layer: 'GRID',
        start: Offset(-50, y),
        end: Offset(1250, y),
        color: const Color(0xFF475569),
        strokeWidth: 0.8,
      ));
      entities.add(CadText(
        id: 'grid_label_h_$j',
        layer: 'GRID',
        position: Offset(-75, y - 6),
        text: '${j + 1}',
        color: const Color(0xFF94A3B8),
        fontSize: 14,
      ));
    }

    // Layer 2: WALLS (Exterior Foundation and Interior Partitions)
    // Building Outer Boundary Polyline
    entities.add(CadPolyline(
      id: 'outer_walls',
      layer: 'WALLS',
      vertices: const [
        Offset(0, 0),
        Offset(1200, 0),
        Offset(1200, 800),
        Offset(600, 800),
        Offset(600, 600),
        Offset(0, 600),
      ],
      isClosed: true,
      color: const Color(0xFF06B6D4), // Cyan 500
      strokeWidth: 3.5,
    ));

    // Inner corridor and partitions
    entities.add(CadLine(
      id: 'wall_p1',
      layer: 'WALLS',
      start: const Offset(400, 0),
      end: const Offset(400, 600),
      color: const Color(0xFF06B6D4),
      strokeWidth: 2.5,
    ));
    entities.add(CadLine(
      id: 'wall_p2',
      layer: 'WALLS',
      start: const Offset(800, 0),
      end: const Offset(800, 800),
      color: const Color(0xFF06B6D4),
      strokeWidth: 2.5,
    ));
    entities.add(CadLine(
      id: 'wall_p3',
      layer: 'WALLS',
      start: const Offset(0, 300),
      end: const Offset(400, 300),
      color: const Color(0xFF06B6D4),
      strokeWidth: 2.0,
    ));
    entities.add(CadLine(
      id: 'wall_p4',
      layer: 'WALLS',
      start: const Offset(800, 400),
      end: const Offset(1200, 400),
      color: const Color(0xFF06B6D4),
      strokeWidth: 2.0,
    ));

    // Layer 3: COLUMNS (Reinforced Concrete Circular & Rectangular Columns)
    for (int i = 0; i <= 6; i++) {
      for (int j = 0; j <= 4; j++) {
        final cx = i * 200.0;
        final cy = j * 200.0;
        if ((cx <= 600 && cy <= 600) || (cx >= 600 && cy <= 800)) {
          entities.add(CadCircle(
            id: 'col_${i}_$j',
            layer: 'COLUMNS',
            center: Offset(cx, cy),
            radius: 18.0,
            color: const Color(0xFFEF4444), // Red 500
            strokeWidth: 2.0,
          ));
        }
      }
    }

    // Layer 4: DOORS (Door Openings and Swing Arcs)
    // Door 1 (Office 101)
    entities.add(CadLine(
      id: 'door_leaf_1',
      layer: 'DOORS',
      start: const Offset(400, 200),
      end: const Offset(460, 200),
      color: const Color(0xFF10B981), // Emerald 500
      strokeWidth: 1.5,
    ));
    entities.add(CadArc(
      id: 'door_swing_1',
      layer: 'DOORS',
      center: const Offset(400, 200),
      radius: 60.0,
      startAngle: 0.0,
      sweepAngle: math.pi / 2,
      color: const Color(0xFF10B981),
      strokeWidth: 1.0,
    ));

    // Door 2 (Office 102)
    entities.add(CadLine(
      id: 'door_leaf_2',
      layer: 'DOORS',
      start: const Offset(800, 300),
      end: const Offset(740, 300),
      color: const Color(0xFF10B981),
      strokeWidth: 1.5,
    ));
    entities.add(CadArc(
      id: 'door_swing_2',
      layer: 'DOORS',
      center: const Offset(800, 300),
      radius: 60.0,
      startAngle: math.pi,
      sweepAngle: -math.pi / 2,
      color: const Color(0xFF10B981),
      strokeWidth: 1.0,
    ));

    // Layer 5: WINDOWS (Exterior Glazing)
    entities.add(CadLine(
      id: 'win_1',
      layer: 'WINDOWS',
      start: const Offset(150, 0),
      end: const Offset(350, 0),
      color: const Color(0xFFFBBF24), // Amber 400
      strokeWidth: 3.0,
    ));
    entities.add(CadLine(
      id: 'win_2',
      layer: 'WINDOWS',
      start: const Offset(950, 0),
      end: const Offset(1150, 0),
      color: const Color(0xFFFBBF24),
      strokeWidth: 3.0,
    ));
    entities.add(CadLine(
      id: 'win_3',
      layer: 'WINDOWS',
      start: const Offset(1200, 150),
      end: const Offset(1200, 350),
      color: const Color(0xFFFBBF24),
      strokeWidth: 3.0,
    ));

    // Layer 6: ANNOTATIONS & ROOM LABELS
    entities.add(CadText(
      id: 'label_room_1',
      layer: 'ANNOTATIONS',
      position: const Offset(140, 140),
      text: 'SITE OFFICE A (40.0 m²)',
      color: Colors.white,
      fontSize: 16,
    ));
    entities.add(CadText(
      id: 'label_room_2',
      layer: 'ANNOTATIONS',
      position: const Offset(140, 440),
      text: 'CONFERENCE RM (36.0 m²)',
      color: Colors.white,
      fontSize: 16,
    ));
    entities.add(CadText(
      id: 'label_room_3',
      layer: 'ANNOTATIONS',
      position: const Offset(520, 300),
      text: 'CENTRAL CORRIDOR',
      color: const Color(0xFF94A3B8),
      fontSize: 14,
    ));
    entities.add(CadText(
      id: 'label_room_4',
      layer: 'ANNOTATIONS',
      position: const Offset(920, 200),
      text: 'ENGINEERING LAB (48.0 m²)',
      color: Colors.white,
      fontSize: 16,
    ));
    entities.add(CadText(
      id: 'label_room_5',
      layer: 'ANNOTATIONS',
      position: const Offset(920, 600),
      text: 'MATERIAL STORAGE (48.0 m²)',
      color: Colors.white,
      fontSize: 16,
    ));

    return entities;
  }

  /// Generates a dense synthetic CAD drawing with [densityMultiplier] x entities
  static List<CadEntity> generateDenseCadDrawing({int densityMultiplier = 10}) {
    final base = loadStandardSitePlan();
    final denseList = List<CadEntity>.from(base);

    for (int k = 1; k < densityMultiplier; k++) {
      final offsetX = (k % 5) * 1400.0;
      final offsetY = (k ~/ 5) * 1000.0;

      for (int i = 0; i < base.length; i++) {
        final e = base[i];
        final id = 'dense_${k}_${e.id}';
        if (e is CadLine) {
          denseList.add(CadLine(
            id: id,
            layer: e.layer,
            start: Offset(e.start.dx + offsetX, e.start.dy + offsetY),
            end: Offset(e.end.dx + offsetX, e.end.dy + offsetY),
            color: e.color,
            strokeWidth: e.strokeWidth,
          ));
        } else if (e is CadCircle) {
          denseList.add(CadCircle(
            id: id,
            layer: e.layer,
            center: Offset(e.center.dx + offsetX, e.center.dy + offsetY),
            radius: e.radius,
            color: e.color,
            strokeWidth: e.strokeWidth,
          ));
        } else if (e is CadPolyline) {
          denseList.add(CadPolyline(
            id: id,
            layer: e.layer,
            vertices: e.vertices.map((v) => Offset(v.dx + offsetX, v.dy + offsetY)).toList(),
            isClosed: e.isClosed,
            color: e.color,
            strokeWidth: e.strokeWidth,
          ));
        } else if (e is CadArc) {
          denseList.add(CadArc(
            id: id,
            layer: e.layer,
            center: Offset(e.center.dx + offsetX, e.center.dy + offsetY),
            radius: e.radius,
            startAngle: e.startAngle,
            sweepAngle: e.sweepAngle,
            color: e.color,
            strokeWidth: e.strokeWidth,
          ));
        }
      }
    }
    return denseList;
  }
}
