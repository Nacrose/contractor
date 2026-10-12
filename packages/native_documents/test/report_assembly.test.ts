import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MultiSourceReportAssemblyPipeline,
  MultiSourceReportInputBundle,
} from '../src/report_assembly.js';
import { DocumentAuthorityViolationError } from '../src/authority_contract.js';

function createMockBundle(): MultiSourceReportInputBundle {
  return {
    reportId: 'ENG-REP-2026-10-M01',
    reportType: 'MONTHLY_ENGINEERING_REPORT',
    title: 'Monthly Engineering & Construction Progress Report — October 2026',
    projectName: 'Kathmandu Valley Underground Bulk Water Tunnel',
    contractNumber: 'MWSDB/TUNNEL/01-ICB',
    clientName: 'Melamchi Water Supply Development Board',
    contractorName: 'Himalayan Infrastructure & Construction JV',
    engineerName: 'Dolsar-JV Consulting Engineers',
    reportingPeriod: {
      startDate: '2026-10-01',
      endDate: '2026-10-31',
    },
    author: 'Er. Sanjeev Shrestha (Project Controls Lead)',
    executiveSummary:
      'Overall project physical progress reached 68.4% against scheduled 69.1%. Tunnel excavation at Fault Shear Zone CH 12+450 progressed under pre-grouting canopy.',
    siteLogs: [
      {
        logId: 'LOG-2026-10-10',
        date: '2026-10-10',
        weather: 'CLEAR',
        workActivities: [
          'Tunnel heading excavation CH 12+475 to 12+478',
          'Steel rib arch erection & rock bolt drilling',
        ],
        manpowerTotal: 142,
        equipmentActive: ['Jumbo Drill Rig #2', 'Shotcrete Robot Meyco', 'Dump Truck 25T (x4)'],
        revision: 2,
      },
      {
        logId: 'LOG-2026-10-11',
        date: '2026-10-11',
        weather: 'RAIN',
        workActivities: [
          'Invert concrete pour Section 12',
          'Fault zone water drainage pumping (42 L/s)',
        ],
        manpowerTotal: 138,
        equipmentActive: ['Batching Plant 60m3/h', 'Transit Mixer (x3)', 'Submersible Pumps (x6)'],
        revision: 1,
      },
    ],
    boqMeasurements: [
      {
        sheetId: 'MSR-BOQ-042',
        itemNumber: '2.14.01',
        description: 'Underground rock excavation in Class IV rock mass',
        unit: 'm3',
        previousQty: '14,250.00',
        currentQty: '1,820.00',
        cumulativeQty: '16,070.00',
        ratePaisa: 420000n, // NPR 4,200.00 / m3
        amountPaisa: 6749400000n, // NPR 67,494,000.00
        sourceLedgerSeq: 104,
        sourceAccountCode: '1100-RECEIVABLES-CLIENT',
        boqRevision: 4,
      },
      {
        sheetId: 'MSR-BOQ-043',
        itemNumber: '2.18.03',
        description: 'Fiber-reinforced wet shotcrete 150mm thick',
        unit: 'm2',
        previousQty: '8,400.00',
        currentQty: '950.00',
        cumulativeQty: '9,350.00',
        ratePaisa: 280000n, // NPR 2,800.00 / m2
        amountPaisa: 2618000000n, // NPR 26,180,000.00
        sourceLedgerSeq: 105,
        sourceAccountCode: '1100-RECEIVABLES-CLIENT',
        boqRevision: 4,
      },
    ],
    materialDeliveries: [
      {
        receiptId: 'RCV-MAT-892',
        challanNumber: 'CHAL-HIM-2026-441',
        materialName: 'OPC 53 Grade Cement (Shivam Cement)',
        quantityDelivered: '1,200.00',
        unit: 'Bags (50kg)',
        supplier: 'Shivam Cements Ltd.',
        qualityCertificateRef: 'QC-SHV-7712 (Passed 28-day strength 58.2 MPa)',
        deliveryDate: '2026-10-09',
        revision: 1,
      },
      {
        receiptId: 'RCV-MAT-895',
        challanNumber: 'CHAL-STEEL-092',
        materialName: 'TMT Reinforcement Fe500D (25mm / 32mm)',
        quantityDelivered: '45.50',
        unit: 'MT',
        supplier: 'Himal Steels Ltd.',
        qualityCertificateRef: 'QC-HIM-4401 (Passed yield 545 MPa)',
        deliveryDate: '2026-10-11',
        revision: 1,
      },
    ],
    scheduleMilestones: [
      {
        milestoneId: 'MS-CP-04',
        name: 'Tunnel Breakthrough to Adit 2 Junction',
        baselineDate: '2026-11-15',
        forecastDate: '2026-11-22',
        varianceDays: 7,
        completionPercent: 88,
        criticalPath: true,
        scheduleRevision: 3,
      },
      {
        milestoneId: 'MS-CP-05',
        name: 'Inlet Portal Gate Structure Substructure',
        baselineDate: '2026-12-01',
        forecastDate: '2026-11-28',
        varianceDays: -3,
        completionPercent: 72,
        criticalPath: false,
        scheduleRevision: 3,
      },
    ],
  };
}

