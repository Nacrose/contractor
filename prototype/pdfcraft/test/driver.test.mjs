import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFCRAFT_MCP_TOOLS, PdfCraftMcpClient, PDFCRAFT_VERSION, PDFCRAFT_COMMIT } from "../lib/mcp_protocol.mjs";
import {
  calculateEuclideanDistance,
  calculatePolylineLength,
  calculateNetPolygonArea,
  transformCoordinates,
  PdfFixtureEvaluator,
  DIVERGENCE_MATRIX,
  A3_LANDSCAPE
} from "../lib/ts_authority_pdf.mjs";
import { PhotoMarkupPipeline } from "../lib/photo_markup_pipeline.mjs";

test("PdfCraft MCP Protocol: exposes 10 required headless tools with valid schemas", () => {
  assert.equal(PDFCRAFT_VERSION, "0.4.0");
  assert.equal(PDFCRAFT_COMMIT, "e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3");
  assert.equal(PDFCRAFT_MCP_TOOLS.length, 10);

  const requiredToolNames = [
    "open_document",
    "render_page",
    "calibrate_page",
    "measure_distance",
    "measure_perimeter",
    "measure_area",
    "create_annotation",
    "export_document",
    "extract_form_fields",
    "embed_photo_markup"
  ];

  for (const name of requiredToolNames) {
    const tool = PDFCRAFT_MCP_TOOLS.find((t) => t.name === name);
    assert.ok(tool, `Tool ${name} must be present in inventory`);
    assert.ok(tool.description.length > 10, `Tool ${name} must have meaningful description`);
    assert.ok(tool.inputSchema, `Tool ${name} must have inputSchema`);
    assert.ok(tool.outputSchema, `Tool ${name} must have outputSchema`);
  }
});

test("PdfCraftMcpClient: dispatches headless tools with structured responses", async () => {
  const client = new PdfCraftMcpClient();

  const openRes = await client.callTool("open_document", { path: "fixtures/sample.pdf" });
  assert.ok(openRes.documentId);
  assert.equal(openRes.pageCount, 3);
  assert.equal(openRes.pdfVersion, "1.7");

  const calRes = await client.callTool("calibrate_page", {
    documentId: openRes.documentId,
    pageIndex: 0,
    pointA: { x: 0, y: 0 },
    pointB: { x: 100, y: 0 },
    realDistance: 5.0,
    unit: "m"
  });
  assert.ok(calRes.calibrationId);
  assert.equal(calRes.unit, "m");
  assert.equal(calRes.scaleFactor, 0.05);

  const distRes = await client.callTool("measure_distance", {
    documentId: openRes.documentId,
    pageIndex: 0,
    calibrationId: calRes.calibrationId,
    pointA: { x: 10, y: 20 },
    pointB: { x: 50, y: 20 }
  });
  assert.equal(distRes.rawDistancePt, 40);
  assert.equal(distRes.calibratedDistance, 2.0);
  assert.equal(distRes.unit, "m");

  const perimRes = await client.callTool("measure_perimeter", {
    documentId: openRes.documentId,
    pageIndex: 0,
    calibrationId: calRes.calibrationId,
    points: [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 40 }
    ]
  });
  assert.equal(perimRes.rawPerimeterPt, 70);
  assert.equal(perimRes.calibratedPerimeter, 3.5);

  const annotRes = await client.callTool("create_annotation", {
    documentId: openRes.documentId,
    pageIndex: 0,
    annotType: "/Square",
    rect: [10, 10, 50, 50],
    contents: "Inspection zone"
  });
  assert.ok(annotRes.annotId);
  assert.equal(annotRes.subtype, "/Square");

  const exportRes = await client.callTool("export_document", {
    documentId: openRes.documentId,
    outputPath: "export.pdf"
  });
  assert.ok(exportRes.outputBytes > 0);
  assert.equal(exportRes.status, "SUCCESS");
});

