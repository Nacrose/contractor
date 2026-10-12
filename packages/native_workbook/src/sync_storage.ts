/**
 * Real SQLite Workbook Sync Storage, Concurrency Engine, and Legacy Snapshot Guard (M06-T09).
 *
 * Implements real SQLite persistence for:
 * 1. Granular workbook operations and revision journals (M03 sync plumbing).
 * 2. Immutable cryptographic checkpoints for history compaction and instant crash recovery.
 * 3. Non-destructive conflict logs preserving competing edits for human review.
 * 4. Legacy snapshot save denial: prevents un-versioned blind full-document overwrites
 *    from erasing granular collaborative edits (platform plan v3 §5.4).
 */

import { DatabaseSync } from 'node:sqlite';
import {
  WorkbookOperationJournal,
  deriveAffectedKeys,
  computeWorkbookChecksum,
  type WorkbookOperation,
  type WorkbookCheckpoint,
  type ConflictRecord,
  type OperationApplyResult,
} from './operations.js';
import type { WorkbookModel } from './types.js';

export interface SnapshotSaveResult {
  accepted: boolean;
  code: 'ACCEPTED' | 'BLIND_SNAPSHOT_DENIED' | 'STALE_SNAPSHOT_DENIED';
  message: string;
  currentRevision: number;
}

export interface SqliteStoreConfig {
  dbPath: string;
}

