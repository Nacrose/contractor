/**
 * CAD Input State Machine & Coordinate Parser (M07-T02).
 *
 * Implements:
 *  - Interactive command line input parsing
 *  - Absolute coordinates ('10,20' or '10,20,5')
 *  - Relative coordinates ('@10,20')
 *  - Polar coordinates ('@10<45' in degrees)
 *  - Direct distance entry along cursor direction
 *  - Escape to cancel, Enter/Space to repeat last command
 *  - Ortho locking (0, 90, 180, 270 deg)
 *  - Object snapping (endpoint, midpoint, center)
 */

import type { Point2D, SnapResult, SnapMode, CadEntity } from './types.js';
import type { CadDocument } from './cad_document.js';

export type InputMode = 'COMMAND_PROMPT' | 'AWAITING_POINT' | 'AWAITING_DISTANCE' | 'AWAITING_SELECTION';

export interface ParsedCoordinate {
  point: Point2D;
  isRelative: boolean;
  isPolar: boolean;
}

export class CadInputStateMachine {
  private lastPoint: Point2D | null = null;
  private lastExecutedCommand: string | null = null;
  private activeCommandName: string | null = null;
  private commandPromptText: string = 'Command:';
  private mode: InputMode = 'COMMAND_PROMPT';

  constructor() {}

  getMode(): InputMode {
    return this.mode;
  }

  getPrompt(): string {
    return this.commandPromptText;
  }

  getLastPoint(): Point2D | null {
    return this.lastPoint ? { ...this.lastPoint } : null;
  }

  getLastCommand(): string | null {
    return this.lastExecutedCommand;
  }

  getActiveCommand(): string | null {
    return this.activeCommandName;
  }

  setLastPoint(pt: Point2D): void {
    this.lastPoint = { ...pt };
  }

  setActiveCommand(commandName: string, promptText: string, mode: InputMode = 'AWAITING_POINT'): void {
    this.activeCommandName = commandName;
    this.commandPromptText = promptText;
    this.mode = mode;
  }

  completeCommand(commandName: string): void {
    this.lastExecutedCommand = commandName;
    this.activeCommandName = null;
    this.commandPromptText = 'Command:';
    this.mode = 'COMMAND_PROMPT';
  }

  /**
   * Handles keyboard ESCAPE: cancels in-flight command, resets state to idle.
   */
  cancel(): { cancelledCommand: string | null; prompt: string } {
    const cancelled = this.activeCommandName;
    this.activeCommandName = null;
    this.commandPromptText = 'Command:';
    this.mode = 'COMMAND_PROMPT';
    return { cancelledCommand: cancelled, prompt: this.commandPromptText };
  }

  /**
   * Handles Enter / Space on empty input line: repeats last executed command if idle.
   */
  repeatLastCommand(): string | null {
    if (this.mode === 'COMMAND_PROMPT' && this.lastExecutedCommand) {
      return this.lastExecutedCommand;
    }
    return null;
  }

