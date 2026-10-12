import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DocumentAuthorityGuard,
  DocumentDataFlowEngine,
  DocumentAuthorityViolationError,
  FrozenDocumentModificationError,
  DocumentProjectionPayload,
} from '../src/authority_contract.js';

test('DocumentAuthorityGuard: enforces BigInt Paisa and authoritative double-entry provenance', () => {
  // 1. Valid figure
  assert.doesNotThrow(() => {
    DocumentAuthorityGuard.validateFinancialFigure({
      fieldName: 'certifiedIpcAmount',
      amountPaisa: 48250000000n, // NPR 482,500,000.00
      formattedNepaliNpr: 'NPR 482,500,000.00',
      sourceLedgerSeq: 104,
      sourceAccountCode: '1100-RECEIVABLES-CLIENT',
    });
  });

  // 2. Reject floating-point amount
  assert.throws(
    () => {
      DocumentAuthorityGuard.validateFinancialFigure({
        fieldName: 'certifiedIpcAmount',
        amountPaisa: 482500000.5 as any,
        formattedNepaliNpr: 'NPR 482,500,000.50',
        sourceLedgerSeq: 104,
        sourceAccountCode: '1100-RECEIVABLES-CLIENT',
      });
    },
    (err: any) => err instanceof DocumentAuthorityViolationError
  );

  // 3. Reject figure lacking ledger sequence / account code
  assert.throws(
    () => {
      DocumentAuthorityGuard.validateFinancialFigure({
        fieldName: 'unauthorizedBonus',
        amountPaisa: 50000000n,
        formattedNepaliNpr: 'NPR 500,000.00',
        sourceLedgerSeq: 0,
        sourceAccountCode: '',
      });
    },
    (err: any) => err instanceof DocumentAuthorityViolationError
  );
});

test('DocumentAuthorityGuard: strictly blocks client-side VAT or discount arithmetic in presentation layer', () => {
  assert.throws(
    () => {
      DocumentAuthorityGuard.validateFinancialFigure({
        fieldName: 'invoiceTotal',
        amountPaisa: 100000000n,
        formattedNepaliNpr: 'NPR 1,000,000.00',
        sourceLedgerSeq: 201,
        sourceAccountCode: '2100-PAYABLES',
        clientCalculatedVat: 130000.0, // FORBIDDEN!
      } as any);
    },
    (err: any) => err instanceof DocumentAuthorityViolationError
  );
});

test('DocumentDataFlowEngine: creates draft, computes cryptographic snapshot hash, and verifies fidelity', () => {
  const engine = new DocumentDataFlowEngine();

  const payload: DocumentProjectionPayload = {
    documentId: 'doc-ipc-042',
    documentType: 'REPORT',
    title: 'Interim Payment Certificate No. 4',
    projectName: 'Kathmandu Bulk Water Tunnel',
    financialFigures: [
      {
        fieldName: 'workCompletedToDate',
        amountPaisa: 35000000000n, // NPR 350,000,000
        formattedNepaliNpr: 'NPR 350,000,000.00',
        sourceLedgerSeq: 301,
        sourceAccountCode: '4000-REVENUE-CONTRACT',
      },
      {
        fieldName: 'retentionDeduction',
        amountPaisa: 1750000000n, // NPR 17,500,000
        formattedNepaliNpr: 'NPR 17,500,000.00',
        sourceLedgerSeq: 302,
        sourceAccountCode: '2200-RETENTION-HELD',
      },
    ],
    boqItems: [
      {
        itemNumber: 'BOQ-01',
        description: 'Tunnel excavation in rock class III',
        unit: 'm3',
        quantity: '12500.00',
        ratePaisa: 2800000n, // NPR 28,000.00 / m3
        totalPaisa: 35000000000n,
        sourceBoqRevision: 4,
      },
    ],
    milestones: [
      {
        milestoneId: 'ms-01',
        name: 'Portal Adit Completed',
        targetDate: '2026-09-30',
        status: 'COMPLETED',
        varianceDays: 0,
        sourceScheduleRevision: 2,
      },
    ],
    narrativeSections: {
      executiveSummary: 'Tunnel heading advanced by 42 meters this billing cycle.',
    },
  };

  const provenance = engine.createDraft(payload, 'tpl-fidic-ipc', 1, 'Contractor Estimator');
  assert.equal(provenance.status, 'DRAFT');
  assert.equal(provenance.templateVersion, 1);
  assert.ok(provenance.snapshotHash.length === 64);
  assert.equal(provenance.sourceEntitiesWatermark.ledgerSeq, 302);
  assert.equal(provenance.sourceEntitiesWatermark.boqRevision, 4);

  // Exact fidelity verification
  const authoritativeTotal = 35000000000n + 1750000000n;
  const isMatch = engine.verifyFidelity('doc-ipc-042', authoritativeTotal, 1);
  assert.equal(isMatch, true);

  // Mismatch fails
  const isMismatch = engine.verifyFidelity('doc-ipc-042', authoritativeTotal + 100n, 1);
  assert.equal(isMismatch, false);
});

test('DocumentDataFlowEngine: allows draft update but freezes permanently upon issuance', () => {
  const engine = new DocumentDataFlowEngine();

  const payload: DocumentProjectionPayload = {
    documentId: 'doc-letter-001',
    documentType: 'LETTER',
    title: 'Site Instruction Acknowledgement',
    projectName: 'Kathmandu Bulk Water Tunnel',
    financialFigures: [],
    boqItems: [],
    milestones: [],
    narrativeSections: {
      body: 'Initial draft notice.',
    },
  };

  engine.createDraft(payload, 'tpl-letter', 1, 'Junior Engineer');

  // Draft update is permitted
  const updatedPayload: DocumentProjectionPayload = {
    ...payload,
    narrativeSections: {
      body: 'Revised formal notice acknowledging Site Instruction SI-012.',
    },
  };
  const updatedProv = engine.updateDraft('doc-letter-001', updatedPayload, 'Senior Engineer');
  assert.equal(updatedProv.author, 'Senior Engineer');

  // Issue document
  const issuedProv = engine.issueDocument('doc-letter-001', 'Er. Sushil Thapa (Project Director)');
  assert.equal(issuedProv.status, 'ISSUED');
  assert.equal(issuedProv.authorizedSignatory, 'Er. Sushil Thapa (Project Director)');
  assert.ok(issuedProv.issuedAt);

  // Attempting to modify issued document fails-closed!
  assert.throws(
    () => {
      engine.updateDraft('doc-letter-001', updatedPayload, 'Rogue Editor');
    },
    (err: any) => err instanceof FrozenDocumentModificationError
  );

  assert.throws(
    () => {
      engine.issueDocument('doc-letter-001', 'Another Signatory');
    },
    (err: any) => err instanceof FrozenDocumentModificationError
  );
});