test('MultiSourceReportAssemblyPipeline: multi-source report assembly & WordCraft OpenXML DOCX export', () => {
  const bundle = createMockBundle();
  const pipeline = new MultiSourceReportAssemblyPipeline(bundle);

  // 1. Assembles WordCraft adapter
  const adapter = pipeline.assembleWordCraftDocument();
  assert.equal(adapter.getDocumentId(), 'ENG-REP-2026-10-M01');
  assert.equal(adapter.getTables().length, 5); // BoQ, Schedule, Materials, Site Logs, Provenance Appendix

  // 2. Verified table contents
  const tables = adapter.getTables();
  assert.ok(tables[0].title.includes('Bill of Quantities'));
  assert.equal(tables[0].rows.length, 2);
  assert.ok(tables[1].title.includes('Critical Path Milestone Schedule'));
  assert.equal(tables[1].rows.length, 2);
  assert.ok(tables[2].title.includes('Material Deliveries'));
  assert.equal(tables[2].rows.length, 2);
  assert.ok(tables[3].title.includes('Daily Site Operations'));
  assert.equal(tables[3].rows.length, 2);
  assert.ok(tables[4].title.includes('Cryptographic Record Provenance'));

  // 3. Financial figures attached with exact Paisa and ledger sequence
  const figures = adapter.getFinancialFigures();
  assert.equal(figures.length, 2);
  assert.equal(figures[0].amountPaisa, 6749400000n);
  assert.equal(figures[0].sourceLedgerSeq, 104);

  // 4. Export OpenXML (.docx) package
  const docx = pipeline.exportReportDocx();
  assert.equal(docx.documentId, 'ENG-REP-2026-10-M01');
  assert.equal(docx.filename, 'ENG-REP-2026-10-M01.docx');
  assert.ok(docx.parts['word/document.xml'].includes('Underground rock excavation in Class IV rock mass'));
  assert.ok(docx.parts['word/document.xml'].includes('Tunnel Breakthrough to Adit 2 Junction'));
  assert.ok(docx.parts['word/document.xml'].includes('Shivam Cements Ltd.'));
  assert.equal(docx.roundTripVerified, true);
});

test('MultiSourceReportAssemblyPipeline: cryptographic provenance chain across all subsystems', () => {
  const bundle = createMockBundle();
  const pipeline = new MultiSourceReportAssemblyPipeline(bundle);

  const chain = pipeline.getProvenanceChain();
  assert.equal(chain.reportId, 'ENG-REP-2026-10-M01');
  assert.ok(chain.masterDigest.length === 64); // SHA-256
  assert.equal(chain.watermarks.length, 8); // 2 logs + 2 boq + 2 materials + 2 milestones

  // Verify entity types present
  const types = chain.watermarks.map((w) => w.entityType);
  assert.ok(types.includes('SITE_LOG'));
  assert.ok(types.includes('BOQ_MEASUREMENT'));
  assert.ok(types.includes('MATERIAL_RECEIPT'));
  assert.ok(types.includes('SCHEDULE_MILESTONE'));

  // Verify non-empty SHA-256 digests for each entity
  for (const w of chain.watermarks) {
    assert.equal(w.digest.length, 64);
    assert.ok(w.revision > 0);
  }
});

