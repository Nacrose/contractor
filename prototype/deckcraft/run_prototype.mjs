#!/usr/bin/env node
/**
 * DeckCraft Prototype Runner (M12-T02).
 * Executes headless MCP tools over construction monthly progress presentation fixtures.
 */

import { DeckCraftMcpClient, DECKCRAFT_MCP_TOOLS, DECKCRAFT_VERSION, DECKCRAFT_COMMIT } from "./lib/mcp_protocol.mjs";
import { DeckCraftDriver, SAMPLE_CONSTRUCTION_PROGRESS_DECK } from "./lib/deckcraft_driver.mjs";

console.log("===============================================================================");
console.log(`DeckCraft Headless MCP Prototype Driver — v${DECKCRAFT_VERSION} (${DECKCRAFT_COMMIT})`);
console.log("===============================================================================\n");

async function main() {
  const client = new DeckCraftMcpClient();
  const driver = new DeckCraftDriver();

  console.log(`[1] Ingesting DeckCraft MCP tool inventory (${DECKCRAFT_MCP_TOOLS.length} tools registered)...`);
  for (const t of DECKCRAFT_MCP_TOOLS) {
    console.log(`    - ${t.name}: ${t.description.substring(0, 70)}...`);
  }

  console.log("\n[2] Loading base construction presentation template...");
  const openRes = await client.callTool("open_presentation", { path: "fixtures/monthly_review.pptx" });
  console.log(`    Presentation loaded: ${openRes.presentationId} (${openRes.slideCount} slides, master: ${openRes.masterSlideCount})`);

  console.log("\n[3] Inspecting presentation geometry and widescreen aspect ratio...");
  const metaRes = await client.callTool("inspect_deck_metadata", { presentationId: openRes.presentationId });
  console.log(`    Aspect Ratio: ${metaRes.aspectRatio} (${metaRes.slideWidthInches}" x ${metaRes.slideHeightInches}")`);

  console.log("\n[4] Generating Slide 2: Key Performance Indicators...");
  const s2 = await client.callTool("add_slide", {
    presentationId: openRes.presentationId,
    layoutType: "metrics_summary",
    title: "Executive KPIs — October 2026",
    subtitle: "Physical Progress, IPC Certified & Safety Records",
  });
  console.log(`    Slide created: ${s2.slideId}`);

  await client.callTool("insert_shape", {
    presentationId: openRes.presentationId,
    slideId: s2.slideId,
    shapeType: "badge",
    label: `Physical: ${SAMPLE_CONSTRUCTION_PROGRESS_DECK.keyMetrics.actualProgressPercent}% (Planned: ${SAMPLE_CONSTRUCTION_PROGRESS_DECK.keyMetrics.plannedProgressPercent}%)`,
  });

  console.log("\n[5] Generating Slide 3: Milestone Schedule Status Table...");
  const s3 = await client.callTool("add_slide", {
    presentationId: openRes.presentationId,
    layoutType: "table_content",
    title: "Key Critical Path Milestones (TruePPM Link)",
  });
  const milestoneRows = SAMPLE_CONSTRUCTION_PROGRESS_DECK.milestones.map((m) => [
    m.name,
    m.targetDate,
    m.status,
    `${m.varianceDays} d`,
  ]);
  const tableRes = await client.callTool("insert_slide_table", {
    presentationId: openRes.presentationId,
    slideId: s3.slideId,
    headers: ["Milestone Work Package", "Target Date", "Status", "Variance"],
    rows: milestoneRows,
  });
  console.log(`    Table inserted: ${tableRes.tableId} (${tableRes.rowCount} rows)`);

  console.log("\n[6] Generating Slide 4: EVM S-Curve Performance Chart...");
  const s4 = await client.callTool("add_slide", {
    presentationId: openRes.presentationId,
    layoutType: "chart_evm",
    title: "Earned Value Management (EVM) S-Curve",
    subtitle: `CPI = ${SAMPLE_CONSTRUCTION_PROGRESS_DECK.evmData.cpi}, SPI = ${SAMPLE_CONSTRUCTION_PROGRESS_DECK.evmData.spi}`,
  });
  const chartRes = await client.callTool("embed_chart", {
    presentationId: openRes.presentationId,
    slideId: s4.slideId,
    chartType: "line_s_curve",
    chartTitle: "Cumulative PV vs EV vs AC (NPR Millions)",
    series: [
      { name: "Planned Value (PV)", dataPoints: SAMPLE_CONSTRUCTION_PROGRESS_DECK.evmData.plannedValueMln },
      { name: "Earned Value (EV)", dataPoints: SAMPLE_CONSTRUCTION_PROGRESS_DECK.evmData.earnedValueMln },
      { name: "Actual Cost (AC)", dataPoints: SAMPLE_CONSTRUCTION_PROGRESS_DECK.evmData.actualCostMln },
    ],
  });
  console.log(`    Chart embedded: ${chartRes.chartId} (${chartRes.dataPointsCount} total data points)`);

  console.log("\n[7] Generating Slide 5: High-Altitude Site Photography...");
  const s5 = await client.callTool("add_slide", {
    presentationId: openRes.presentationId,
    layoutType: "photo_grid",
    title: "Site Construction Progress Photos",
  });
  for (const photo of SAMPLE_CONSTRUCTION_PROGRESS_DECK.sitePhotos) {
    const photoRes = await client.callTool("embed_site_photo", {
      presentationId: openRes.presentationId,
      slideId: s5.slideId,
      photoPath: `assets/${photo.title.toLowerCase().replaceAll(" ", "_")}.jpg`,
      caption: `${photo.caption} (${photo.chainage})`,
      chainage: photo.chainage,
    });
    console.log(`    Photo embedded: ${photoRes.photoId} - ${photo.caption}`);
  }

  console.log("\n[8] Exporting and validating OpenXML PPTX package...");
  const expRes = await client.callTool("export_pptx", { presentationId: openRes.presentationId });
  console.log(`    PPTX package serialized: ${expRes.outputPath} (${expRes.byteLength} bytes)`);

  const valRes = await client.callTool("validate_pptx_fidelity", { presentationId: openRes.presentationId });
  console.log(`    OpenXML PresentationML valid: ${valRes.slideTreeValid}, Conformant: ${valRes.conformant}`);

  const roundTrip = driver.evaluateRoundTrip(SAMPLE_CONSTRUCTION_PROGRESS_DECK);
  console.log(`    Round-trip verification: ${roundTrip.roundTripPass ? "PASS" : "FAIL"} (slides: ${roundTrip.slideCountPreserved}, charts: ${roundTrip.chartSeriesPreserved})`);

  console.log("\n===============================================================================");
  console.log("DeckCraft Prototype Driver Execution Completed Successfully (M12-T02)");
  console.log("===============================================================================\n");
}

main().catch((err) => {
  console.error("DeckCraft prototype driver failed:", err);
  process.exit(1);
});
