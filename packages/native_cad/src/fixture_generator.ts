/**
 * Deterministic CAD Fixture Generator for Large-Scale Benchmarks (M07-T09).
 *
 * Generates declared entity mixes per Platform Plan v3 §7:
 *  - 50% Lines & Polylines (structural elements, grid lines, walls)
 *  - 20% Curves (arcs, circles, fillets, round columns)
 *  - 15% Text & Dimensions (annotations, labels, callouts)
 *  - 10% Hatches (concrete, earth, masonry boundary loops)
 *  - 5% Block Inserts (column grids, doors, windows, symbols)
 *
 * Deterministic PRNG using linear congruential generator (LCG) with explicit seeds.
 */

import type {
  CadEntity,
  LineEntity,
  CircleEntity,
  ArcEntity,
  LwPolylineEntity,
  DimensionEntity,
  HatchEntity,
  InsertEntity,
  TextEntity,
} from './types.js';

export interface DeclaredMixRatio {
  linesAndPolylines: number; // 0.50
  curves: number;            // 0.20
  textAndDimensions: number; // 0.15
  hatches: number;           // 0.10
  blockInserts: number;      // 0.05
}

export const RATIFIED_DECLARED_MIX: DeclaredMixRatio = {
  linesAndPolylines: 0.50,
  curves: 0.20,
  textAndDimensions: 0.15,
  hatches: 0.10,
  blockInserts: 0.05,
};

export class DeterministicRandom {
  private state: number;

  constructor(seed: number = 20261012) {
    this.state = seed >>> 0;
  }

  next(): number {
    // Standard Park-Miller / Lehmer LCG: (a * state) % m
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
    return this.state / 4294967296;
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  intRange(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }
}

export class CadFixtureGenerator {
  /**
   * Generates a deterministic array of CAD entities conforming to the declared mix.
   *
   * @param count Total number of entities to generate (e.g. 100,000 or 1,000,000).
   * @param seed Random seed for strict reproducibility.
   * @param extentMm Physical layout bounding extent in mm (default: 500,000mm = 500m building footprint).
   */
  static generateDeclaredMix(
    count: number,
    seed: number = 20261012,
    extentMm: number = 500000
  ): CadEntity[] {
    const rng = new DeterministicRandom(seed);
    const entities: CadEntity[] = new Array(count);

    const countLinesAndPoly = Math.floor(count * RATIFIED_DECLARED_MIX.linesAndPolylines);
    const countCurves = Math.floor(count * RATIFIED_DECLARED_MIX.curves);
    const countTextAndDims = Math.floor(count * RATIFIED_DECLARED_MIX.textAndDimensions);
    const countHatches = Math.floor(count * RATIFIED_DECLARED_MIX.hatches);
    const countBlocks = count - (countLinesAndPoly + countCurves + countTextAndDims + countHatches);

    let idx = 0;

    // 1. Lines and Polylines (50%)
    for (let i = 0; i < countLinesAndPoly; i++) {
      const handle = (idx + 1).toString(16).toUpperCase();
      const x = rng.range(0, extentMm);
      const y = rng.range(0, extentMm);
      const isPoly = rng.next() > 0.6;

      if (isPoly) {
        const segLen = rng.range(200, 5000);
        entities[idx++] = {
          handle,
          type: 'LWPOLYLINE',
          layer: 'A-WALL',
          color: 7,
          closed: rng.next() > 0.5,
          vertices: [
            { x, y },
            { x: x + segLen, y },
            { x: x + segLen, y: y + segLen },
            { x, y: y + segLen },
          ],
          revision: 1,
        } as LwPolylineEntity;
      } else {
        const dx = rng.range(-3000, 3000);
        const dy = rng.range(-3000, 3000);
        entities[idx++] = {
          handle,
          type: 'LINE',
          layer: 'S-BEAM',
          color: 5,
          lineweight: 35,
          start: { x, y },
          end: { x: x + dx, y: y + dy },
          revision: 1,
        } as LineEntity;
      }
    }

    // 2. Curves: Arcs & Circles (20%)
    for (let i = 0; i < countCurves; i++) {
      const handle = (idx + 1).toString(16).toUpperCase();
      const x = rng.range(0, extentMm);
      const y = rng.range(0, extentMm);
      const radius = rng.range(100, 2500);
      const isCircle = rng.next() > 0.5;

      if (isCircle) {
        entities[idx++] = {
          handle,
          type: 'CIRCLE',
          layer: 'S-COL-ROUND',
          color: 2,
          center: { x, y },
          radius,
          revision: 1,
        } as CircleEntity;
      } else {
        const startAngle = rng.range(0, Math.PI);
        const endAngle = startAngle + rng.range(0.2, Math.PI);
        entities[idx++] = {
          handle,
          type: 'ARC',
          layer: 'A-DOOR-SWING',
          color: 8,
          center: { x, y },
          radius,
          startAngle,
          endAngle,
          revision: 1,
        } as ArcEntity;
      }
    }

    // 3. Text & Dimensions (15%)
    for (let i = 0; i < countTextAndDims; i++) {
      const handle = (idx + 1).toString(16).toUpperCase();
      const x = rng.range(0, extentMm);
      const y = rng.range(0, extentMm);
      const isDim = rng.next() > 0.5;

      if (isDim) {
        const dimSpan = rng.range(1000, 6000);
        entities[idx++] = {
          handle,
          type: 'DIMENSION',
          layer: 'M-DIMS',
          color: 3,
          defPoint1: { x, y },
          defPoint2: { x: x + dimSpan, y },
          textPosition: { x: x + dimSpan / 2, y: y + 300 },
          measurement: dimSpan,
          textOverride: `${(dimSpan / 1000).toFixed(2)}m`,
          revision: 1,
        } as DimensionEntity;
      } else {
        entities[idx++] = {
          handle,
          type: 'TEXT',
          layer: 'M-LABELS',
          color: 7,
          position: { x, y },
          height: 250,
          text: `ROOM-${i + 1}`,
          rotation: rng.next() > 0.8 ? Math.PI / 2 : 0,
          revision: 1,
        } as TextEntity;
      }
    }

    // 4. Hatches (10%)
    for (let i = 0; i < countHatches; i++) {
      const handle = (idx + 1).toString(16).toUpperCase();
      const x = rng.range(0, extentMm);
      const y = rng.range(0, extentMm);
      const w = rng.range(1000, 8000);
      const h = rng.range(1000, 8000);

      entities[idx++] = {
        handle,
        type: 'HATCH',
        layer: 'A-HATCH-CONC',
        color: 8,
        patternName: 'ANSI31',
        solid: false,
        boundaryHandles: [],
        boundaryVertices: [
          { x, y },
          { x: x + w, y },
          { x: x + w, y: y + h },
          { x, y: y + h },
        ],
        revision: 1,
      } as HatchEntity;
    }

    // 5. Block Inserts (5%)
    for (let i = 0; i < countBlocks; i++) {
      const handle = (idx + 1).toString(16).toUpperCase();
      const x = rng.range(0, extentMm);
      const y = rng.range(0, extentMm);

      entities[idx++] = {
        handle,
        type: 'INSERT',
        layer: 'S-GRID-CALLOUT',
        color: 1,
        blockName: 'GRID_HEAD',
        insertionPoint: { x, y },
        scaleX: 1.0,
        scaleY: 1.0,
        rotation: 0,
        revision: 1,
      } as InsertEntity;
    }

    return entities;
  }
}
