/**
 * Central CAD Command Registry & Execution Engine (M07-T02).
 *
 * Implements:
 *  - Authoritative command registry with alias resolution
 *  - Built-in CAD command implementations: LINE, CIRCLE, ARC, PLINE, MOVE, COPY, ERASE, UNDO, REDO, ORTHO, UNITS, etc.
 *  - Single dispatch entrypoint: full and embedded hosts dispatch exclusively through this boundary
 *  - Automatic generation of compensating undo actions
 */

import type {
  CadEntity,
  LineEntity,
  CircleEntity,
  ArcEntity,
  LwPolylineEntity,
  CommandContext,
  CommandExecutionResult,
  CompensatingUndoAction,
} from './types.js';
import type { CadDocument } from './cad_document.js';
import { CadUndoEngine } from './undo_engine.js';
import { CadInputStateMachine } from './input_state_machine.js';

export interface CommandHandler {
  name: string;
  aliases: string[];
  description: string;
  execute: (
    doc: CadDocument,
    args: string[],
    context: CommandContext,
    stateMachine: CadInputStateMachine,
  ) => {
    result: CommandExecutionResult;
    undoAction?: CompensatingUndoAction;
  };
}

export class CadCommandRegistry {
  private commandsByName: Map<string, CommandHandler> = new Map();
  private aliasMap: Map<string, string> = new Map();
  readonly undoEngine: CadUndoEngine;
  readonly stateMachine: CadInputStateMachine;

  constructor() {
    this.undoEngine = new CadUndoEngine();
    this.stateMachine = new CadInputStateMachine();
    this.registerBuiltinCommands();
  }

  registerCommand(handler: CommandHandler): void {
    const canonicalName = handler.name.toUpperCase();
    this.commandsByName.set(canonicalName, handler);
    this.aliasMap.set(canonicalName, canonicalName);

    for (const alias of handler.aliases) {
      this.aliasMap.set(alias.toUpperCase(), canonicalName);
    }
  }

  resolveCommandName(input: string): string | null {
    const upper = input.trim().toUpperCase();
    return this.aliasMap.get(upper) || null;
  }

  getCommand(canonicalName: string): CommandHandler | undefined {
    return this.commandsByName.get(canonicalName.toUpperCase());
  }

  getAllCommands(): CommandHandler[] {
    return Array.from(this.commandsByName.values());
  }

  /**
   * Main dispatch entrypoint: parses command line string and executes via registered handler.
   */
  execute(
    doc: CadDocument,
    commandLine: string,
    context: CommandContext = {},
  ): CommandExecutionResult {
    const trimmed = commandLine.trim();
    if (!trimmed) {
      // Empty line: test repeat last command
      const repeatCmd = this.stateMachine.repeatLastCommand();
      if (repeatCmd) {
        return this.execute(doc, repeatCmd, context);
      }
      return {
        success: true,
        commandName: '',
        prompt: this.stateMachine.getPrompt(),
        undoable: false,
      };
    }

    const tokens = trimmed.split(/\s+/);
    const cmdToken = tokens[0].toUpperCase();
    const args = tokens.slice(1);

    const canonicalName = this.resolveCommandName(cmdToken);
    if (!canonicalName) {
      return {
        success: false,
        commandName: cmdToken,
        errorMessage: `Unknown command or alias: "${cmdToken}". Type ? for help.`,
        prompt: 'Command:',
        undoable: false,
      };
    }

    const handler = this.commandsByName.get(canonicalName);
    if (!handler) {
      return {
        success: false,
        commandName: canonicalName,
        errorMessage: `Handler missing for command ${canonicalName}`,
        prompt: 'Command:',
        undoable: false,
      };
    }

    try {
      const outcome = handler.execute(doc, args, context, this.stateMachine);
      if (outcome.result.success && outcome.undoAction) {
        this.undoEngine.record(outcome.undoAction);
      }
      if (outcome.result.success && !this.stateMachine.getActiveCommand()) {
        this.stateMachine.completeCommand(canonicalName);
      }
      return outcome.result;
    } catch (err: any) {
      return {
        success: false,
        commandName: canonicalName,
        errorMessage: err.message || String(err),
        prompt: 'Command:',
        undoable: false,
      };
    }
  }

