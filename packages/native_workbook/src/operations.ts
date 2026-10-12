/**
 * Workbook Operation Layer, Version Checking, Conflict Review, and Compaction (M06-T06).
 *
 * Implements:
 * 1. Ordered operation log with base-revision checks to reject stale writers.
 * 2. Non-destructive conflict detection preserving concurrent edits for review (never silent last-write-wins).
 * 3. Reference transformations and compensating undo entries for structural operations.
 * 4. Periodic compaction with cryptographic checkpoints to bound history growth.
 * 5. Deterministic recovery from checkpoints and delta streams.
 */

import { createHash } from 'node:crypto';
import type {
  WorkbookModel,
  CellValue,
} from './types.js';
import {
  executeCommand,
  type WorkbookCommand,
  type CommandExecutionResult,
} from './commands.js';

export interface WorkbookOperation {
  operationId: string;
  authorId: string;
  timestamp: number;
  baseRevision: number;
  command: WorkbookCommand;
  affectedKeys: string[];
}

export interface CompensatingEntry {
  operationId: string;
  compensatingCommand: WorkbookCommand;
}

export interface ConflictRecord {
  conflictId: string;
  timestamp: number;
  authorId: string;
  baseRevision: number;
  currentRevision: number;
  affectedKey: string;
  baseValue: CellValue;
  currentValue: CellValue;
  incomingValue: CellValue;
  staleOperation: WorkbookOperation;
  conflictingOperations: WorkbookOperation[];
  status: 'pending_review' | 'resolved_incoming' | 'resolved_current' | 'resolved_custom';
  resolvedBy?: string;
  resolvedAt?: number;
  resolutionValue?: CellValue;
}

export interface OperationApplyResult {
  success: boolean;
  operationId: string;
  revision: number;
  compensatingCommand?: WorkbookCommand;
  conflict?: ConflictRecord;
  rebased: boolean;
  error?: string;
}

export interface WorkbookCheckpoint {
  checkpointId: string;
  workbookId: string;
  revision: number;
  timestamp: number;
  snapshot: WorkbookModel;
  checksum: string;
  operationsCount: number;
}

/**
 * Derives affected canonical keys from a workbook command.
 */
export function deriveAffectedKeys(command: WorkbookCommand): string[] {
  switch (command.type) {
    case 'set_cell':
      return [`${command.sheetId}:${command.rowId}:${command.colId}`];
    case 'insert_rows':
    case 'delete_rows':
      return [`${command.sheetId}:row:${command.atIndex}`];
    case 'move_rows':
      return [`${command.sheetId}:row:${command.fromIndex}->${command.toIndex}`];
    case 'insert_cols':
    case 'delete_cols':
      return [`${command.sheetId}:col:${command.atIndex}`];
    case 'insert_sheet':
    case 'delete_sheet':
    case 'rename_sheet':
      return [`sheet:${command.sheetId}`];
    case 'set_defined_name':
    case 'delete_defined_name':
      return [`name:${'definedName' in command ? command.definedName.name : command.name}`];
    default:
      return ['unknown'];
  }
}

/**
 * Computes deterministic SHA-256 checksum for a workbook snapshot.
 */
export function computeWorkbookChecksum(workbook: WorkbookModel): string {
  const serialized = JSON.stringify({
    workbookId: workbook.workbookId,
    revision: workbook.revision,
    sheets: workbook.sheets.map((s) => ({
      id: s.id,
      title: s.title,
      cells: s.cells,
    })),
    definedNames: workbook.definedNames,
  });
  return createHash('sha256').update(serialized).digest('hex');
}

export class WorkbookOperationJournal {
  private workbook: WorkbookModel;
  private operationHistory: WorkbookOperation[] = [];
  private undoJournal: CompensatingEntry[] = [];
  private redoJournal: CompensatingEntry[] = [];
  private conflictLog: ConflictRecord[] = [];
  private checkpoints: WorkbookCheckpoint[] = [];

  constructor(workbook: WorkbookModel) {
    this.workbook = workbook;
  }

  public getWorkbook(): WorkbookModel {
    return this.workbook;
  }

  public getHistory(): ReadonlyArray<WorkbookOperation> {
    return this.operationHistory;
  }

  public getConflicts(): ReadonlyArray<ConflictRecord> {
    return this.conflictLog;
  }

  public getCheckpoints(): ReadonlyArray<WorkbookCheckpoint> {
    return this.checkpoints;
  }