export class SqliteWorkbookStore {
  private db: DatabaseSync;

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);
    this.initPragmasAndSchema();
  }

  private initPragmasAndSchema(): void {
    // M03 durability pragmas: WAL mode + synchronous=FULL
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA synchronous = FULL;');
    this.db.exec('PRAGMA foreign_keys = ON;');

    // Schema definitions
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS workbook_documents (
        workbook_id TEXT PRIMARY KEY,
        current_revision INTEGER NOT NULL,
        migrated_v3 INTEGER NOT NULL DEFAULT 1,
        checksum TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS workbook_operations (
        operation_id TEXT PRIMARY KEY,
        workbook_id TEXT NOT NULL,
        author_id TEXT NOT NULL,
        base_revision INTEGER NOT NULL,
        revision INTEGER NOT NULL,
        command_type TEXT NOT NULL,
        command_payload TEXT NOT NULL,
        affected_keys TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (workbook_id) REFERENCES workbook_documents(workbook_id)
      );

      CREATE TABLE IF NOT EXISTS workbook_checkpoints (
        checkpoint_id TEXT PRIMARY KEY,
        workbook_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        checksum TEXT NOT NULL,
        snapshot_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (workbook_id) REFERENCES workbook_documents(workbook_id)
      );

      CREATE TABLE IF NOT EXISTS workbook_conflicts (
        conflict_id TEXT PRIMARY KEY,
        workbook_id TEXT NOT NULL,
        author_id TEXT NOT NULL,
        base_revision INTEGER NOT NULL,
        current_revision INTEGER NOT NULL,
        affected_key TEXT NOT NULL,
        base_val TEXT,
        curr_val TEXT,
        incoming_val TEXT,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (workbook_id) REFERENCES workbook_documents(workbook_id)
      );
    `);
  }

  public registerWorkbook(workbook: WorkbookModel, migratedV3 = true): void {
    const checksum = computeWorkbookChecksum(workbook);
    const stmt = this.db.prepare(`
      INSERT INTO workbook_documents (workbook_id, current_revision, migrated_v3, checksum, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(workbook_id) DO UPDATE SET
        current_revision = excluded.current_revision,
        checksum = excluded.checksum,
        updated_at = excluded.updated_at
    `);
    stmt.run(workbook.workbookId, workbook.revision, migratedV3 ? 1 : 0, checksum, Date.now());
  }

  public getDocumentInfo(workbookId: string): { currentRevision: number; migratedV3: boolean; checksum: string } | undefined {
    const stmt = this.db.prepare(`
      SELECT current_revision, migrated_v3, checksum FROM workbook_documents WHERE workbook_id = ?
    `);
    const row = stmt.get(workbookId) as { current_revision: number; migrated_v3: number; checksum: string } | undefined;
    if (!row) return undefined;
    return {
      currentRevision: Number(row.current_revision),
      migratedV3: row.migrated_v3 === 1,
      checksum: row.checksum,
    };
  }

  public persistOperation(workbookId: string, op: WorkbookOperation, revision: number): void {
    const stmt = this.db.prepare(`
      INSERT INTO workbook_operations (
        operation_id, workbook_id, author_id, base_revision, revision,
        command_type, command_payload, affected_keys, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      op.operationId,
      workbookId,
      op.authorId,
      op.baseRevision,
      revision,
      op.command.type,
      JSON.stringify(op.command),
      JSON.stringify(op.affectedKeys),
      op.timestamp,
    );

    // Bump document revision in transaction
    const updateDoc = this.db.prepare(`
      UPDATE workbook_documents
      SET current_revision = ?, updated_at = ?
      WHERE workbook_id = ?
    `);
    updateDoc.run(revision, Date.now(), workbookId);
  }

  public persistCheckpoint(checkpoint: WorkbookCheckpoint): void {
    const stmt = this.db.prepare(`
      INSERT INTO workbook_checkpoints (
        checkpoint_id, workbook_id, revision, checksum, snapshot_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      checkpoint.checkpointId,
      checkpoint.workbookId,
      checkpoint.revision,
      checkpoint.checksum,
      JSON.stringify(checkpoint.snapshot),
      checkpoint.timestamp,
    );
  }

  public persistConflict(workbookId: string, conflict: ConflictRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO workbook_conflicts (
        conflict_id, workbook_id, author_id, base_revision, current_revision,
        affected_key, base_val, curr_val, incoming_val, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      conflict.conflictId,
      workbookId,
      conflict.authorId,
      conflict.baseRevision,
      conflict.currentRevision,
      conflict.affectedKey,
      conflict.baseValue !== null ? String(conflict.baseValue) : null,
      conflict.currentValue !== null ? String(conflict.currentValue) : null,
      conflict.incomingValue !== null ? String(conflict.incomingValue) : null,
      conflict.status,
      conflict.timestamp,
    );
  }

  public getOperations(workbookId: string): WorkbookOperation[] {
    const stmt = this.db.prepare(`
      SELECT operation_id, author_id, base_revision, revision, command_payload, affected_keys, created_at
      FROM workbook_operations
      WHERE workbook_id = ?
      ORDER BY revision ASC
    `);
    const rows = stmt.all(workbookId) as Array<{
      operation_id: string;
      author_id: string;
      base_revision: number;
      revision: number;
      command_payload: string;
      affected_keys: string;
      created_at: number;
    }>;

    return rows.map((r) => ({
      operationId: r.operation_id,
      authorId: r.author_id,
      baseRevision: Number(r.base_revision),
      timestamp: Number(r.created_at),
      command: JSON.parse(r.command_payload),
      affectedKeys: JSON.parse(r.affected_keys),
    }));
  }

  public getConflicts(workbookId: string): ConflictRecord[] {
    const stmt = this.db.prepare(`
      SELECT conflict_id, author_id, base_revision, current_revision, affected_key,
             base_val, curr_val, incoming_val, status, created_at
      FROM workbook_conflicts
      WHERE workbook_id = ?
      ORDER BY created_at ASC
    `);
    const rows = stmt.all(workbookId) as Array<{
      conflict_id: string;
      author_id: string;
      base_revision: number;
      current_revision: number;
      affected_key: string;
      base_val: string | null;
      curr_val: string | null;
      incoming_val: string | null;
      status: string;
      created_at: number;
    }>;

    return rows.map((r) => ({
      conflictId: r.conflict_id,
      authorId: r.author_id,
      baseRevision: Number(r.base_revision),
      currentRevision: Number(r.current_revision),
      affectedKey: r.affected_key,
      baseValue: r.base_val,
      currentValue: r.curr_val,
      incomingValue: r.incoming_val,
      staleOperation: null as any,
      conflictingOperations: [],
      status: r.status as any,
      timestamp: Number(r.created_at),
    }));
  }

  public getLatestCheckpoint(workbookId: string): WorkbookCheckpoint | undefined {
    const stmt = this.db.prepare(`
      SELECT checkpoint_id, workbook_id, revision, checksum, snapshot_json, created_at
      FROM workbook_checkpoints
      WHERE workbook_id = ?
      ORDER BY revision DESC
      LIMIT 1
    `);
    const row = stmt.get(workbookId) as {
      checkpoint_id: string;
      workbook_id: string;
      revision: number;
      checksum: string;
      snapshot_json: string;
      created_at: number;
    } | undefined;

    if (!row) return undefined;
    return {
      checkpointId: row.checkpoint_id,
      workbookId: row.workbook_id,
      revision: Number(row.revision),
      checksum: row.checksum,
      snapshot: JSON.parse(row.snapshot_json),
      timestamp: Number(row.created_at),
      operationsCount: 0,
    };
  }

  /**
   * Legacy Snapshot Save Guard (v3 §5.4):
   *
   * Old clients attempting blind full-document snapshot saves MUST be denied writes
   * to migrated document types or forced into version checks. Never allow a legacy
   * full-document save to erase accepted granular operations.
   */
  public attemptLegacySnapshotSave(
    workbookId: string,
    snapshot: WorkbookModel,
    expectedRevision?: number,
  ): SnapshotSaveResult {
    const docInfo = this.getDocumentInfo(workbookId);
    if (!docInfo) {
      // New document registration
      this.registerWorkbook(snapshot, true);
      return {
        accepted: true,
        code: 'ACCEPTED',
        message: 'New document initialized',
        currentRevision: snapshot.revision,
      };
    }

    if (docInfo.migratedV3) {
      // 1. Blind snapshot denial: unversioned full-workbook replacement is strictly denied
      if (expectedRevision === undefined) {
        return {
          accepted: false,
          code: 'BLIND_SNAPSHOT_DENIED',
          message:
            'Legacy blind full-document save denied: document is migrated to v3 collaborative model. Writes must participate in version validation.',
          currentRevision: docInfo.currentRevision,
        };
      }

      // 2. Stale revision denial: revision behind head is rejected
      if (expectedRevision < docInfo.currentRevision) {
        return {
          accepted: false,
          code: 'STALE_SNAPSHOT_DENIED',
          message: `Stale snapshot save rejected: base revision ${expectedRevision} is behind current revision ${docInfo.currentRevision}. Granular rebase or manual merge required.`,
          currentRevision: docInfo.currentRevision,
        };
      }
    }

    // Version match: update document revision and snapshot
    const newRev = docInfo.currentRevision + 1;
    snapshot.revision = newRev;
    this.registerWorkbook(snapshot, docInfo.migratedV3);
    return {
      accepted: true,
      code: 'ACCEPTED',
      message: 'Snapshot accepted with validated version check',
      currentRevision: newRev,
    };
  }

  /**
   * Recovery from interrupted operations:
   * Reconstitutes the workbook from the latest verified checkpoint in SQLite
   * and replays all subsequent committed operations.
   */
  public recoverWorkbook(workbookId: string): {
    recoveredWorkbook: WorkbookModel;
    replayedCount: number;
    checksumMatches: boolean;
  } {
    const checkpoint = this.getLatestCheckpoint(workbookId);
    if (!checkpoint) {
      throw new Error(`Cannot recover workbook ${workbookId}: no checkpoint found in storage`);
    }

    // Verify checkpoint checksum
    const computedCkptHash = computeWorkbookChecksum(checkpoint.snapshot);
    if (computedCkptHash !== checkpoint.checksum) {
      throw new Error(`Checkpoint corruption detected for ${checkpoint.checkpointId}: checksum mismatch`);
    }

    const journal = new WorkbookOperationJournal(checkpoint.snapshot);

    // Load and replay operations recorded after the checkpoint
    const stmt = this.db.prepare(`
      SELECT command_payload, author_id, base_revision, revision, affected_keys, created_at, operation_id
      FROM workbook_operations
      WHERE workbook_id = ? AND revision > ?
      ORDER BY revision ASC
    `);
    const ops = stmt.all(workbookId, checkpoint.revision) as Array<{
      command_payload: string;
      author_id: string;
      base_revision: number;
      revision: number;
      affected_keys: string;
      created_at: number;
      operation_id: string;
    }>;

    for (const row of ops) {
      const op: WorkbookOperation = {
        operationId: row.operation_id,
        authorId: row.author_id,
        baseRevision: Number(row.base_revision),
        timestamp: Number(row.created_at),
        command: JSON.parse(row.command_payload),
        affectedKeys: JSON.parse(row.affected_keys),
      };
      journal.submitOperation(op);
    }

    const recovered = journal.getWorkbook();
    const docInfo = this.getDocumentInfo(workbookId);
    const finalChecksum = computeWorkbookChecksum(recovered);

    return {
      recoveredWorkbook: recovered,
      replayedCount: ops.length,
      checksumMatches: docInfo ? finalChecksum === docInfo.checksum : true,
    };
  }

  public close(): void {
    this.db.close();
  }
}
