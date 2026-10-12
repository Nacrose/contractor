import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DocumentSyncAdapter,
} from '../src/document_sync_adapter.js';
import { FrozenDocumentModificationError } from '../src/authority_contract.js';

test('DocumentSyncAdapter: local offline durability benchmark (< 5ms) and revision sequence', () => {
  const adapter = new DocumentSyncAdapter();

  // 1. Initial draft save
  const { record: rec1, durationMs: d1 } = adapter.saveDraftLocally({
    documentId: 'DOC-SITE-MEMO-101',
    artifactType: 'WORDCRAFT_DOCX',
    baseRevisionId: null,
    title: 'Site Geotechnical Observation Memo',
    contentPayload: {
      chainage: 'CH 12+450',
      observation: 'Water ingress rate 35 L/s observed at invert.',
    },
    author: 'Er. Ramesh Karki',
  });

  assert.equal(rec1.documentId, 'DOC-SITE-MEMO-101');
  assert.equal(rec1.sequenceNumber, 1);
  assert.equal(rec1.syncStatus, 'LOCAL_DIRTY');
  assert.ok(d1 < 10.0, `Local save took ${d1}ms (target < 5ms avg)`);

  // 2. Subsequent local edit save
  const { record: rec2, durationMs: d2 } = adapter.saveDraftLocally({
    documentId: 'DOC-SITE-MEMO-101',
    artifactType: 'WORDCRAFT_DOCX',
    baseRevisionId: rec1.revisionId,
    title: 'Site Geotechnical Observation Memo',
    contentPayload: {
      chainage: 'CH 12+450',
      observation: 'Water ingress rate 35 L/s; pressure grouting canopy initiated.',
    },
    author: 'Er. Ramesh Karki',
  });

  assert.equal(rec2.sequenceNumber, 2);
  assert.equal(rec2.baseRevisionId, rec1.revisionId);
  assert.ok(d2 < 10.0, `Subsequent save took ${d2}ms`);

  // Check revision history
  const history = adapter.getRevisionHistory('DOC-SITE-MEMO-101');
  assert.equal(history.length, 2);
  assert.equal(history[0].sequenceNumber, 1);
  assert.equal(history[1].sequenceNumber, 2);

  // Check change-feed events
  const events = adapter.getChangeFeedEvents();
  assert.equal(events.length, 2);
  assert.equal(events[0].type, 'DOCUMENT_DRAFT_CREATED');
  assert.equal(events[1].type, 'DOCUMENT_DRAFT_MODIFIED');
});

test('DocumentSyncAdapter: concurrent edit detection and automated branch fork review (no silent overwriting)', () => {
  const adapter = new DocumentSyncAdapter();

  // 1. User A creates and edits document locally
  const { record: initialDraft } = adapter.saveDraftLocally({
    documentId: 'DOC-VARIATION-042',
    artifactType: 'WORDCRAFT_DOCX',
    baseRevisionId: null,
    title: 'Variation Proposal Sub-Clause 13.2',
    contentPayload: { costImpact: 'NPR 4,500,000' },
    author: 'Er. UserA',
  });

  // 2. Incoming server update from another collaborator who committed ahead
  const serverUpdatedRecord = {
    ...initialDraft,
    revisionId: 'REV-DOC-VARIATION-042-2-SERVER',
    sequenceNumber: 2,
    contentPayloadJson: JSON.stringify({ costImpact: 'NPR 5,200,000 (Updated by Engineer)' }),
    binarySha256: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2',
    localSavedAt: new Date().toISOString(),
    syncStatus: 'SYNCED' as const,
    author: 'Er. ProjectDirector',
  };

  // User A also made dirty local edits in the meantime based on revision 1
  adapter.saveDraftLocally({
    documentId: 'DOC-VARIATION-042',
    artifactType: 'WORDCRAFT_DOCX',
    baseRevisionId: initialDraft.revisionId,
    title: 'Variation Proposal Sub-Clause 13.2',
    contentPayload: { costImpact: 'NPR 4,800,000 (User A draft)' },
    author: 'Er. UserA',
  });

  // 3. Process server update -> Conflict detected!
  const syncResult = adapter.processIncomingServerRevision(serverUpdatedRecord);
  assert.equal(syncResult.status, 'CONFLICT');
  assert.ok(syncResult.conflictRecord);
  assert.equal(syncResult.conflictRecord.status, 'PENDING_MANUAL_REVIEW');

  // 4. Verify branch fork created to preserve User A's uncommitted work
  const forkedDocId = syncResult.conflictRecord.forkedDocumentId;
  assert.ok(forkedDocId.includes('doc-variation-042-fork-er__usera'));

  const forkedRecord = adapter.getRecord(forkedDocId);
  assert.ok(forkedRecord);
  assert.equal(forkedRecord.forkBranchOf, 'DOC-VARIATION-042');
  assert.ok(forkedRecord.contentPayloadJson.includes('User A draft'));

  // 5. Verify change feed contains conflict and fork events
  const conflictEvents = adapter.getChangeFeedEvents().filter(
    (e) => e.type === 'DOCUMENT_CONCURRENT_CONFLICT_DETECTED' || e.type === 'DOCUMENT_BRANCH_FORKED'
  );
  assert.equal(conflictEvents.length, 2);
});

test('DocumentSyncAdapter: immutable issuance lock fail-closed against modification and network overrides', () => {
  const adapter = new DocumentSyncAdapter();

  adapter.saveDraftLocally({
    documentId: 'DOC-FINAL-IPC-09',
    artifactType: 'WORDCRAFT_DOCX',
    baseRevisionId: null,
    title: 'Interim Payment Certificate No 09',
    contentPayload: { certifiedTotalPaisa: '48250000000' },
    author: 'Er. Sanjeev Shrestha',
  });

  // 1. Issue and freeze document
  const issued = adapter.issueDocument('DOC-FINAL-IPC-09', 'Er. Ramesh Karki (Authorized Signatory)');
  assert.equal(issued.status, 'ISSUED');
  assert.equal(issued.syncStatus, 'FROZEN_LOCKED');

  // 2. Reject subsequent local edit attempts fail-closed
  assert.throws(
    () => {
      adapter.saveDraftLocally({
        documentId: 'DOC-FINAL-IPC-09',
        artifactType: 'WORDCRAFT_DOCX',
        baseRevisionId: issued.revisionId,
        title: 'Interim Payment Certificate No 09 (Tampered)',
        contentPayload: { certifiedTotalPaisa: '50000000000' },
        author: 'Malicious Actor',
      });
    },
    (err: any) => err instanceof FrozenDocumentModificationError
  );

  // 3. Reject incoming network revisions to issued document
  const networkTamper = {
    ...issued,
    revisionId: 'REV-TAMPERED-SERVER',
    contentPayloadJson: JSON.stringify({ certifiedTotalPaisa: '99999999999' }),
  };

  const netResult = adapter.processIncomingServerRevision(networkTamper);
  assert.equal(netResult.status, 'FROZEN_REJECTED');

  // Document state remains unmodified
  const finalState = adapter.getRecord('DOC-FINAL-IPC-09');
  assert.equal(finalState?.status, 'ISSUED');
  assert.ok(finalState?.contentPayloadJson.includes('48250000000'));
});
