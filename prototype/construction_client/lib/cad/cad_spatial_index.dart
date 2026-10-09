import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'cad_geometry.dart';

/// 2D Spatial Grid Index for accelerated CAD frustum culling, picking & snapping
class CadSpatialIndex {
  final double cellSize;
  final Map<int, List<CadEntity>> _grid = {};
  final List<CadEntity> _allEntities = [];

  CadSpatialIndex({this.cellSize = 200.0});

  List<CadEntity> get entities => List.unmodifiable(_allEntities);

  int get count => _allEntities.length;

  int _hashCell(int cx, int cy) => (cx * 73856093) ^ (cy * 19349663);

  void clear() {
    _grid.clear();
    _allEntities.clear();
  }

  void insert(CadEntity entity) {
    _allEntities.add(entity);
    final bbox = entity.boundingBox;

    final minX = (bbox.left / cellSize).floor();
    final maxX = (bbox.right / cellSize).floor();
    final minY = (bbox.top / cellSize).floor();
    final maxY = (bbox.bottom / cellSize).floor();

    for (int cx = minX; cx <= maxX; cx++) {
      for (int cy = minY; cy <= maxY; cy++) {
        final key = _hashCell(cx, cy);
        _grid.putIfAbsent(key, () => []).add(entity);
      }
    }
  }

  void insertAll(Iterable<CadEntity> entities) {
    for (final e in entities) {
      insert(e);
    }
  }

  /// Query all entities whose bounding box intersects [queryRect] (Frustum culling)
  List<CadEntity> queryRect(Rect queryRect) {
    final minX = (queryRect.left / cellSize).floor();
    final maxX = (queryRect.right / cellSize).floor();
    final minY = (queryRect.top / cellSize).floor();
    final maxY = (queryRect.bottom / cellSize).floor();

    final seen = <String>{};
    final results = <CadEntity>[];

    for (int cx = minX; cx <= maxX; cx++) {
      for (int cy = minY; cy <= maxY; cy++) {
        final key = _hashCell(cx, cy);
        final list = _grid[key];
        if (list != null) {
          for (final entity in list) {
            if (!seen.contains(entity.id) && entity.boundingBox.overlaps(queryRect)) {
              seen.add(entity.id);
              results.add(entity);
            }
          }
        }
      }
    }
    return results;
  }

  /// Pick single closest entity at [worldPoint] within [tolerance]
  CadEntity? pickEntity(Offset worldPoint, double tolerance) {
    final queryBox = Rect.fromCircle(center: worldPoint, radius: tolerance);
    final candidates = queryRect(queryBox);

    CadEntity? bestMatch;
    double minDistance = double.infinity;

    for (final entity in candidates) {
      if (entity.hitTest(worldPoint, tolerance)) {
        final dist = (entity.boundingBox.center - worldPoint).distance;
        if (dist < minDistance) {
          minDistance = dist;
          bestMatch = entity;
        }
      }
    }
    return bestMatch;
  }

  /// Find nearest snap point to [worldPoint] within [snapTolerance]
  SnapPoint? findNearestSnap(Offset worldPoint, double snapTolerance) {
    final queryBox = Rect.fromCircle(center: worldPoint, radius: snapTolerance);
    final candidates = queryRect(queryBox);

    SnapPoint? nearestSnap;
    double minDistance = snapTolerance;

    for (final entity in candidates) {
      for (final snap in entity.getSnapPoints()) {
        final d = (snap.position - worldPoint).distance;
        if (d < minDistance) {
          minDistance = d;
          nearestSnap = snap;
        }
      }
    }
    return nearestSnap;
  }

  /// Computes world bounding box of all indexed entities
  Rect computeTotalBounds() {
    if (_allEntities.isEmpty) return const Rect.fromLTWH(0, 0, 1000, 1000);
    double minX = _allEntities.first.boundingBox.left;
    double maxX = _allEntities.first.boundingBox.right;
    double minY = _allEntities.first.boundingBox.top;
    double maxY = _allEntities.first.boundingBox.bottom;

    for (final e in _allEntities) {
      final b = e.boundingBox;
      minX = math.min(minX, b.left);
      maxX = math.max(maxX, b.right);
      minY = math.min(minY, b.top);
      maxY = math.max(maxY, b.bottom);
    }
    return Rect.fromLTRB(minX, minY, maxX, maxY);
  }
}
