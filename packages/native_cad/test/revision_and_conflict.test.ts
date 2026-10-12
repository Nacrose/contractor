import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CadDocument,
  CadRevisionEngine,
  LineEntity,
  LwPolylineEntity,
  CadGroupOperation,
} from '../src/index.js';

// ---------------------------------------------------------------------------
// 1. Independent Concurrent Edits Compose Cleanly
// ---------------------------------------------------------------------------

test('revision engine: independent concurrent edits on disjoint entities compose cleanly', () => {
  const doc = new CadDocument();

  const lineA: LineEntity = {
    handle: '10A',
    type: 'LINE',
    layer: 'WALLS',
    start: { x: 0, y: 0 },
    end: { x: 10, y: 0 },
    revision: 1,
  };
  const lineB: LineEntity = {
    handle: '10B',
    type: 'LINE',
    layer: 'DOORS',
    start: { x: 20, y: 0 },
    end: { x: 30, y: 0 },
    revision: 1,
  };

  doc.addEntity(lineA);
  doc.addEntity(lineB);

  const initialDocRev = doc.revision;

  // Operation from Author A on Line A
  const opA: CadGroupOperation = {
    id: 'op_a_1',
    name: 'Move Line A',
    authorId: 'user_architect',
    baseDocumentRevision: initialDocRev,
    mutations: [
      {
        handle: '10A',
        action: 'UPDATE',
        expectedRevision: 1,
        entity: {
          ...lineA,
          end: { x: 15, y: 0 },
        },
      },
    ],
  };

  const resA = CadRevisionEngine.applyGroupOperation(doc, opA);
  assert.equal(resA.success, true);
  assert.equal(doc.getEntity('10A')?.revision, 2);
  assert.equal(doc.getEntity('10A')?.updatedBy, 'user_architect');

  // Concurrent Operation from Author B on Line B expecting revision 1
  const opB: CadGroupOperation = {
    id: 'op_b_1',
    name: 'Lengthen Line B',
    authorId: 'user_engineer',
    baseDocumentRevision: initialDocRev,
    mutations: [
      {
        handle: '10B',
        action: 'UPDATE',
        expectedRevision: 1,
        entity: {
          ...lineB,
          end: { x: 35, y: 0 },
        },
      },
    ],
  };

  const resB = CadRevisionEngine.applyGroupOperation(doc, opB);
  assert.equal(resB.success, true);
  assert.equal(doc.getEntity('10B')?.revision, 2);
  assert.equal(doc.getEntity('10B')?.updatedBy, 'user_engineer');

  // Both edits composed cleanly without conflict
  assert.equal(CadRevisionEngine.getPendingConflicts(doc).length, 0);
  assert.equal((doc.getEntity('10A') as LineEntity).end.x, 15);
  assert.equal((doc.getEntity('10B') as LineEntity).end.x, 35);
});

// ---------------------------------------------------------------------------
// 2. Stale Writer Conflict Rejection and Intent Preservation
// ---------------------------------------------------------------------------

test('revision engine: rejects stale writer edits and preserves intent for human review (never LWW)', () => {
  const doc = new CadDocument();

  const line: LineEntity = {
    handle: '20A',
    type: 'LINE',
    layer: 'BEAMS',
    start: { x: 0, y: 0 },
    end: { x: 50, y: 0 },
    revision: 1,
  };
  doc.addEntity(line);

  // Author 1 updates the beam
  const op1: CadGroupOperation = {
    id: 'op_update_1',
    name: 'First Update',
    authorId: 'user_1',
    baseDocumentRevision: doc.revision,
    mutations: [
      {
        handle: '20A',
        action: 'UPDATE',
        expectedRevision: 1,
        entity: {
          ...line,
          end: { x: 60, y: 0 },
        },
      },
    ],
  };
  const res1 = CadRevisionEngine.applyGroupOperation(doc, op1);
  assert.equal(res1.success, true);
  assert.equal(doc.getEntity('20A')?.revision, 2);

  // Author 2 tries to update with stale expectation (still expects revision 1)
  const op2: CadGroupOperation = {
    id: 'op_stale_2',
    name: 'Conflicting Stale Update',
    authorId: 'user_2',
    baseDocumentRevision: 1,
    mutations: [
      {
        handle: '20A',
        action: 'UPDATE',
        expectedRevision: 1, // Stale!
        entity: {
          ...line,
          end: { x: 80, y: 0 },
        },
      },
    ],
  };

  const res2 = CadRevisionEngine.applyGroupOperation(doc, op2);
  assert.equal(res2.success, false);
  assert.ok(res2.conflict);
  assert.equal(res2.conflict.reason, 'STALE_WRITER_CONFLICT');
  assert.deepEqual(res2.conflict.conflictingHandles, ['20A']);
  assert.equal(res2.conflict.expectedRevisions['20A'], 1);
  assert.equal(res2.conflict.actualRevisions['20A'], 2);

  // Ensure entity in doc was NOT overwritten (never last-write-wins)
  assert.equal((doc.getEntity('20A') as LineEntity).end.x, 60);
  assert.equal(doc.getEntity('20A')?.revision, 2);

  // Conflict record stored and pending review
  const pending = CadRevisionEngine.getPendingConflicts(doc);
  assert.equal(pending.length, 1);
  assert.equal(pending[0].authorId, 'user_2');
  assert.equal(pending[0].rejectedMutations.length, 1);
});

// ---------------------------------------------------------------------------
// 3. Atomic Topology Validation (Bowtie Self-Intersection Halts Whole Group)
// ---------------------------------------------------------------------------