  /**
   * Submits an operation with strict version checking and conflict detection.
   * Disjoint edits rebase cleanly; overlapping edits preserve conflict semantics for review.
   */
  public submitOperation(op: WorkbookOperation): OperationApplyResult {
    // 1. Version Check: Check if writer is stale
    const currentRev = this.workbook.revision;
    const isStale = op.baseRevision < currentRev;
    let isConflicting = false;
    const conflictingOps: WorkbookOperation[] = [];

    if (isStale) {
      // Find operations applied between op.baseRevision and currentRev
      const opsSinceBase = this.operationHistory.filter(
        (historyOp) => historyOp.baseRevision >= op.baseRevision
      );

      // Check for overlapping affected keys
      for (const key of op.affectedKeys) {
        for (const historyOp of opsSinceBase) {
          if (historyOp.affectedKeys.includes(key)) {
            isConflicting = true;
            conflictingOps.push(historyOp);
          }
        }
      }

      if (isConflicting) {
        // Overlapping edits MUST preserve conflict semantics for review (never silent last-write-wins)
        let baseVal: CellValue = null;
        let currentVal: CellValue = null;
        let incomingVal: CellValue = null;

        if (op.command.type === 'set_cell') {
          const cmd = op.command;
          const sheet = this.workbook.sheets.find((s) => s.id === cmd.sheetId);
          if (sheet) {
            const cell = sheet.cells[`${cmd.rowId}:${cmd.colId}`];
            currentVal = cell ? (cell.computed !== undefined ? cell.computed : cell.value) : null;
          }
          incomingVal = cmd.value ?? null;
          // Find base value from the earliest conflicting op
          const firstConflict = conflictingOps[0];
          if (firstConflict && firstConflict.command.type === 'set_cell') {
            baseVal = firstConflict.command.value ?? null;
          }
        }

        const conflictRecord: ConflictRecord = {
          conflictId: `conflict_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          timestamp: Date.now(),
          authorId: op.authorId,
          baseRevision: op.baseRevision,
          currentRevision: currentRev,
          affectedKey: op.affectedKeys[0] || 'unknown',
          baseValue: baseVal,
          currentValue: currentVal,
          incomingValue: incomingVal,
          staleOperation: op,
          conflictingOperations: conflictingOps,
          status: 'pending_review',
        };

        this.conflictLog.push(conflictRecord);

        return {
          success: false,
          operationId: op.operationId,
          revision: currentRev,
          conflict: conflictRecord,
          rebased: false,
          error: `STALE_VERSION_CONFLICT: Operation based on revision ${op.baseRevision} conflicts with concurrent edit on ${conflictRecord.affectedKey}. Preserved in conflict log for review.`,
        };
      }
    }

    // 2. Disjoint edit or current revision: Apply command cleanly
    const execResult = executeCommand(this.workbook, op.command);
    if (!execResult.success) {
      return {
        success: false,
        operationId: op.operationId,
        revision: this.workbook.revision,
        rebased: isStale,
        error: execResult.error,
      };
    }

    // 3. Record in operation history
    this.operationHistory.push(op);
    if (execResult.compensatingCommand) {
      this.undoJournal.push({
        operationId: op.operationId,
        compensatingCommand: execResult.compensatingCommand,
      });
      this.redoJournal = [];
    }

    return {
      success: true,
      operationId: op.operationId,
      revision: this.workbook.revision,
      compensatingCommand: execResult.compensatingCommand,
      rebased: isStale,
    };
  }

  /**
   * Resolves a pending conflict via an explicit review strategy.
   */
  public resolveConflict(
    conflictId: string,
    strategy: 'accept_incoming' | 'keep_current' | 'custom_merge',
    reviewerId: string,
    customValue?: CellValue
  ): boolean {
    const conflict = this.conflictLog.find((c) => c.conflictId === conflictId);
    if (!conflict || conflict.status !== 'pending_review') return false;

    conflict.resolvedBy = reviewerId;
    conflict.resolvedAt = Date.now();

    if (strategy === 'keep_current') {
      conflict.status = 'resolved_current';
      return true;
    }

    if (strategy === 'accept_incoming') {
      conflict.status = 'resolved_incoming';
      const cmd: WorkbookCommand = {
        ...conflict.staleOperation.command,
        id: `resolve_${conflict.conflictId}`,
      };
      const res = executeCommand(this.workbook, cmd);
      return res.success;
    }

    if (strategy === 'custom_merge') {
      conflict.status = 'resolved_custom';
      conflict.resolutionValue = customValue ?? null;
      if (conflict.staleOperation.command.type === 'set_cell') {
        const cmd: WorkbookCommand = {
          ...conflict.staleOperation.command,
          id: `resolve_custom_${conflict.conflictId}`,
          value: customValue ?? null,
          forceUnlock: true,
        };
        const res = executeCommand(this.workbook, cmd);
        return res.success;
      }
    }

    return false;
  }

  /**
   * Compensating undo across operation log.
   */
  public undo(): boolean {
    const entry = this.undoJournal.pop();
    if (!entry) return false;

    const res = executeCommand(this.workbook, entry.compensatingCommand);
    if (res.success) {
      if (res.compensatingCommand) {
        this.redoJournal.push({
          operationId: entry.operationId,
          compensatingCommand: res.compensatingCommand,
        });
      }
      return true;
    }
    return false;
  }

  public redo(): boolean {
    const entry = this.redoJournal.pop();
    if (!entry) return false;

    const res = executeCommand(this.workbook, entry.compensatingCommand);
    if (res.success) {
      if (res.compensatingCommand) {
        this.undoJournal.push({
          operationId: entry.operationId,
          compensatingCommand: res.compensatingCommand,
        });
      }
      return true;
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // Checkpoints & History Compaction
  // -------------------------------------------------------------------------

  /**
   * Captures a full snapshot checkpoint of the current workbook state.
   */
  public createCheckpoint(): WorkbookCheckpoint {
    const deepSnapshot: WorkbookModel = JSON.parse(JSON.stringify(this.workbook));
    const checksum = computeWorkbookChecksum(deepSnapshot);

    const checkpoint: WorkbookCheckpoint = {
      checkpointId: `ckpt_${this.workbook.revision}_${Date.now()}`,
      workbookId: this.workbook.workbookId,
      revision: this.workbook.revision,
      timestamp: Date.now(),
      snapshot: deepSnapshot,
      checksum,
      operationsCount: this.operationHistory.length,
    };

    this.checkpoints.push(checkpoint);
    return checkpoint;
  }

  /**
   * Compacts history: retains the latest checkpoint and prunes older operations
   * to bound document history growth.
   */
  public compact(keepCheckpoints = 2): { prunedCount: number; activeCheckpoint: WorkbookCheckpoint } {
    let checkpoint = this.checkpoints[this.checkpoints.length - 1];
    if (!checkpoint) {
      checkpoint = this.createCheckpoint();
    }

    const initialOpCount = this.operationHistory.length;
    // Prune operations that were committed before or at the active checkpoint revision
    this.operationHistory = this.operationHistory.filter(
      (op) => op.baseRevision >= checkpoint.revision
    );
    const prunedCount = initialOpCount - this.operationHistory.length;

    // Prune older checkpoints beyond keepCheckpoints
    if (this.checkpoints.length > keepCheckpoints) {
      this.checkpoints = this.checkpoints.slice(-keepCheckpoints);
    }

    return { prunedCount, activeCheckpoint: checkpoint };
  }

  /**
   * Reconstitutes workbook state from a checkpoint plus subsequent delta operations.
   */
  public static recoverFromCheckpoint(
    checkpoint: WorkbookCheckpoint,
    subsequentDeltas: WorkbookOperation[]
  ): WorkbookModel {
    // Verify checksum integrity
    const calculatedChecksum = computeWorkbookChecksum(checkpoint.snapshot);
    if (calculatedChecksum !== checkpoint.checksum) {
      throw new Error(`CHECKPOINT_CORRUPTION: Checksum mismatch on checkpoint ${checkpoint.checkpointId}`);
    }

    const recoveredWorkbook: WorkbookModel = JSON.parse(JSON.stringify(checkpoint.snapshot));

    // Sort deltas by revision/timestamp and replay
    const sortedDeltas = [...subsequentDeltas].sort((a, b) => a.timestamp - b.timestamp);
    for (const delta of sortedDeltas) {
      const res = executeCommand(recoveredWorkbook, delta.command);
      if (!res.success) {
        throw new Error(`RECOVERY_ERROR: Failed to replay operation ${delta.operationId}: ${res.error}`);
      }
    }

    return recoveredWorkbook;
  }
}