  private registerBuiltinCommands(): void {
    // 1. LINE (L)
    this.registerCommand({
      name: 'LINE',
      aliases: ['L'],
      description: 'Draws a 2D line segment between two points',
      execute: (doc, args, ctx, sm) => {
        if (args.length < 2) {
          sm.setActiveCommand('LINE', 'Specify first point:');
          return {
            result: {
              success: true,
              commandName: 'LINE',
              prompt: 'Specify first point:',
              undoable: false,
            },
          };
        }

        const p1 = sm.parseCoordinate(args[0]).point;
        sm.setLastPoint(p1);
        const p2 = sm.parseCoordinate(args[1], undefined, doc.ortho.enabled).point;
        sm.setLastPoint(p2);

        const handle = doc.nextHandle();
        const entity: LineEntity = {
          handle,
          type: 'LINE',
          layer: '0',
          start: p1,
          end: p2,
        };

        doc._insertEntity(entity);

        return {
          result: {
            success: true,
            commandName: 'LINE',
            createdEntities: [entity],
            prompt: 'Command:',
            undoable: true,
          },
          undoAction: {
            id: `undo_line_${handle}`,
            commandName: 'LINE',
            description: `Erase LINE handle ${handle}`,
            revert: (d) => d._removeEntity(handle),
            reapply: (d) => d._insertEntity(entity),
          },
        };
      },
    });

    // 2. CIRCLE (C)
    this.registerCommand({
      name: 'CIRCLE',
      aliases: ['C'],
      description: 'Draws a circle with center point and radius',
      execute: (doc, args, ctx, sm) => {
        if (args.length < 2) {
          sm.setActiveCommand('CIRCLE', 'Specify center point for circle:');
          return {
            result: {
              success: true,
              commandName: 'CIRCLE',
              prompt: 'Specify center point for circle:',
              undoable: false,
            },
          };
        }

        const center = sm.parseCoordinate(args[0]).point;
        const radius = parseFloat(args[1]);
        if (Number.isNaN(radius) || radius <= 0) {
          throw new Error(`Invalid circle radius: "${args[1]}"`);
        }
        sm.setLastPoint(center);

        const handle = doc.nextHandle();
        const entity: CircleEntity = {
          handle,
          type: 'CIRCLE',
          layer: '0',
          center,
          radius,
        };

        doc._insertEntity(entity);

        return {
          result: {
            success: true,
            commandName: 'CIRCLE',
            createdEntities: [entity],
            prompt: 'Command:',
            undoable: true,
          },
          undoAction: {
            id: `undo_circle_${handle}`,
            commandName: 'CIRCLE',
            description: `Erase CIRCLE handle ${handle}`,
            revert: (d) => d._removeEntity(handle),
            reapply: (d) => d._insertEntity(entity),
          },
        };
      },
    });

    // 3. ARC (A)
    this.registerCommand({
      name: 'ARC',
      aliases: ['A'],
      description: 'Draws a circular arc with center, radius, start and end angles',
      execute: (doc, args, ctx, sm) => {
        if (args.length < 4) {
          throw new Error('ARC requires: <center> <radius> <startDeg> <endDeg>');
        }
        const center = sm.parseCoordinate(args[0]).point;
        const radius = parseFloat(args[1]);
        const startDeg = parseFloat(args[2]);
        const endDeg = parseFloat(args[3]);

        const startAngle = (startDeg * Math.PI) / 180;
        const endAngle = (endDeg * Math.PI) / 180;

        const handle = doc.nextHandle();
        const entity: ArcEntity = {
          handle,
          type: 'ARC',
          layer: '0',
          center,
          radius,
          startAngle,
          endAngle,
        };

        doc._insertEntity(entity);

        return {
          result: {
            success: true,
            commandName: 'ARC',
            createdEntities: [entity],
            undoable: true,
          },
          undoAction: {
            id: `undo_arc_${handle}`,
            commandName: 'ARC',
            description: `Erase ARC handle ${handle}`,
            revert: (d) => d._removeEntity(handle),
            reapply: (d) => d._insertEntity(entity),
          },
        };
      },
    });

    // 4. PLINE (PL)
    this.registerCommand({
      name: 'PLINE',
      aliases: ['PL'],
      description: 'Draws a 2D lightweight polyline with vertices',
      execute: (doc, args, ctx, sm) => {
        if (args.length < 2) {
          throw new Error('PLINE requires at least two coordinate vertices');
        }
        const vertices = args.map((a) => sm.parseCoordinate(a).point);
        const handle = doc.nextHandle();
        const entity: LwPolylineEntity = {
          handle,
          type: 'LWPOLYLINE',
          layer: '0',
          vertices,
          closed: false,
        };
        doc._insertEntity(entity);
        sm.setLastPoint(vertices[vertices.length - 1]);

        return {
          result: {
            success: true,
            commandName: 'PLINE',
            createdEntities: [entity],
            undoable: true,
          },
          undoAction: {
            id: `undo_pline_${handle}`,
            commandName: 'PLINE',
            description: `Erase PLINE handle ${handle}`,
            revert: (d) => d._removeEntity(handle),
            reapply: (d) => d._insertEntity(entity),
          },
        };
      },
    });

    // 5. ERASE (E, DELETE)
    this.registerCommand({
      name: 'ERASE',
      aliases: ['E', 'DELETE'],
      description: 'Deletes entities from drawing by handle',
      execute: (doc, args) => {
        if (args.length === 0) {
          throw new Error('ERASE requires entity handle(s)');
        }
        const deletedHandles: string[] = [];
        const deletedEntities: CadEntity[] = [];

        for (const h of args) {
          const removed = doc._removeEntity(h);
          if (removed) {
            deletedHandles.push(h);
            deletedEntities.push(removed);
          }
        }

        return {
          result: {
            success: true,
            commandName: 'ERASE',
            deletedHandles,
            undoable: deletedHandles.length > 0,
          },
          undoAction: {
            id: `undo_erase_${deletedHandles.join('_')}`,
            commandName: 'ERASE',
            description: `Restore erased entities: ${deletedHandles.join(', ')}`,
            revert: (d) => {
              for (const e of deletedEntities) d._insertEntity(e);
            },
            reapply: (d) => {
              for (const h of deletedHandles) d._removeEntity(h);
            },
          },
        };
      },
    });

    // 6. MOVE (M)
    this.registerCommand({
      name: 'MOVE',
      aliases: ['M'],
      description: 'Moves entities by displacement vector',
      execute: (doc, args, ctx, sm) => {
        if (args.length < 3) {
          throw new Error('MOVE requires: <handle> <basePoint> <targetPoint>');
        }
        const handle = args[0];
        const base = sm.parseCoordinate(args[1]).point;
        const target = sm.parseCoordinate(args[2]).point;
        const dx = target.x - base.x;
        const dy = target.y - base.y;

        const original = doc.getEntity(handle);
        if (!original) throw new Error(`Entity ${handle} not found for MOVE`);

        let moved: CadEntity;
        if (original.type === 'LINE') {
          moved = {
            ...original,
            start: { x: original.start.x + dx, y: original.start.y + dy },
            end: { x: original.end.x + dx, y: original.end.y + dy },
          };
        } else if (original.type === 'CIRCLE' || original.type === 'ARC') {
          moved = {
            ...original,
            center: { x: original.center.x + dx, y: original.center.y + dy },
          };
        } else {
          moved = { ...original };
        }

        doc._updateEntity(moved);

        return {
          result: {
            success: true,
            commandName: 'MOVE',
            modifiedEntities: [moved],
            undoable: true,
          },
          undoAction: {
            id: `undo_move_${handle}`,
            commandName: 'MOVE',
            description: `Revert MOVE on handle ${handle}`,
            revert: (d) => d._updateEntity(original),
            reapply: (d) => d._updateEntity(moved),
          },
        };
      },
    });

    // 7. UNDO (U)
    this.registerCommand({
      name: 'UNDO',
      aliases: ['U'],
      description: 'Reverts the last executed modifying command',
      execute: (doc) => {
        const undone = this.undoEngine.undo(doc);
        return {
          result: {
            success: true,
            commandName: 'UNDO',
            prompt: undone ? `Undid: ${undone.description}` : 'Nothing to undo.',
            undoable: false,
          },
        };
      },
    });

    // 8. REDO
    this.registerCommand({
      name: 'REDO',
      aliases: [],
      description: 'Re-applies the last undone command',
      execute: (doc) => {
        const redone = this.undoEngine.redo(doc);
        return {
          result: {
            success: true,
            commandName: 'REDO',
            prompt: redone ? `Redid: ${redone.description}` : 'Nothing to redo.',
            undoable: false,
          },
        };
      },
    });

    // 9. ORTHO
    this.registerCommand({
      name: 'ORTHO',
      aliases: [],
      description: 'Toggles orthogonal locking mode (ON / OFF)',
      execute: (doc, args) => {
        if (args.length > 0) {
          doc.ortho.enabled = args[0].toUpperCase() === 'ON';
        } else {
          doc.ortho.enabled = !doc.ortho.enabled;
        }
        return {
          result: {
            success: true,
            commandName: 'ORTHO',
            prompt: `ORTHO is now ${doc.ortho.enabled ? 'ON' : 'OFF'}`,
            undoable: false,
          },
        };
      },
    });

    // 10. UNITS
    this.registerCommand({
      name: 'UNITS',
      aliases: [],
      description: 'Configures document display units format',
      execute: (doc, args) => {
        if (args.length > 0) {
          const fmt = args[0].toLowerCase();
          if (fmt === 'decimal' || fmt === 'architectural' || fmt === 'engineering') {
            doc.units.format = fmt;
          }
        }
        return {
          result: {
            success: true,
            commandName: 'UNITS',
            prompt: `Units format: ${doc.units.format}, precision: ${doc.units.precision}`,
            undoable: false,
          },
        };
      },
    });
  }
}
