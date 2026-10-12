import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PdfExportBridge,
  PAPER_SIZE_SPECS,
} from '../src/pdf_export_bridge.js';
import { WordCraftHostAdapter } from '../src/wordcraft_adapter.js';
import { DeckCraftHostAdapter } from '../src/deckcraft_adapter.js';

function createSampleWordCraftDocx() {
  const adapter = WordCraftHostAdapter.createCorrespondence(
    'FIDIC_NOTICE_OF_CLAIM',
    {
      referenceNumber: 'CTR-TUN-CLAIM-001',
      date: '2026-10-12',
      clientName: 'Melamchi Water Supply Development Board',
      engineerName: 'Dolsar-JV Consulting Engineers',
      contractorName: 'Himalayan Infrastructure & Construction JV',
      projectName: 'Kathmandu Bulk Water Tunnel',
      contractNumber: 'MWSDB/TUNNEL/01-ICB',
      eventDate: '2026-10-10',
      chainageOrLocation: 'CH 12+450 - 12+510',
      conditionDescription: 'Severe fault shear zone with heavy water ingress',
      clausesReferenced: 'FIDIC Red Book Sub-Clause 4.12 & 20.1',
      authorizedSignatory: 'Er. Ramesh Karki',
      estimatedCostImpact: 'NPR 13,550,000.00',
      estimatedDelayDays: '21',
    },
    'Er. Sanjeev Shrestha'
  );
  return adapter.exportOpenXmlPackage();
}

function createSampleDeckCraftPptx() {
  const adapter = DeckCraftHostAdapter.createMonthlyProgressDeck(
    {
      deckId: 'DECK-MONTHLY-OCT2026',
      projectTitle: 'Kathmandu Bulk Water Tunnel Project',
      clientName: 'Melamchi Water Supply Development Board',
      contractorName: 'Himalayan Infrastructure',
      engineerName: 'Dolsar-JV',
      reportingPeriod: 'October 2026',
      keyMetrics: {
        plannedProgressPercent: 68.5,
        actualProgressPercent: 65.2,
        variancePercent: -3.3,
        certifiedIpcAmountPaisa: 48250000000n,
        sourceLedgerSeq: 104,
        sourceAccountCode: '1100-RECEIVABLES-CLIENT',
        safeManHoursWorked: 1420000,
        zeroLostTimeIncidents: true,
      },
      milestones: [
        {
          name: 'TBM Breakout',
          targetDate: '2026-08-15',
          status: 'COMPLETED',
          varianceDays: 0,
          scheduleRevision: 3,
        },
      ],
      evmData: {
        months: ['Aug', 'Sep', 'Oct'],
        plannedValueMln: [420, 540, 680],
        earnedValueMln: [405, 515, 645],
        actualCostMln: [415, 528, 660],
        cpi: 0.98,
        spi: 0.95,
      },
      sitePhotos: [
        {
          title: 'TBM Cutterhead',
          caption: 'Cutterhead inspection CH 12+465',
          chainage: 'CH 12+465',
        },
      ],
    },
    'Er. Sanjeev Shrestha'
  );
  return adapter.exportOpenXmlPptxPackage();
}

