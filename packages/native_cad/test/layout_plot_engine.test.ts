/**
 * CAD Layout, Paper Space, and Vector PDF Plot Tests (M07-T06).
 *
 * Verifies:
 *  - Model space vs Paper space layouts & architectural viewports
 *  - Lineweight mapping (hundredths-of-mm to PDF points) and scale arithmetic
 *  - Font supply evaluation (craft-fonts) & Devanagari script fallback
 *  - Pure vector PDF 1.4 output structure and viewport clipping
 *  - Explicit raster fallback reporting
 *  - Unified platform print adapters (Web, Desktop, Headless)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { CadDocument } from '../src/cad_document.js';
import {
  CadLayoutPlotEngine,
  HeadlessPrintAdapter,
  WebPrintAdapter,
  DesktopPrintAdapter,
  STANDARD_PAPER_SIZES,
} from '../src/layout_plot_engine.js';
import type { LayoutDefinition } from '../src/types.js';

test('layout state & viewports: manages paper space layouts and architectural viewports', () => {
  const doc = new CadDocument();
  assert.equal(doc.layoutState.activeSpace, 'model');
  assert.equal(doc.layoutState.activeLayoutName, 'Model');

  // Switch to Layout1
  doc.setActiveLayout('Layout1');
  assert.equal(doc.layoutState.activeSpace, 'paper');
  assert.equal(doc.layoutState.activeLayoutName, 'Layout1');

  // Define custom A1 engineering layout
  const a1Layout: LayoutDefinition = {
    name: 'A1-SitePlan',
    paperSize: 'ISO_A1',
    widthMm: 841,
    heightMm: 594,
    orientation: 'landscape',
    viewports: [
      {
        id: 'VP_SITE_1_100',
        boundsOnPaperMm: { minX: 30, minY: 30, maxX: 500, maxY: 560 },
        modelCenter: { x: 5000, y: 5000 },
        scale: 0.01, // 1:100
        targetSpace: 'model',
      },
      {
        id: 'VP_DETAIL_1_20',
        boundsOnPaperMm: { minX: 520, minY: 30, maxX: 810, maxY: 300 },
        modelCenter: { x: 200, y: 200 },
        scale: 0.05, // 1:20 detail
        targetSpace: 'model',
      },
    ],
  };

  doc.addLayout(a1Layout);
  assert.ok(doc.layoutState.layouts.includes('A1-SitePlan'));
  const retrieved = doc.getLayout('A1-SitePlan');
  assert.ok(retrieved);
  assert.equal(retrieved.viewports.length, 2);
  assert.equal(retrieved.viewports[0].scale, 0.01);
  assert.equal(retrieved.viewports[1].scale, 0.05);

  // Switch back to model space
  doc.setActiveLayout('Model');
  assert.equal(doc.layoutState.activeSpace, 'model');
});

test('lineweight & scale arithmetic: converts AutoCAD lineweights to PDF points and calculates paper bounds', () => {
  // Test lineweight conversions
  // 0 -> hairline minimum 0.2 pt
  assert.equal(CadLayoutPlotEngine.lineweightToPt(0), 0.2);
  // Default lineweight (undefined) -> 0.709 pt (0.25mm)
  assert.ok(Math.abs(CadLayoutPlotEngine.lineweightToPt(undefined) - 0.709) < 1e-3);
  // 25 (0.25mm) -> ~0.709 pt
  assert.ok(Math.abs(CadLayoutPlotEngine.lineweightToPt(25) - 0.709) < 1e-3);
  // 50 (0.50mm) -> ~1.417 pt
  assert.ok(Math.abs(CadLayoutPlotEngine.lineweightToPt(50) - 1.417) < 1e-3);
  // 100 (1.00mm) -> ~2.835 pt
  assert.ok(Math.abs(CadLayoutPlotEngine.lineweightToPt(100) - 2.835) < 1e-3);

  // Test paper dimensions
  const a3Land = CadLayoutPlotEngine.getPaperDimensions('ISO_A3', 'landscape');
  assert.equal(a3Land.widthMm, 420);
  assert.equal(a3Land.heightMm, 297);
  assert.ok(Math.abs(a3Land.widthPt - 420 * (72 / 25.4)) < 1e-2);

  const a3Port = CadLayoutPlotEngine.getPaperDimensions('ISO_A3', 'portrait');
  assert.equal(a3Port.widthMm, 297);
  assert.equal(a3Port.heightMm, 420);

  const a1Land = CadLayoutPlotEngine.getPaperDimensions('ISO_A1', 'landscape');
  assert.equal(a1Land.widthMm, 841);
  assert.equal(a1Land.heightMm, 594);
});

test('font supply & Devanagari script: detects Unicode Nepali/Hindi text and applies automatic font fallback', () => {
  // 1. Pure Latin / ASCII text
  assert.equal(CadLayoutPlotEngine.containsDevanagari('GROUND FLOOR PLAN'), false);
  assert.equal(CadLayoutPlotEngine.containsDevanagari('COLUMN C1 - 400x400'), false);

  // 2. Devanagari / Nepali text
  assert.equal(CadLayoutPlotEngine.containsDevanagari('काठमाडौं चक्रपथ सुधार आयोजना'), true);
  assert.equal(CadLayoutPlotEngine.containsDevanagari('नेपाल निर्माण कम्पनी'), true);
  assert.equal(CadLayoutPlotEngine.containsDevanagari('Site Plan (स्थल योजना)'), true);
  assert.equal(CadLayoutPlotEngine.containsDevanagari('कि.नं. १२३ (क्षेत्रफल: ५०० वर्ग मिटर)'), true);

  // 3. Test Plotting with Devanagari font fallback
  const doc = new CadDocument();
  doc._insertEntity({
    handle: 'T1',
    type: 'TEXT',
    layer: 'BILINGUAL_NOTES',
    position: { x: 100, y: 100 },
    height: 3.5,
    text: 'काठमाडौं चक्रपथ विस्तार - खण्ड २',
  });

  doc._insertEntity({
    handle: 'T2',
    type: 'TEXT',
    layer: 'NOTES',
    position: { x: 100, y: 80 },
    height: 3.5,
    text: 'KATHMANDU RING ROAD EXPANSION - SECTION 2',
  });

  const result = CadLayoutPlotEngine.plot(doc, { layoutName: 'Model' });
  assert.equal(result.devanagariFallbackApplied, true);
  assert.ok(result.fontsUsed.includes('NotoSansDevanagari'));
  assert.ok(result.fontsUsed.includes('Helvetica'));
});

test('vector PDF plot: emits valid PDF 1.4 syntax, viewport clipping, and accurate vector primitives', () => {
  const doc = new CadDocument();

  // Insert model entities
  doc._insertEntity({
    handle: 'L1',
    type: 'LINE',
    layer: 'WALLS',
    start: { x: 0, y: 0 },
    end: { x: 10000, y: 0 },
    color: 1, // Red
    lineweight: 50, // 0.50mm
  });

  doc._insertEntity({
    handle: 'C1',
    type: 'CIRCLE',
    layer: 'COLUMNS',
    center: { x: 5000, y: 2500 },
    radius: 500,
    color: 3, // Green
    lineweight: 25,
  });

  doc._insertEntity({
    handle: 'A1',
    type: 'ARC',
    layer: 'DOORS',
    center: { x: 2000, y: 0 },
    radius: 900,
    startAngle: 0,
    endAngle: Math.PI / 2,
    color: 5, // Blue
  });

  doc._insertEntity({
    handle: 'P1',
    type: 'LWPOLYLINE',
    layer: 'PERIMETER',
    closed: true,
    vertices: [
      { x: 0, y: 0 },
      { x: 10000, y: 0 },
      { x: 10000, y: 5000 },
      { x: 0, y: 5000 },
    ],
    lineweight: 70, // 0.70mm
  });

  doc._insertEntity({
    handle: 'D1',
    type: 'DIMENSION',
    layer: 'DIMS',
    defPoint1: { x: 0, y: 0 },
    defPoint2: { x: 10000, y: 0 },
    textPosition: { x: 5000, y: -500 },
    measurement: 10000,
    textOverride: '10.00 m',
  });

  // Execute plot
  const plotResult = CadLayoutPlotEngine.plot(doc, {
    layoutName: 'Model',
    paperSize: 'ISO_A3',
    orientation: 'landscape',
  });

  assert.ok(plotResult.pdfBytes.length > 0);
  assert.equal(plotResult.pageCount, 1);
  assert.ok(plotResult.vectorEntityCount >= 5);
  assert.equal(plotResult.rasterFallbackEntities.length, 0);

  // Inspect generated PDF bytes
  const pdfString = new TextDecoder().decode(plotResult.pdfBytes);

  // 1. Valid PDF header
  assert.ok(pdfString.startsWith('%PDF-1.4'));

  // 2. Valid PDF trailer and EOF
  assert.ok(pdfString.includes('trailer'));
  assert.ok(pdfString.includes('startxref'));
  assert.ok(pdfString.trimEnd().endsWith('%%EOF'));

  // 3. MediaBox matches A3 landscape (420 x 297 mm in points)
  const expectedWidthPt = (420 * (72 / 25.4)).toFixed(2);
  const expectedHeightPt = (297 * (72 / 25.4)).toFixed(2);
  assert.ok(pdfString.includes(`/MediaBox [0 0 ${expectedWidthPt} ${expectedHeightPt}]`));

  // 4. Viewport clipping operators (re W n)
  assert.ok(pdfString.includes('re W n'), 'Must contain viewport clipping boundary');

  // 5. Vector line operators (m = moveto, l = lineto, S = stroke, w = linewidth)
  assert.ok(pdfString.includes(' m '));
  assert.ok(pdfString.includes(' l '));
  assert.ok(pdfString.includes(' S\n'));
  assert.ok(pdfString.includes(' w '));

  // 6. Bézier curve operator (c) for circle/arc
  assert.ok(pdfString.includes(' c'));
});

test('platform print adapters: unified engine delivers to Web, Desktop, and Headless without reimplementation', async () => {
  const doc = new CadDocument();
  doc._insertEntity({
    handle: 'L1',
    type: 'LINE',
    layer: '0',
    start: { x: 0, y: 0 },
    end: { x: 500, y: 500 },
  });

  const headlessAdapter = new HeadlessPrintAdapter();
  const webAdapter = new WebPrintAdapter();
  const desktopAdapter = new DesktopPrintAdapter();

  // 1. Headless Delivery
  const headlessRes = await CadLayoutPlotEngine.plotAndDeliver(
    doc,
    { paperSize: 'ISO_A4' },
    headlessAdapter,
    'drawing_headless.pdf'
  );
  assert.equal(headlessRes.outputResult.success, true);
  assert.equal(headlessRes.outputResult.platform, 'headless');
  assert.ok(headlessRes.outputResult.bytesEmitted > 0);

  // 2. Web Delivery
  const webRes = await CadLayoutPlotEngine.plotAndDeliver(
    doc,
    { paperSize: 'ISO_A3' },
    webAdapter,
    'drawing_web.pdf'
  );
  assert.equal(webRes.outputResult.success, true);
  assert.equal(webRes.outputResult.platform, 'web');
  assert.ok(webRes.outputResult.destination.startsWith('blob://'));

  // 3. Desktop Delivery
  const desktopRes = await CadLayoutPlotEngine.plotAndDeliver(
    doc,
    { paperSize: 'ISO_A1' },
    desktopAdapter,
    'drawing_desktop.pdf'
  );
  assert.equal(desktopRes.outputResult.success, true);
  assert.equal(desktopRes.outputResult.platform, 'desktop');
  assert.ok(desktopRes.outputResult.destination.startsWith('file://'));
});
