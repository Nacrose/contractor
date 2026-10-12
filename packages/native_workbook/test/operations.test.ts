import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  WorkbookOperationJournal,
  deriveAffectedKeys,
  computeWorkbookChecksum,
  type WorkbookOperation,
} from '../src/operations.js';
import { migrateV2ToV3 } from '../src/migration.js';
import type { LegacyWorkbookV2 } from '../src/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, '../../../../fixtures/platform-parity/worksheet/templates');

function loadStandardIpcWorkbook() {
  const filePath = resolve(FIXTURES_DIR, 'standard_ipc_measurement.json');
  const raw = readFileSync(filePath, 'utf-8');
  const v2Fixture: LegacyWorkbookV2 = JSON.parse(raw);
  return migrateV2ToV3(v2Fixture);
}

test('disjoint concurrent edits compose cleanly without data loss', () => {
  const wb = loadStandardIpcWorkbook();
  const journal = new WorkbookOperationJournal(wb);
  const sheet = wb.sheets[0];

  const initialRev = wb.revision;

  // Collaborator A edits cell row 3 col 3 (quantity nos)
  const opA: WorkbookOperation = {
    operationId: 'op_a',
    authorId: 'alice',
    timestamp: 1000,
    baseRevision: initialRev,
    command: {
      id: 'cmd_a',
      type: 'set_cell',
      sheetId: sheet.id,
      rowId: sheet.rows[3].id,
      colId: sheet.cols[3].id,
      value: 5,
    },
    affectedKeys: [`${sheet.id}:${sheet.rows[3].id}:${sheet.cols[3].id}`],
  };

  const resA = journal.submitOperation(opA);
  assert.equal(resA.success, true);
  assert.equal(wb.revision, initialRev + 1);

  // Collaborator B concurrently edits cell row 3 col 4 (length m) based on initialRev
  const opB: WorkbookOperation = {
    operationId: 'op_b',
    authorId: 'bob',
    timestamp: 1005,
    baseRevision: initialRev, // Stale! Base was initialRev, but current is initialRev + 1
    command: {
      id: 'cmd_b',
      type: 'set_cell',
      sheetId: sheet.id,
      rowId: sheet.rows[3].id,
      colId: sheet.cols[4].id,
      value: 750,
    },
    affectedKeys: [`${sheet.id}:${sheet.rows[3].id}:${sheet.cols[4].id}`],
  };

  const resB = journal.submitOperation(opB);
  assert.equal(resB.success, true, 'Disjoint edit must rebase and succeed');
  assert.equal(resB.rebased, true, 'Operation B was flagged as rebased');
  assert.equal(wb.revision, initialRev + 2);

  // Assert both values exist in workbook without loss
  const cellA = sheet.cells[`${sheet.rows[3].id}:${sheet.cols[3].id}`];
  const cellB = sheet.cells[`${sheet.rows[3].id}:${sheet.cols[4].id}`];
  assert.equal(cellA.value, 5, 'Alice edit retained');
  assert.equal(cellB.value, 750, 'Bob disjoint edit retained');
});

test('overlapping concurrent edits preserve conflict semantics for review (never silent last-write-wins)', () => {
  const wb = loadStandardIpcWorkbook();
  const journal = new WorkbookOperationJournal(wb);
  const sheet = wb.sheets[0];

  const targetRow = sheet.rows[3].id;
  const targetCol = sheet.cols[3].id;
  const affectedKey = `${sheet.id}:${targetRow}:${targetCol}`;
  const initialRev = wb.revision;

  // Collaborator A edits cell to 10
  const opA: WorkbookOperation = {
    operationId: 'op_a',
    authorId: 'alice',
    timestamp: 1000,
    baseRevision: initialRev,
    command: {
      id: 'cmd_a',
      type: 'set_cell',
      sheetId: sheet.id,
      rowId: targetRow,
      colId: targetCol,
      value: 10,
    },
    affectedKeys: [affectedKey],
  };
  const resA = journal.submitOperation(opA);
  assert.equal(resA.success, true);
  assert.equal(sheet.cells[`${targetRow}:${targetCol}`].value, 10);

  // Collaborator B concurrently edits SAME cell to 20 based on initialRev
  const opB: WorkbookOperation = {
    operationId: 'op_b',
    authorId: 'bob',
    timestamp: 1005,
    baseRevision: initialRev, // Stale!
    command: {
      id: 'cmd_b',
      type: 'set_cell',
      sheetId: sheet.id,
      rowId: targetRow,
      colId: targetCol,
      value: 20,
    },
    affectedKeys: [affectedKey],
  };

  const resB = journal.submitOperation(opB);
  // Must NOT succeed silently!
  assert.equal(resB.success, false, 'Overlapping stale edit must be rejected');
  assert.ok(resB.conflict, 'Conflict record must be generated');
  assert.equal(resB.conflict?.status, 'pending_review');
  assert.equal(resB.conflict?.currentValue, 10);
  assert.equal(resB.conflict?.incomingValue, 20);

  // Current workbook value MUST remain 10 (never silent last-write-wins)
  assert.equal(sheet.cells[`${targetRow}:${targetCol}`].value, 10, 'Workbook cell must NOT be overwritten');

  // Conflict review workflow:
  // Reviewer accepts incoming edit from Bob
  const conflictId = resB.conflict!.conflictId;
  const resolved = journal.resolveConflict(conflictId, 'accept_incoming', 'lead_engineer');
  assert.equal(resolved, true);
  assert.equal(sheet.cells[`${targetRow}:${targetCol}`].value, 20, 'Resolved value applied to workbook');
});