test('revision engine: rejects entire group atomically when topology boundary self-intersects', () => {
  const doc = new CadDocument();

  // Create valid rectangle polyline
  const rectPoly: LwPolylineEntity = {
    handle: '30A',
    type: 'LWPOLYLINE',
    layer: 'BOUNDARY',
    closed: true,
    vertices: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ],
    revision: 1,
  };

  const colEntity: LineEntity = {
    handle: '30B',
    type: 'LINE',
    layer: 'COLUMNS',
    start: { x: 5, y: 5 },
    end: { x: 5, y: 6 },
    revision: 1,
  };

  doc.addEntity(rectPoly);
  doc.addEntity(colEntity);

  // Proposed group operation:
  // 1. Move column (valid on its own)
  // 2. Distort polyline into self-intersecting hourglass/bowtie figure-8 (topology violation)
  const opBowtie: CadGroupOperation = {
    id: 'op_bowtie_distort',
    name: 'Distort Room and Move Column',
    authorId: 'user_junior',
    baseDocumentRevision: doc.revision,
    requiresTopologyValidation: true,
    topologyValidationScope: {
      contourHandles: ['30A'],
    },
    mutations: [
      {
        handle: '30B',
        action: 'UPDATE',
        expectedRevision: 1,
        entity: {
          ...colEntity,
          end: { x: 5, y: 8 },
        },
      },
      {
        handle: '30A',
        action: 'UPDATE',
        expectedRevision: 1,
        entity: {
          ...rectPoly,
          vertices: [
            { x: 0, y: 0 },
            { x: 10, y: 10 }, // crossed diagonal
            { x: 10, y: 0 },  // crossed diagonal -> self-intersection
            { x: 0, y: 10 },
          ],
        },
      },
    ],
  };

  const res = CadRevisionEngine.applyGroupOperation(doc, opBowtie);

  // Group operation must fail atomically
  assert.equal(res.success, false);
  assert.ok(res.conflict);
  assert.equal(res.conflict.reason, 'TOPOLOGY_VIOLATION');
  assert.ok(res.conflict.topologyErrors && res.conflict.topologyErrors.length > 0);

  // CRITICAL CHECK: Column must NOT have been updated! Zero partial mutations committed
  const unchangedCol = doc.getEntity('30B') as LineEntity;
  assert.equal(unchangedCol.end.y, 6);
  assert.equal(unchangedCol.revision, 1);

  // Polyline also untouched
  const unchangedPoly = doc.getEntity('30A') as LwPolylineEntity;
  assert.equal(unchangedPoly.vertices[1].y, 0);
  assert.equal(unchangedPoly.revision, 1);
});

// ---------------------------------------------------------------------------
// 4. Conflict Resolution Workflows (Overwrite, Rebase, Discard)
// ---------------------------------------------------------------------------

test('revision engine: provides explicit human conflict resolution workflows (OVERWRITE, REBASE, DISCARD)', () => {
  const doc = new CadDocument();

  const line: LineEntity = {
    handle: '40A',
    type: 'LINE',
    layer: 'SLAB',
    start: { x: 0, y: 0 },
    end: { x: 100, y: 0 },
    revision: 1,
  };
  doc.addEntity(line);

  // Step 1: Create a conflict
  CadRevisionEngine.applyGroupOperation(doc, {
    id: 'op_a',
    name: 'Edit A',
    authorId: 'alice',
    baseDocumentRevision: doc.revision,
    mutations: [
      {
        handle: '40A',
        action: 'UPDATE',
        expectedRevision: 1,
        entity: { ...line, end: { x: 110, y: 0 } },
      },
    ],
  });

  const staleOp: CadGroupOperation = {
    id: 'op_b',
    name: 'Edit B Stale',
    authorId: 'bob',
    baseDocumentRevision: 1,
    mutations: [
      {
        handle: '40A',
        action: 'UPDATE',
        expectedRevision: 1,
        entity: { ...line, end: { x: 200, y: 0 } },
      },
    ],
  };
  const conflictRes = CadRevisionEngine.applyGroupOperation(doc, staleOp);
  assert.equal(conflictRes.success, false);
  const conflictId = conflictRes.conflict!.conflictId;

  // Test Workflow 1: DISCARD
  // Clone doc to test discard separately
  const docDiscard = new CadDocument();
  docDiscard.addEntity(doc.getEntity('40A')!);
  docDiscard.conflictRecords = [...doc.conflictRecords];

  const discardRes = CadRevisionEngine.resolveConflict(docDiscard, conflictId, 'DISCARD');
  assert.equal(discardRes.success, true);
  assert.equal(CadRevisionEngine.getPendingConflicts(docDiscard).length, 0);
  assert.equal((docDiscard.getEntity('40A') as LineEntity).end.x, 110);

  // Test Workflow 2: OVERWRITE (force author Bob's intent)
  const docOverwrite = new CadDocument();
  docOverwrite.addEntity(doc.getEntity('40A')!);
  docOverwrite.conflictRecords = [...doc.conflictRecords];

  const overwriteRes = CadRevisionEngine.resolveConflict(docOverwrite, conflictId, 'OVERWRITE');
  assert.equal(overwriteRes.success, true);
  assert.equal((docOverwrite.getEntity('40A') as LineEntity).end.x, 200);
  assert.equal(docOverwrite.getEntity('40A')?.updatedBy, 'bob');

  // Test Workflow 3: REBASE (re-query latest revision and re-apply)
  const docRebase = new CadDocument();
  docRebase.addEntity(doc.getEntity('40A')!);
  docRebase.conflictRecords = [...doc.conflictRecords];

  const rebaseRes = CadRevisionEngine.resolveConflict(docRebase, conflictId, 'REBASE');
  assert.equal(rebaseRes.success, true);
  assert.equal((docRebase.getEntity('40A') as LineEntity).end.x, 200);
  assert.equal(docRebase.getEntity('40A')?.revision, 3);
});
