import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WordCraftHostAdapter,
  CONSTRUCTION_CORRESPONDENCE_TEMPLATES,
  WordCraftUIMode,
} from '../src/wordcraft_adapter.js';
import {
  DocumentAuthorityViolationError,
  FrozenDocumentModificationError,
} from '../src/authority_contract.js';

test('WordCraftHostAdapter: dual UI mode transitions and configuration (ADR-0016)', () => {
  const adapter = WordCraftHostAdapter.createCorrespondence(
    'FIDIC_NOTICE_OF_CLAIM',
    {
      referenceNumber: 'NOT-2026-001',
      date: '2026-10-12',
      projectName: 'KTM Bulk Water Tunnel',
    },
    'Er. Sanjeev Shrestha'
  );

  // 1. Initial mode is embedded_view
  assert.equal(adapter.getMode(), 'embedded_view');
  const embeddedConfig = adapter.getConfiguration();
  assert.equal(embeddedConfig.showRibbon, false);
  assert.equal(embeddedConfig.enableDirectCanvasEditing, false);
  assert.equal(embeddedConfig.highlightPlaceholders, true);

  // Set cursor state in embedded view
  adapter.setCursorState({
    paragraphIndex: 14,
    characterOffset: 32,
    activeFieldKey: 'conditionDescription',
  });

  // 2. Switch to full_editor mode
  const transition = adapter.setMode('full_editor');
  assert.equal(transition.previousMode, 'embedded_view');
  assert.equal(transition.newMode, 'full_editor');
  assert.equal(transition.cursorPreserved, true);

  const fullConfig = adapter.getConfiguration();
  assert.equal(fullConfig.showRibbon, true);
  assert.equal(fullConfig.showReviewTrackChanges, true);
  assert.equal(fullConfig.enableDirectCanvasEditing, true);

  // 3. Verify cursor state preserved
  const cursor = adapter.getCursorState();
  assert.equal(cursor.paragraphIndex, 14);
  assert.equal(cursor.characterOffset, 32);
  assert.equal(cursor.activeFieldKey, 'conditionDescription');

  // 4. Switch back to embedded_view mode
  adapter.setMode('embedded_view');
  assert.equal(adapter.getMode(), 'embedded_view');
  assert.equal(adapter.getCursorState().paragraphIndex, 14);
});

test('WordCraftHostAdapter: correspondence template library and placeholder validation', () => {
  // Built-in templates exist
  assert.ok(CONSTRUCTION_CORRESPONDENCE_TEMPLATES['FIDIC_NOTICE_OF_CLAIM']);
  assert.ok(CONSTRUCTION_CORRESPONDENCE_TEMPLATES['ENGINEER_INSTRUCTION_ACK']);
  assert.ok(CONSTRUCTION_CORRESPONDENCE_TEMPLATES['VARIATION_PROPOSAL_MEMO']);
  assert.ok(CONSTRUCTION_CORRESPONDENCE_TEMPLATES['SITE_INSPECTION_MEMO']);

  const adapter = WordCraftHostAdapter.createCorrespondence(
    'FIDIC_NOTICE_OF_CLAIM',
    {
      referenceNumber: 'CTR-TUNNEL-NOT-042',
      date: '2026-10-12',
      projectName: 'Kathmandu Bulk Water Tunnel',
    },
    'Er. Sanjeev Shrestha'
  );

  // Initial incomplete validation
  const val1 = adapter.validatePlaceholders();
  assert.equal(val1.valid, false);
  assert.ok(val1.missingRequired.includes('engineerName'));
  assert.ok(val1.missingRequired.includes('chainageOrLocation'));
  assert.ok(val1.missingRequired.includes('conditionDescription'));

  // Provide remaining required placeholders
  adapter.setPlaceholders({
    clientName: 'Melamchi Water Supply Development Board',
    engineerName: 'Dolsar-JV Consulting Engineers',
    contractorName: 'Himalayan Infrastructure & Construction JV',
    contractNumber: 'MWSDB/TUNNEL/01-ICB',
    eventDate: '2026-10-10',
    chainageOrLocation: 'CH 12+450 - 12+510',
    conditionDescription: 'Severe fault shear zone with heavy water ingress exceeding 45 L/s',
    clausesReferenced: 'FIDIC Red Book Sub-Clause 4.12 & Sub-Clause 20.1',
    authorizedSignatory: 'Er. Ramesh Karki (Contractor Representative)',
    estimatedCostImpact: 'NPR 13,550,000.00',
    estimatedDelayDays: '21',
  });

  const val2 = adapter.validatePlaceholders();
  assert.equal(val2.valid, true);
  assert.equal(val2.missingRequired.length, 0);
  assert.equal(val2.unresolvedTokens.length, 0);

  const fullText = adapter.renderFullDocumentText();
  assert.ok(fullText.includes('CTR-TUNNEL-NOT-042'));
  assert.ok(fullText.includes('Severe fault shear zone'));
  assert.ok(!fullText.includes('{{'));
});

