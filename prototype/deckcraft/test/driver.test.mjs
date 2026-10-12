import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DECKCRAFT_MCP_TOOLS,
  DeckCraftMcpClient,
  DECKCRAFT_VERSION,
  DECKCRAFT_COMMIT,
} from "../lib/mcp_protocol.mjs";
import {
  DeckCraftDriver,
  SAMPLE_CONSTRUCTION_PROGRESS_DECK,
} from "../lib/deckcraft_driver.mjs";

test("DeckCraft MCP Protocol: exposes 10 required headless tools with valid schemas", () => {
  assert.equal(DECKCRAFT_VERSION, "0.3.0");
  assert.equal(DECKCRAFT_COMMIT, "c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2");
  assert.equal(DECKCRAFT_MCP_TOOLS.length, 10);

  const requiredToolNames = [
    "open_presentation",
    "inspect_deck_metadata",
    "add_slide",
    "insert_shape",
    "insert_slide_table",
    "embed_chart",
    "embed_site_photo",
    "update_speaker_notes",
    "export_pptx",
    "validate_pptx_fidelity",
  ];

  for (const name of requiredToolNames) {
    const tool = DECKCRAFT_MCP_TOOLS.find((t) => t.name === name);
    assert.ok(tool, `Tool ${name} must be present in inventory`);
    assert.ok(tool.description.length > 10, `Tool ${name} must have meaningful description`);
    assert.ok(tool.inputSchema, `Tool ${name} must have inputSchema`);
    assert.ok(tool.outputSchema, `Tool ${name} must have outputSchema`);
  }
});

test("DeckCraftMcpClient: loads presentation and inspects 16:9 widescreen metadata", async () => {
  const client = new DeckCraftMcpClient();

  const openRes = await client.callTool("open_presentation", { path: "fixtures/template.pptx" });
  assert.ok(openRes.presentationId);
  assert.equal(openRes.slideCount, 1);
  assert.equal(openRes.masterSlideCount, 3);
  assert.equal(openRes.openXmlVersion, "ISO/IEC 29500-1:2016");

  const metaRes = await client.callTool("inspect_deck_metadata", { presentationId: openRes.presentationId });
  assert.equal(metaRes.aspectRatio, "16:9 widescreen");
  assert.equal(metaRes.slideWidthInches, 13.333);
  assert.equal(metaRes.slideHeightInches, 7.5);
});

test("DeckCraftMcpClient: builds multi-slide construction review deck with tables, charts and photos", async () => {
  const client = new DeckCraftMcpClient();
  const openRes = await client.callTool("open_presentation", { path: "fixtures/deck.pptx" });
  const deckId = openRes.presentationId;

  // Add metrics slide and badge shape
  const s2 = await client.callTool("add_slide", {
    presentationId: deckId,
    layoutType: "metrics_summary",
    title: "Project KPIs",
  });
  assert.ok(s2.slideId);

  const shpRes = await client.callTool("insert_shape", {
    presentationId: deckId,
    slideId: s2.slideId,
    shapeType: "badge",
    label: "Safe Hours: 1.42M",
  });
  assert.equal(shpRes.success, true);

  // Add table slide
  const s3 = await client.callTool("add_slide", {
    presentationId: deckId,
    layoutType: "table_content",
    title: "Milestone Deliverables",
  });
  const tblRes = await client.callTool("insert_slide_table", {
    presentationId: deckId,
    slideId: s3.slideId,
    headers: ["Milestone", "Date", "Status"],
    rows: [
      ["Tunnel Breakout", "2026-08-15", "COMPLETED"],
      ["Grouting Adit", "2026-12-15", "ON_TRACK"],
    ],
  });
  assert.equal(tblRes.rowCount, 3);

  // Add chart slide
  const s4 = await client.callTool("add_slide", {
    presentationId: deckId,
    layoutType: "chart_evm",
    title: "EVM Curve",
  });
  const chartRes = await client.callTool("embed_chart", {
    presentationId: deckId,
    slideId: s4.slideId,
    chartType: "line_s_curve",
    chartTitle: "PV vs EV",
    series: [
      { name: "PV", dataPoints: [100, 200, 300] },
      { name: "EV", dataPoints: [95, 190, 285] },
    ],
  });
  assert.equal(chartRes.dataPointsCount, 6);

  // Add photo slide
  const s5 = await client.callTool("add_slide", {
    presentationId: deckId,
    layoutType: "photo_grid",
    title: "Site Photos",
  });
  const photoRes = await client.callTool("embed_site_photo", {
    presentationId: deckId,
    slideId: s5.slideId,
    photoPath: "assets/tbm_head.jpg",
    caption: "TBM Cutterhead inspection",
  });
  assert.equal(photoRes.embedded, true);

  // Export and validate
  const expRes = await client.callTool("export_pptx", { presentationId: deckId });
  assert.ok(expRes.outputPath);
  assert.equal(expRes.byteLength, 49152);

  const valRes = await client.callTool("validate_pptx_fidelity", { presentationId: deckId });
  assert.equal(valRes.conformant, true);
  assert.equal(valRes.slideTreeValid, true);
});

test("DeckCraftDriver: validates outline, slide layouts and round-trip preservation", () => {
  const driver = new DeckCraftDriver();

  const outline = driver.generatePresentationOutline();
  assert.equal(outline.length, 5);
  assert.equal(outline[0].type, "title_slide");
  assert.equal(outline[3].type, "chart_evm");

  const layoutValidation = driver.validateSlideLayouts({
    slides: outline.map((o) => ({ id: `s-${o.slideIndex}`, layout: o.type })),
  });
  assert.equal(layoutValidation.valid, true);
  assert.equal(layoutValidation.slideCount, 5);

  const roundTrip = driver.evaluateRoundTrip(SAMPLE_CONSTRUCTION_PROGRESS_DECK);
  assert.equal(roundTrip.roundTripPass, true);
  assert.equal(roundTrip.slideCountPreserved, 5);
  assert.equal(roundTrip.chartSeriesPreserved, 3);
  assert.equal(roundTrip.milestoneRowsPreserved, 4);
  assert.equal(roundTrip.photosPreserved, 2);
});