test('MultiSourceReportAssemblyPipeline: staleness detection and change alert prompt', () => {
  const bundle = createMockBundle();
  const pipeline = new MultiSourceReportAssemblyPipeline(bundle);

  // 1. Initial audit: up to date
  const cleanAudit = pipeline.auditStaleness({
    siteLogs: [
      { logId: 'LOG-2026-10-10', revision: 2 },
      { logId: 'LOG-2026-10-11', revision: 1 },
    ],
    boqMeasurements: [
      { sheetId: 'MSR-BOQ-042', boqRevision: 4 },
      { sheetId: 'MSR-BOQ-043', boqRevision: 4 },
    ],
    materialDeliveries: [
      { receiptId: 'RCV-MAT-892', revision: 1 },
      { receiptId: 'RCV-MAT-895', revision: 1 },
    ],
    scheduleMilestones: [
      { milestoneId: 'MS-CP-04', scheduleRevision: 3 },
      { milestoneId: 'MS-CP-05', scheduleRevision: 3 },
    ],
  });
  assert.equal(cleanAudit.isStale, false);
  assert.equal(cleanAudit.changedEntities.length, 0);
  assert.ok(cleanAudit.prompt.includes('up to date'));

  // 2. Underlying project records updated: BoQ re-measured and schedule updated
  const staleAudit = pipeline.auditStaleness({
    siteLogs: [
      { logId: 'LOG-2026-10-10', revision: 2 },
      { logId: 'LOG-2026-10-11', revision: 1 },
    ],
    boqMeasurements: [
      { sheetId: 'MSR-BOQ-042', boqRevision: 5 }, // Advanced from Rev 4 -> Rev 5!
      { sheetId: 'MSR-BOQ-043', boqRevision: 4 },
    ],
    materialDeliveries: [
      { receiptId: 'RCV-MAT-892', revision: 1 },
      { receiptId: 'RCV-MAT-895', revision: 1 },
    ],
    scheduleMilestones: [
      { milestoneId: 'MS-CP-04', scheduleRevision: 4 }, // Advanced from Rev 3 -> Rev 4!
      { milestoneId: 'MS-CP-05', scheduleRevision: 3 },
    ],
  });

  assert.equal(staleAudit.isStale, true);
  assert.equal(staleAudit.changedEntities.length, 2);
  assert.ok(staleAudit.staleSubsystems.includes('BOQ'));
  assert.ok(staleAudit.staleSubsystems.includes('SCHEDULE'));
  assert.ok(staleAudit.prompt.includes('Stale Project Records Detected'));

  // 3. Refresh bundle and verify synchronization
  const updatedBundle = createMockBundle();
  updatedBundle.boqMeasurements[0].boqRevision = 5;
  updatedBundle.scheduleMilestones[0].scheduleRevision = 4;
  pipeline.refreshWithLiveBundle(updatedBundle);

  const reAudit = pipeline.auditStaleness({
    boqMeasurements: [
      { sheetId: 'MSR-BOQ-042', boqRevision: 5 },
      { sheetId: 'MSR-BOQ-043', boqRevision: 4 },
    ],
    scheduleMilestones: [
      { milestoneId: 'MS-CP-04', scheduleRevision: 4 },
      { milestoneId: 'MS-CP-05', scheduleRevision: 3 },
    ],
  });
  assert.equal(reAudit.isStale, false);
});

test('MultiSourceReportAssemblyPipeline: rejects client-calculated financial math or invalid ledger provenance', () => {
  const invalidBundle = createMockBundle();
  // Attempt invalid float amount
  (invalidBundle.boqMeasurements[0] as any).amountPaisa = 12345.67;

  assert.throws(
    () => {
      new MultiSourceReportAssemblyPipeline(invalidBundle);
    },
    (err: any) => err instanceof DocumentAuthorityViolationError
  );

  const missingSeqBundle = createMockBundle();
  missingSeqBundle.boqMeasurements[0].sourceLedgerSeq = 0;

  assert.throws(
    () => {
      new MultiSourceReportAssemblyPipeline(missingSeqBundle);
    },
    (err: any) => err instanceof DocumentAuthorityViolationError
  );
});