test('WordCraftHostAdapter: track changes, reviewer comments, and authoritative financial figures', () => {
  const adapter = WordCraftHostAdapter.createCorrespondence(
    'ENGINEER_INSTRUCTION_ACK',
    {
      referenceNumber: 'CTR-ACK-009',
      date: '2026-10-12',
      engineerName: 'SMEC International',
      instructionRef: 'EI-TUN-104',
      instructionDate: '2026-10-08',
      contractorName: 'Himalayan Infrastructure',
      projectName: 'Kathmandu Bulk Water Tunnel',
      scopeSummary: 'Execution of additional drainage gallery at Adit 2',
      authorizedSignatory: 'Er. Ramesh Karki',
      impactNarrative: 'Additional excavation and shotcreting required as per revised drawing DWG-DRN-02.',
    },
    'Er. Sanjeev Shrestha'
  );

  // 1. Add reviewer comment
  const cmt = adapter.addComment({
    author: 'Er. Geotechnical Lead',
    text: 'Please confirm rock class before proceeding with shotcrete.',
    paragraphIndex: 12,
  });
  assert.equal(adapter.getComments().length, 1);
  assert.equal(cmt.resolved, false);

  adapter.resolveComment(cmt.id);
  assert.equal(adapter.getComments()[0].resolved, true);

  // 2. Add track change revision delta
  const rev = adapter.addRevision({
    author: 'Er. Senior Contracts Manager',
    type: 'insert',
    paragraphIndex: 14,
    range: [0, 45],
    text: 'Claim under Sub-Clause 13.3 will be submitted.',
    description: 'Added formal variation claim clause reference',
  });
  assert.equal(adapter.getRevisions().length, 1);
  assert.equal(rev.author, 'Er. Senior Contracts Manager');

  // 3. Attach authoritative financial figure
  adapter.addFinancialFigure({
    fieldName: 'estimatedAdditionalCost',
    amountPaisa: 620000000n, // NPR 6,200,000.00
    formattedNepaliNpr: 'NPR 6,200,000.00',
    sourceLedgerSeq: 304,
    sourceAccountCode: '5100-WIP-VARIATIONS',
  });
  assert.equal(adapter.getFinancialFigures().length, 1);
  assert.equal(adapter.getFinancialFigures()[0].amountPaisa, 620000000n);

  // 4. Reject client-side computed math
  assert.throws(
    () => {
      adapter.addFinancialFigure({
        fieldName: 'taxAdded',
        amountPaisa: 80600000n,
        formattedNepaliNpr: 'NPR 806,000.00',
        sourceLedgerSeq: 304,
        sourceAccountCode: '5100-WIP-VARIATIONS',
        clientCalculatedVat: 13,
      } as any);
    },
    (err: any) => err instanceof DocumentAuthorityViolationError
  );
});

test('WordCraftHostAdapter: freeze and issuance lock & OpenXML (.docx) package generation', () => {
  const adapter = WordCraftHostAdapter.createCorrespondence(
    'SITE_INSPECTION_MEMO',
    {
      referenceNumber: 'RFI-CONC-088',
      date: '2026-10-12',
      residentEngineer: 'Er. Dinesh Paudel',
      contractorName: 'Himalayan Infrastructure',
      projectName: 'Kathmandu Bulk Water Tunnel',
      locationChainage: 'CH 11+920 Inlet Portal Portal Wall',
      activityDescription: 'Reinforcement bar fixing and shuttering inspection for M30 concrete pour',
      scheduledDateTime: '2026-10-13 10:00 AM',
      drawingReference: 'DWG-PORTAL-STR-04 Rev B',
      qaQcInspector: 'Er. Binod Thapa',
      authorizedSignatory: 'Er. Ramesh Karki',
    },
    'Er. Sanjeev Shrestha'
  );

  adapter.addTable({
    title: 'Reinforcement Bar Verification',
    headers: ['Location', 'Bar Dia (mm)', 'Spacing (mm)', 'Cover (mm)', 'Inspection Status'],
    rows: [
      ['Inlet Wall Main', '25', '150 c/c', '50', 'Verified Passed'],
      ['Inlet Wall Distribution', '16', '200 c/c', '50', 'Verified Passed'],
    ],
  });

  // Export OpenXML package before issuance
  const docxPkg = adapter.exportOpenXmlPackage();
  assert.equal(docxPkg.documentId, 'RFI-CONC-088');
  assert.equal(docxPkg.filename, 'RFI-CONC-088.docx');
  assert.equal(docxPkg.mimeType, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.ok(docxPkg.parts['word/document.xml'].includes('Reinforcement Bar Verification'));
  assert.ok(docxPkg.parts['word/document.xml'].includes('Verified Passed'));
  assert.ok(docxPkg.parts['docProps/core.xml'].includes('Er. Sanjeev Shrestha'));
  assert.equal(docxPkg.roundTripVerified, true);
  assert.ok(docxPkg.metadataChecksum.length === 64); // SHA-256

  // Issue document
  const provenance = adapter.freezeAndIssue('Er. Ramesh Karki (Authorized Signatory)');
  assert.equal(adapter.getStatus(), 'ISSUED');
  assert.equal(provenance.status, 'ISSUED');
  assert.equal(provenance.authorizedSignatory, 'Er. Ramesh Karki (Authorized Signatory)');
  assert.ok(provenance.snapshotHash.length === 64);

  // Enforce freeze against subsequent modification
  assert.throws(
    () => {
      adapter.setPlaceholder('locationChainage', 'CH 12+000');
    },
    (err: any) => err instanceof FrozenDocumentModificationError
  );

  assert.throws(
    () => {
      adapter.addComment({
        author: 'Er. Late Commenter',
        text: 'Too late to comment',
        paragraphIndex: 1,
      });
    },
    (err: any) => err instanceof FrozenDocumentModificationError
  );
});
