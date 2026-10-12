import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DeckCraftHostAdapter,
  ConstructionProgressDeckInput,
} from '../src/deckcraft_adapter.js';
import {
  DocumentAuthorityViolationError,
  FrozenDocumentModificationError,
} from '../src/authority_contract.js';

function createMockDeckInput(): ConstructionProgressDeckInput {
  return {
    deckId: 'DECK-2026-10-PROGRESS',
    projectTitle: 'Kathmandu Valley Underground Bulk Water Tunnel Project',
    clientName: 'Melamchi Water Supply Development Board',
    contractorName: 'Himalayan Infrastructure & Construction JV',
    engineerName: 'Dolsar-JV Consulting Engineers',
    reportingPeriod: 'October 2026',
    keyMetrics: {
      plannedProgressPercent: 68.5,
      actualProgressPercent: 65.2,
      variancePercent: -3.3,
      certifiedIpcAmountPaisa: 48250000000n, // NPR 482,500,000.00
      sourceLedgerSeq: 104,
      sourceAccountCode: '1100-RECEIVABLES-CLIENT',
      safeManHoursWorked: 1420000,
      zeroLostTimeIncidents: true,
    },
    milestones: [
      {
        name: 'TBM Intake Portal Breakout',
        targetDate: '2026-08-15',
        status: 'COMPLETED',
        varianceDays: 0,
        scheduleRevision: 3,
      },
      {
        name: 'Fault Zone Heavy Rib Support CH 12+480',
        targetDate: '2026-10-30',
        status: 'IN_PROGRESS',
        varianceDays: -7,
        scheduleRevision: 3,
      },
      {
        name: 'Main Adit Pressure Grouting',
        targetDate: '2026-12-15',
        status: 'ON_TRACK',
        varianceDays: 0,
        scheduleRevision: 3,
      },
    ],
    evmData: {
      months: ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'],
      plannedValueMln: [120, 210, 310, 420, 540, 680],
      earnedValueMln: [115, 200, 295, 405, 515, 645],
      actualCostMln: [118, 208, 305, 415, 528, 660],
      cpi: 0.98,
      spi: 0.95,
    },
    sitePhotos: [
      {
        title: 'Tunnel Boring Machine Cutterhead',
        caption: 'Cutterhead inspection at CH 12+465',
        chainage: 'CH 12+465',
      },
      {
        title: 'Spillway Reinforced Concrete Pour',
        caption: 'Baffle block placement at Intake Station 0+120',
        chainage: 'Intake Station 0+120',
      },
    ],
  };
}

test('DeckCraftHostAdapter: automated monthly progress deck generation from TruePPM & BoQ', () => {
  const input = createMockDeckInput();
  const adapter = DeckCraftHostAdapter.createMonthlyProgressDeck(input, 'Er. Sanjeev Shrestha');

  assert.equal(adapter.getDeckId(), 'DECK-2026-10-PROGRESS');
  assert.equal(adapter.getStatus(), 'DRAFT');

  // Verify 5 standard slides generated
  const slides = adapter.getSlides();
  assert.equal(slides.length, 5);
  assert.equal(slides[0].layout, 'title_slide');
  assert.equal(slides[1].layout, 'metrics_summary');
  assert.equal(slides[2].layout, 'table_content');
  assert.equal(slides[3].layout, 'chart_evm');
  assert.equal(slides[4].layout, 'photo_grid');

  // Verify authoritative financial figure attached
  const figures = adapter.getFinancialFigures();
  assert.equal(figures.length, 1);
  assert.equal(figures[0].amountPaisa, 48250000000n);
  assert.equal(figures[0].sourceLedgerSeq, 104);

  // Verify EVM S-Curve chart data
  const chartSlide = slides[3];
  assert.ok(chartSlide.chart);
  assert.equal(chartSlide.chart.series.length, 3);
  assert.equal(chartSlide.chart.cpi, 0.98);
  assert.equal(chartSlide.chart.spi, 0.95);

  // Verify speaker notes attached to slides
  assert.ok(slides[0].speakerNotes?.notesText.includes('Welcome client stakeholders'));
  assert.ok(slides[3].speakerNotes?.notesText.includes('CPI of 0.98'));
});