  /**
   * Parses interactive coordinate string.
   *
   * Formats supported:
   *  - Absolute: "10,20" or "10.5, 20.25, 0"
   *  - Relative Cartesian: "@10,20"
   *  - Relative Polar: "@10<45" (radius 10 at 45 deg)
   *  - Direct distance: "150.0" (requires cursor orientation / lastPoint)
   */
  parseCoordinate(
    rawInput: string,
    cursorHint?: Point2D,
    orthoEnabled: boolean = false,
  ): ParsedCoordinate {
    const trimmed = rawInput.trim();

    if (!trimmed) {
      throw new Error('Empty coordinate input');
    }

    // 1. Relative polar: "@10<45"
    if (trimmed.startsWith('@') && trimmed.includes('<')) {
      const parts = trimmed.slice(1).split('<');
      const dist = parseFloat(parts[0]);
      const deg = parseFloat(parts[1]);
      if (Number.isNaN(dist) || Number.isNaN(deg)) {
        throw new Error(`Malformed polar coordinate: "${trimmed}"`);
      }
      const rad = (deg * Math.PI) / 180;
      const base = this.lastPoint || { x: 0, y: 0 };
      return {
        point: {
          x: base.x + dist * Math.cos(rad),
          y: base.y + dist * Math.sin(rad),
        },
        isRelative: true,
        isPolar: true,
      };
    }

    // 2. Relative Cartesian: "@10,20"
    if (trimmed.startsWith('@')) {
      const parts = trimmed.slice(1).split(',');
      const dx = parseFloat(parts[0]);
      const dy = parseFloat(parts[1]);
      if (Number.isNaN(dx) || Number.isNaN(dy)) {
        throw new Error(`Malformed relative coordinate: "${trimmed}"`);
      }
      const base = this.lastPoint || { x: 0, y: 0 };
      return {
        point: { x: base.x + dx, y: base.y + dy },
        isRelative: true,
        isPolar: false,
      };
    }

    // 3. Absolute Cartesian: "10,20" or "10,20,5"
    if (trimmed.includes(',')) {
      const parts = trimmed.split(',');
      const x = parseFloat(parts[0]);
      const y = parseFloat(parts[1]);
      const z = parts.length > 2 ? parseFloat(parts[2]) : undefined;
      if (Number.isNaN(x) || Number.isNaN(y)) {
        throw new Error(`Malformed absolute coordinate: "${trimmed}"`);
      }
      return {
        point: { x, y, z },
        isRelative: false,
        isPolar: false,
      };
    }

    // 4. Direct distance entry: "50"
    const dist = parseFloat(trimmed);
    if (!Number.isNaN(dist)) {
      const base = this.lastPoint || { x: 0, y: 0 };
      if (!cursorHint) {
        throw new Error('Direct distance entry requires active cursor orientation hint');
      }
      let dx = cursorHint.x - base.x;
      let dy = cursorHint.y - base.y;

      if (orthoEnabled) {
        // Ortho constrain: choose dominant axis
        if (Math.abs(dx) >= Math.abs(dy)) {
          dy = 0;
          dx = dx >= 0 ? dist : -dist;
        } else {
          dx = 0;
          dy = dy >= 0 ? dist : -dist;
        }
        return {
          point: { x: base.x + dx, y: base.y + dy },
          isRelative: true,
          isPolar: false,
        };
      }

      const len = Math.hypot(dx, dy);
      if (len === 0) {
        return { point: { x: base.x + dist, y: base.y }, isRelative: true, isPolar: false };
      }
      return {
        point: {
          x: base.x + (dx / len) * dist,
          y: base.y + (dy / len) * dist,
        },
        isRelative: true,
        isPolar: false,
      };
    }

    throw new Error(`Unrecognized coordinate syntax: "${rawInput}"`);
  }

  /**
   * Applies Ortho constraint to a cursor point relative to lastPoint.
   */
  applyOrtho(currentPoint: Point2D): Point2D {
    if (!this.lastPoint) return { ...currentPoint };
    const dx = currentPoint.x - this.lastPoint.x;
    const dy = currentPoint.y - this.lastPoint.y;

    if (Math.abs(dx) >= Math.abs(dy)) {
      return { x: currentPoint.x, y: this.lastPoint.y };
    } else {
      return { x: this.lastPoint.x, y: currentPoint.y };
    }
  }