test("ISO 32000-2 Measurement Parity: distance, perimeter, gross area, deductions, net area match exactly", () => {
  // Calibration: 100 pt = 10.0 m -> 1 pt = 0.1 m
  const scale = 0.1;

  // 1. Distance
  const p1 = { x: 10, y: 10 };
  const p2 = { x: 70, y: 90 };
  const dPt = calculateEuclideanDistance(p1, p2); // sqrt(60^2 + 80^2) = 100
  assert.equal(dPt, 100);
  assert.equal(dPt * scale, 10.0);

  // 2. Polyline Length
  const polyline = [
    { x: 0, y: 0 },
    { x: 30, y: 0 },
    { x: 30, y: 40 },
    { x: 0, y: 40 }
  ];
  const pLenPt = calculatePolylineLength(polyline); // 30 + 40 + 30 = 100
  assert.equal(pLenPt, 100);
  assert.equal(pLenPt * scale, 10.0);

  // 3. Polygon with deduction hole
  const outerRoom = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 50 },
    { x: 0, y: 50 }
  ]; // 5,000 pt²
  const deductionHole = [
    { x: 20, y: 10 },
    { x: 40, y: 10 },
    { x: 40, y: 30 },
    { x: 20, y: 30 }
  ]; // 400 pt²

  const areaRes = calculateNetPolygonArea(outerRoom, [deductionHole]);
  assert.equal(areaRes.grossArea, 5000);
  assert.equal(areaRes.deductionsArea, 400);
  assert.equal(areaRes.netArea, 4600);
  assert.equal(areaRes.isValid, true);

  // Real world net area in m²: 4600 * (0.1)^2 = 46.0 m²
  const realNetArea = parseFloat((areaRes.netArea * Math.pow(scale, 2)).toFixed(4));
  assert.equal(realNetArea, 46.0);
});

test("Coordinate Space Transformation: PDF points (72 DPI) to screen CSS pixels (96 DPI)", () => {
  const pageHeightPt = 841.89; // A4 / A3 height
  const pdfPoint = { x: 72, y: 72 }; // 1 inch from bottom-left

  // Screen scale 1.0 at 96 DPI
  const screenPos = transformCoordinates(pdfPoint, pageHeightPt, 1.0, 96.0);

  // Screen X: 72 * (96/72) = 96 px
  assert.equal(screenPos.screenX, 96.0);
  // Screen Y: (841.89 - 72) * (96/72)
  const expectedScreenY = (841.89 - 72) * (96.0 / 72.0);
  assert.ok(Math.abs(screenPos.screenY - expectedScreenY) < 0.001);

  // Divergence matrix contains valid descriptions
  assert.equal(DIVERGENCE_MATRIX.length, 3);
  assert.ok(DIVERGENCE_MATRIX[0].rootCause.includes("PDF.js"));
});

test("M00 Fixture Evaluation: dense blueprint metrics and degenerate layout handling", () => {
  const evaluator = new PdfFixtureEvaluator();

  const dense = evaluator.evaluateDenseBlueprint();
  assert.equal(dense.fixture, "dense_blueprint_drawing.json");
  assert.equal(dense.pageSize, "a3");
  assert.equal(dense.orientation, "landscape");
  assert.ok(dense.elementCount > 10);
  assert.equal(dense.expectedMeasurements.borderRealWidthM, 40.0);
  assert.equal(dense.expectedMeasurements.borderRealHeightM, 27.7);
  assert.equal(dense.expectedMeasurements.borderPerimeterM, 135.4);
  assert.equal(dense.expectedMeasurements.borderGrossAreaM2, 1108.0);

  const degen = evaluator.evaluateDegenerateLayout();
  assert.equal(degen.fixture, "degenerate_canvas_layout.json");
  assert.ok(degen.faultCount >= 3);
  assert.equal(degen.handledFailClosed, true);
});

test("Photo-to-PDF Markup Pipeline: embeds photo and keeps vector annotations editable", () => {
  const pipeline = new PhotoMarkupPipeline();

  const session = pipeline.createSession({
    path: "site_defect.jpg",
    widthPx: 1920,
    heightPx: 1080,
    byteSize: 1200000,
    siteId: "SITE-KMD-02",
    defectTag: "CONCRETE_HONEYCOMBING_BEAM_B12"
  });

  assert.ok(session.sessionId);
  assert.equal(session.photo.widthPx, 1920);

  const annot1 = pipeline.addAnnotation(session.sessionId, {
    type: "CALLOUT_RECT",
    rect: [50, 100, 200, 250],
    label: "Honeycombing defect"
  });
  assert.ok(annot1.annotId);

  const annot2 = pipeline.addAnnotation(session.sessionId, {
    type: "DIMENSION_LINE",
    rect: [50, 80, 200, 80],
    label: "Span: 1.5 m"
  });
  assert.ok(annot2.annotId);

  const exportResult = pipeline.exportToPdf(session.sessionId);
  assert.equal(exportResult.sessionId, session.sessionId);
  assert.ok(exportResult.outputPdfBytes > 1000000);
  assert.ok(exportResult.sha256.length === 64);
  assert.equal(exportResult.imageFidelity.originalResolution, "1920x1080");
  assert.equal(exportResult.imageFidelity.resampled, false);
  assert.equal(exportResult.vectorFidelity.burnedIntoPixels, false);
  assert.equal(exportResult.vectorFidelity.annotationCount, 2);
  assert.equal(exportResult.vectorFidelity.reExportable, true);
});