test('DeckCraftHostAdapter: dual UI modes and state preservation across mode switches (ADR-0016)', () => {
  const input = createMockDeckInput();
  const adapter = DeckCraftHostAdapter.createMonthlyProgressDeck(input, 'Er. Sanjeev Shrestha');

  // 1. Initial mode is embedded_view
  assert.equal(adapter.getMode(), 'embedded_view');
  const embeddedConfig = adapter.getConfiguration();
  assert.equal(embeddedConfig.showQuickGenerationForm, true);
  assert.equal(embeddedConfig.showSlideSorter, false);
  assert.equal(embeddedConfig.enableDirectShapeManipulation, false);

  // Set selection state in embedded view
  adapter.setSelectionState({
    activeSlideIndex: 3,
    speakerNotesFocused: true,
  });

  // Add customized annotation on Slide 3
  const anno = adapter.addAnnotation(3, {
    author: 'Er. Senior Geotechnical Lead',
    text: 'Adit 2 breakthrough remains on schedule despite rock class IV conditions.',
    color: '#F59E0B',
  });
  assert.ok(anno.id.startsWith('ANNO-3-'));

  // Update speaker notes on Slide 3
  adapter.updateSpeakerNotes(3, 'Present contingency plan for overbreak support.');

  // 2. Switch to full_editor mode
  const transition = adapter.setMode('full_editor');
  assert.equal(transition.previousMode, 'embedded_view');
  assert.equal(transition.newMode, 'full_editor');
  assert.equal(transition.statePreserved, true);

  const fullConfig = adapter.getConfiguration();
  assert.equal(fullConfig.showSlideMasterCanvas, true);
  assert.equal(fullConfig.showSlideSorter, true);
  assert.equal(fullConfig.showShapeToolbars, true);
  assert.equal(fullConfig.showSpeakerNotesPanel, true);
  assert.equal(fullConfig.enableDirectShapeManipulation, true);

  // 3. Verify annotations, speaker notes, and active selection preserved
  const selState = adapter.getSelectionState();
  assert.equal(selState.activeSlideIndex, 3);
  assert.equal(selState.speakerNotesFocused, true);

  const slide3 = adapter.getSlide(3);
  assert.ok(slide3);
  assert.equal(slide3.annotations.length, 1);
  assert.equal(slide3.annotations[0].text, 'Adit 2 breakthrough remains on schedule despite rock class IV conditions.');
  assert.equal(slide3.speakerNotes?.notesText, 'Present contingency plan for overbreak support.');

  // 4. Switch back to embedded_view mode
  adapter.setMode('embedded_view');
  assert.equal(adapter.getMode(), 'embedded_view');
  assert.equal(adapter.getSelectionState().activeSlideIndex, 3);
});

test('DeckCraftHostAdapter: OpenXML PresentationML (.pptx) export and freeze lock upon issuance', () => {
  const input = createMockDeckInput();
  const adapter = DeckCraftHostAdapter.createMonthlyProgressDeck(input, 'Er. Sanjeev Shrestha');

  // Validate presentation structure
  const val = adapter.validatePresentationMl();
  assert.equal(val.valid, true);
  assert.equal(val.slideCount, 5);

  // Export OpenXML PPTX package
  const pptx = adapter.exportOpenXmlPptxPackage();
  assert.equal(pptx.deckId, 'DECK-2026-10-PROGRESS');
  assert.equal(pptx.filename, 'DECK-2026-10-PROGRESS.pptx');
  assert.equal(pptx.mimeType, 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
  assert.equal(pptx.slideCount, 5);
  assert.ok(pptx.parts['ppt/presentation.xml'].includes('screen16x9'));
  assert.ok(pptx.parts['ppt/charts/chart1.xml'].includes('EVM S-Curve Performance'));
  assert.ok(pptx.parts['docProps/core.xml'].includes('Kathmandu Valley Underground Bulk Water Tunnel Project'));
  assert.equal(pptx.roundTripVerified, true);
  assert.ok(pptx.metadataChecksum.length === 64); // SHA-256

  // Issue document
  const provenance = adapter.freezeAndIssue('Er. Ramesh Karki (Authorized Project Director)');
  assert.equal(adapter.getStatus(), 'ISSUED');
  assert.equal(provenance.status, 'ISSUED');
  assert.equal(provenance.authorizedSignatory, 'Er. Ramesh Karki (Authorized Project Director)');
  assert.ok(provenance.snapshotHash.length === 64);

  // Assert fail-closed against subsequent modification
  assert.throws(
    () => {
      adapter.addAnnotation(1, {
        author: 'Late Author',
        text: 'Cannot annotate issued deck',
        color: '#FF0000',
      });
    },
    (err: any) => err instanceof FrozenDocumentModificationError
  );

  assert.throws(
    () => {
      adapter.updateSpeakerNotes(1, 'New notes');
    },
    (err: any) => err instanceof FrozenDocumentModificationError
  );
});

test('DeckCraftHostAdapter: boundary guard rejects client-side float math or missing double-entry provenance', () => {
  const invalidInput = createMockDeckInput();
  (invalidInput.keyMetrics as any).certifiedIpcAmountPaisa = 482500000.5;

  assert.throws(
    () => {
      DeckCraftHostAdapter.createMonthlyProgressDeck(invalidInput, 'Er. Sanjeev Shrestha');
    },
    (err: any) => err instanceof DocumentAuthorityViolationError
  );

  const missingSeqInput = createMockDeckInput();
  missingSeqInput.keyMetrics.sourceLedgerSeq = 0;

  assert.throws(
    () => {
      DeckCraftHostAdapter.createMonthlyProgressDeck(missingSeqInput, 'Er. Sanjeev Shrestha');
    },
    (err: any) => err instanceof DocumentAuthorityViolationError
  );
});