  /**
   * Finds nearest object snap point across drawing entities.
   */
  findSnap(
    doc: CadDocument,
    queryPoint: Point2D,
    tolerance: number = 0.5,
    modes: SnapMode[] = ['endpoint', 'midpoint', 'center', 'quadrant'],
  ): SnapResult | null {
    let bestSnap: SnapResult | null = null;
    let minDistance = tolerance;

    const entitiesToScan =
      doc.spatialIndex && doc.spatialIndex.size() > 0
        ? doc.spatialIndex
            .searchPoint(queryPoint, tolerance)
            .map((h) => doc.getEntity(h))
            .filter((e): e is CadEntity => !!e)
        : doc.getAllEntities();

    for (const ent of entitiesToScan) {
      switch (ent.type) {
        case 'LINE': {
          if (modes.includes('endpoint')) {
            const d1 = Math.hypot(queryPoint.x - ent.start.x, queryPoint.y - ent.start.y);
            if (d1 < minDistance) {
              minDistance = d1;
              bestSnap = { point: { ...ent.start }, mode: 'endpoint', distance: d1, entityHandle: ent.handle };
            }
            const d2 = Math.hypot(queryPoint.x - ent.end.x, queryPoint.y - ent.end.y);
            if (d2 < minDistance) {
              minDistance = d2;
              bestSnap = { point: { ...ent.end }, mode: 'endpoint', distance: d2, entityHandle: ent.handle };
            }
          }
          if (modes.includes('midpoint')) {
            const mx = (ent.start.x + ent.end.x) / 2;
            const my = (ent.start.y + ent.end.y) / 2;
            const dm = Math.hypot(queryPoint.x - mx, queryPoint.y - my);
            if (dm < minDistance) {
              minDistance = dm;
              bestSnap = { point: { x: mx, y: my }, mode: 'midpoint', distance: dm, entityHandle: ent.handle };
            }
          }
          break;
        }
        case 'CIRCLE': {
          if (modes.includes('center')) {
            const dc = Math.hypot(queryPoint.x - ent.center.x, queryPoint.y - ent.center.y);
            if (dc < minDistance) {
              minDistance = dc;
              bestSnap = { point: { ...ent.center }, mode: 'center', distance: dc, entityHandle: ent.handle };
            }
          }
          if (modes.includes('quadrant')) {
            const r = ent.radius;
            const quads: [number, number][] = [[r, 0], [0, r], [-r, 0], [0, -r]];
            for (const [dx, dy] of quads) {
              const qx = ent.center.x + dx;
              const qy = ent.center.y + dy;
              const dq = Math.hypot(queryPoint.x - qx, queryPoint.y - qy);
              if (dq < minDistance) {
                minDistance = dq;
                bestSnap = { point: { x: qx, y: qy }, mode: 'quadrant', distance: dq, entityHandle: ent.handle };
              }
            }
          }
          break;
        }
        case 'LWPOLYLINE': {
          if (ent.vertices) {
            if (modes.includes('endpoint')) {
              for (const v of ent.vertices) {
                const dv = Math.hypot(queryPoint.x - v.x, queryPoint.y - v.y);
                if (dv < minDistance) {
                  minDistance = dv;
                  bestSnap = { point: { ...v }, mode: 'endpoint', distance: dv, entityHandle: ent.handle };
                }
              }
            }
            if (modes.includes('midpoint')) {
              for (let vi = 0; vi < ent.vertices.length - 1; vi++) {
                const v1 = ent.vertices[vi];
                const v2 = ent.vertices[vi + 1];
                const mx = (v1.x + v2.x) / 2;
                const my = (v1.y + v2.y) / 2;
                const dm = Math.hypot(queryPoint.x - mx, queryPoint.y - my);
                if (dm < minDistance) {
                  minDistance = dm;
                  bestSnap = { point: { x: mx, y: my }, mode: 'midpoint', distance: dm, entityHandle: ent.handle };
                }
              }
            }
          }
          break;
        }
        case 'DIMENSION': {
          if (modes.includes('endpoint')) {
            const d1 = Math.hypot(queryPoint.x - ent.defPoint1.x, queryPoint.y - ent.defPoint1.y);
            if (d1 < minDistance) {
              minDistance = d1;
              bestSnap = { point: { ...ent.defPoint1 }, mode: 'endpoint', distance: d1, entityHandle: ent.handle };
            }
            const d2 = Math.hypot(queryPoint.x - ent.defPoint2.x, queryPoint.y - ent.defPoint2.y);
            if (d2 < minDistance) {
              minDistance = d2;
              bestSnap = { point: { ...ent.defPoint2 }, mode: 'endpoint', distance: d2, entityHandle: ent.handle };
            }
          }
          break;
        }
        case 'INSERT': {
          if (modes.includes('endpoint') || modes.includes('center')) {
            const d = Math.hypot(queryPoint.x - ent.insertionPoint.x, queryPoint.y - ent.insertionPoint.y);
            if (d < minDistance) {
              minDistance = d;
              bestSnap = { point: { ...ent.insertionPoint }, mode: 'endpoint', distance: d, entityHandle: ent.handle };
            }
          }
          break;
        }
        case 'TEXT':
        case 'MTEXT': {
          if (modes.includes('endpoint')) {
            const d = Math.hypot(queryPoint.x - ent.position.x, queryPoint.y - ent.position.y);
            if (d < minDistance) {
              minDistance = d;
              bestSnap = { point: { ...ent.position }, mode: 'endpoint', distance: d, entityHandle: ent.handle };
            }
          }
          break;
        }
      }
    }

    return bestSnap;
  }
}
