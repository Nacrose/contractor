/**
 * CAD Compensating Undo / Redo Engine (M07-T02).
 */

import type { CompensatingUndoAction } from './types.js';
import type { CadDocument } from './cad_document.js';

export class CadUndoEngine {
  private undoStack: CompensatingUndoAction[] = [];
  private redoStack: CompensatingUndoAction[] = [];
  readonly maxHistory: number;

  constructor(maxHistory: number = 200) {
    this.maxHistory = maxHistory;
  }

  record(action: CompensatingUndoAction): void {
    this.undoStack.push(action);
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
    // New action invalidates redo stack
    this.redoStack = [];
  }

  undo(doc: CadDocument): CompensatingUndoAction | null {
    const action = this.undoStack.pop();
    if (!action) return null;
    action.revert(doc);
    this.redoStack.push(action);
    return action;
  }

  redo(doc: CadDocument): CompensatingUndoAction | null {
    const action = this.redoStack.pop();
    if (!action) return null;
    action.reapply(doc);
    this.undoStack.push(action);
    return action;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