test('structural operations carry reference transformations and compensating undo entries', () => {
  const wb = loadStandardIpcWorkbook();
  const journal = new WorkbookOperationJournal(wb);
  const sheet = wb.sheets[0];

  const formulaCell = sheet.cells[`${sheet.rows[3].id}:${sheet.cols[7].id}`];
  assert.equal(formulaCell.formula, '=D4*E4*F4*G4');

  // Insert 2 rows above row index 3
  const insertOp: WorkbookOperation = {
    operationId: 'op_insert',
    authorId: 'civil_engineer',
    timestamp: 2000,
    baseRevision: wb.revision,
    command: {
      id: 'cmd_insert',
      type: 'insert_rows',
      sheetId: sheet.id,
      atIndex: 2,
      count: 2,
    },
    affectedKeys: deriveAffectedKeys({
      id: 'cmd_insert',
      type: 'insert_rows',
      sheetId: sheet.id,
      atIndex: 2,
      count: 2,
    }),
  };

  const resInsert = journal.submitOperation(insertOp);
  assert.equal(resInsert.success, true);
  assert.ok(resInsert.compensatingCommand, 'Compensating command generated');

  // Shifted formula: row 4 shifted down by 2 rows -> row 6
  assert.equal(formulaCell.formula, '=D6*E6*F6*G6', 'Formula references shifted down');

  // Perform compensating undo
  const undid = journal.undo();
  assert.equal(undid, true);
  assert.equal(formulaCell.formula, '=D4*E4*F4*G4', 'Formula restored on compensating undo');
});

test('checkpoints and history compaction bound history growth with deterministic recovery', () => {
  const wb = loadStandardIpcWorkbook();
  const journal = new WorkbookOperationJournal(wb);
  const sheet = wb.sheets[0];

  // Apply 5 sequential operations
  for (let i = 1; i <= 5; i++) {
    const op: WorkbookOperation = {
      operationId: `op_${i}`,
      authorId: `agent_${i}`,
      timestamp: 3000 + i,
      baseRevision: wb.revision,
      command: {
        id: `cmd_${i}`,
        type: 'set_cell',
        sheetId: sheet.id,
        rowId: sheet.rows[0].id,
        colId: sheet.cols[0].id,
        value: `Title Version ${i}`,
        forceUnlock: true,
      },
      affectedKeys: [`${sheet.id}:${sheet.rows[0].id}:${sheet.cols[0].id}`],
    };
    journal.submitOperation(op);
  }

  assert.equal(journal.getHistory().length, 5);

  // Capture checkpoint at revision 6
  const ckpt = journal.createCheckpoint();
  assert.equal(ckpt.revision, wb.revision);
  assert.ok(ckpt.checksum.length === 64, 'SHA-256 checksum created');

  // Compact history
  const { prunedCount, activeCheckpoint } = journal.compact();
  assert.equal(activeCheckpoint.checkpointId, ckpt.checkpointId);
  assert.equal(prunedCount, 5, 'Older operations pruned to bound growth');
  assert.equal(journal.getHistory().length, 0, 'History compacted');

  // Apply subsequent delta operation after checkpoint
  const postCkptOp: WorkbookOperation = {
    operationId: 'op_post_ckpt',
    authorId: 'auditor',
    timestamp: 4000,
    baseRevision: wb.revision,
    command: {
      id: 'cmd_post',
      type: 'set_cell',
      sheetId: sheet.id,
      rowId: sheet.rows[0].id,
      colId: sheet.cols[0].id,
      value: 'Title Final Post Checkpoint',
      forceUnlock: true,
    },
    affectedKeys: [`${sheet.id}:${sheet.rows[0].id}:${sheet.cols[0].id}`],
  };
  journal.submitOperation(postCkptOp);

  // Recover state from Checkpoint + Delta
  const recoveredWb = WorkbookOperationJournal.recoverFromCheckpoint(
    ckpt,
    [postCkptOp]
  );

  // Checksum comparison: recovered workbook must match active workbook exactly
  const activeChecksum = computeWorkbookChecksum(wb);
  const recoveredChecksum = computeWorkbookChecksum(recoveredWb);
  assert.equal(recoveredChecksum, activeChecksum, 'Recovered workbook matches active state bit-for-bit');
  assert.equal(
    recoveredWb.sheets[0].cells[`${sheet.rows[0].id}:${sheet.cols[0].id}`].value,
    'Title Final Post Checkpoint'
  );
});