test('PdfExportBridge: converts WordCraft DOCX to high-fidelity PDF with ISO 216 paper sizes', () => {
  const docxPkg = createSampleWordCraftDocx();
  const bridge = new PdfExportBridge({
    organizationName: 'Himalayan Infrastructure & Construction JV',
    projectTitle: 'Kathmandu Valley Bulk Water Tunnel',
  });

  // 1. Export A4 Portrait
  const pdfA4 = bridge.exportDocxToPdf(docxPkg, { paperSize: 'A4_PORTRAIT' });
  assert.equal(pdfA4.documentId, 'CTR-TUN-CLAIM-001');
  assert.equal(pdfA4.filename, 'CTR-TUN-CLAIM-001.pdf');
  assert.equal(pdfA4.mimeType, 'application/pdf');
  assert.equal(pdfA4.paperSize, 'A4_PORTRAIT');
  assert.equal(pdfA4.sourceEngine, 'WordCraft');
  assert.equal(pdfA4.sourceFormat, 'DOCX');
  assert.ok(pdfA4.pdfBinaryBuffer.length > 500);
  assert.ok(pdfA4.pdfBinaryBuffer.toString('utf8').includes('%PDF-1.7'));
  assert.ok(pdfA4.pdfBinaryBuffer.toString('utf8').includes('Himalayan Infrastructure'));
  assert.ok(pdfA4.pdfBinaryBuffer.toString('utf8').includes('Page 1 of'));
  assert.equal(pdfA4.vectorFidelity100Pct, true);

  // 2. Deterministic bit-identical reproduction
  const pdfA4Repeat = bridge.exportDocxToPdf(docxPkg, { paperSize: 'A4_PORTRAIT' });
  assert.equal(pdfA4.pdfSha256Checksum, pdfA4Repeat.pdfSha256Checksum);

  // 3. Export A3 Landscape for large engineering drawing/specification layout
  const pdfA3 = bridge.exportDocxToPdf(docxPkg, { paperSize: 'A3_LANDSCAPE' });
  assert.equal(pdfA3.paperSize, 'A3_LANDSCAPE');
  assert.ok(pdfA3.pdfBinaryBuffer.toString('utf8').includes(`0 0 ${PAPER_SIZE_SPECS.A3_LANDSCAPE.widthPt} ${PAPER_SIZE_SPECS.A3_LANDSCAPE.heightPt}`));
});

test('PdfExportBridge: converts DeckCraft PPTX to high-fidelity PDF with 16:9 widescreen geometry', () => {
  const pptxPkg = createSampleDeckCraftPptx();
  const bridge = new PdfExportBridge();

  const pdfDeck = bridge.exportPptxToPdf(pptxPkg);
  assert.equal(pdfDeck.documentId, 'DECK-MONTHLY-OCT2026');
  assert.equal(pdfDeck.filename, 'DECK-MONTHLY-OCT2026.pdf');
  assert.equal(pdfDeck.paperSize, 'WIDESCREEN_16_9');
  assert.equal(pdfDeck.sourceEngine, 'DeckCraft');
  assert.equal(pdfDeck.sourceFormat, 'PPTX');
  assert.equal(pdfDeck.totalPages, 5);
  assert.ok(pdfDeck.pdfBinaryBuffer.toString('utf8').includes('/MediaBox [0 0 960 540]'));
  assert.equal(pdfDeck.vectorFidelity100Pct, true);

  // Determinism verification
  const pdfDeckRepeat = bridge.exportPptxToPdf(pptxPkg);
  assert.equal(pdfDeck.pdfSha256Checksum, pdfDeckRepeat.pdfSha256Checksum);
});

test('PdfExportBridge: prepares native print stream matching CUPS / PostScript Level 3 vector specs', () => {
  const docxPkg = createSampleWordCraftDocx();
  const bridge = new PdfExportBridge();
  const pdf = bridge.exportDocxToPdf(docxPkg, { paperSize: 'A4_PORTRAIT' });

  const printPayload = bridge.preparePrintStream(pdf, {
    jobId: 'PRN-JOB-2026-904',
    paperSize: 'A4_PORTRAIT',
    colorMode: 'COLOR',
    duplexMode: 'DUPLEX_LONG_EDGE',
    dpi: 600,
    includeLetterhead: true,
    copies: 2,
  });

  assert.equal(printPayload.jobId, 'PRN-JOB-2026-904');
  assert.equal(printPayload.targetPaper, 'A4_PORTRAIT');
  assert.equal(printPayload.rasterDpi, 600);
  assert.equal(printPayload.colorMode, 'COLOR');
  assert.equal(printPayload.duplex, 'DUPLEX_LONG_EDGE');
  assert.ok(printPayload.payloadBuffer.toString('utf8').includes('%!PS-Adobe-3.0'));
  assert.ok(printPayload.payloadBuffer.toString('utf8').includes('%%DPI: 600'));
  assert.ok(printPayload.payloadBuffer.toString('utf8').includes('%%Duplex: DUPLEX_LONG_EDGE'));
  assert.ok(printPayload.streamSha256.length === 64);
});
