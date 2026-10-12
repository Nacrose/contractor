#!/usr/bin/env node
/**
 * CADCraft Prototype & DWG/DXF Fixture Comparison Runner (M07-T01).
 *
 * Drives CADCraft v0.3.0, acadrust DWG bridge, and TS Authority over M00 CAD fixtures.
 */

import { CADCRAFT_VERSION, CADCRAFT_COMMIT, CADCRAFT_MCP_TOOLS, ACADRUST_VERSION, ACADRUST_CRATES_IO_LATEST } from "./lib/mcp_protocol.mjs";
import { AcadrustBridge } from "./lib/acadrust_bridge.mjs";
import { CadFixtureComparator, DRAFTING_ENTITIES } from "./lib/ts_authority_cad.mjs";

console.log("===============================================================================");
console.log(`     M07-T01: CADCRAFT v${CADCRAFT_VERSION} PROTOTYPE & DWG/DXF COMPARISON RUNNER`);
console.log("===============================================================================");
console.log(`Upstream Pin:      CADCraft v${CADCRAFT_VERSION} (storytold/cadcraft, commit ${CADCRAFT_COMMIT.slice(0, 10)})`);
console.log(`DWG Engine:        acadrust v${ACADRUST_VERSION} (crates.io latest: v${ACADRUST_CRATES_IO_LATEST}, MPL-2.0)`);
console.log(`Baseline Fallback: LibreDWG subprocess (dwg2dxf, GPL-3.0, M01 spike)`);
console.log(`Authority:         TypeScript CAD Model & Dart Viewport Kernel (M01-T05 / ADR-0013)`);
console.log("-------------------------------------------------------------------------------\n");

// 1. MCP Tools
console.log("1. HEADLESS MCP TOOL INVENTORY (CADCraft v0.3.0 Headless MCP Server):");
console.log("-------------------------------------------------------------------------------");
for (const tool of CADCRAFT_MCP_TOOLS) {
  console.log(`  • Tool: ${tool.name.padEnd(20, " ")} | Required: [${tool.inputSchema.required?.join(", ") || "none"}]`);
  console.log(`    ${tool.description}`);
}

// 2. DWG Version Matrix
const bridge = new AcadrustBridge();
const versionMatrix = bridge.getDwgVersionComparisonMatrix();
console.log("\n2. DWG VERSION COMPATIBILITY & ROUND-TRIP MATRIX (acadrust vs LibreDWG):");
console.log("-------------------------------------------------------------------------------");
console.log("| Ver    | Release | Compressed | acadrust Read | acadrust Write | LibreDWG Read | LibreDWG Write |");
console.log("|--------|---------|------------|---------------|----------------|---------------|----------------|");
for (const row of versionMatrix) {
  const v = row.version.padEnd(6, " ");
  const rel = row.releaseName.padEnd(7, " ");
  const comp = (row.compressed ? "Yes" : "No").padEnd(10, " ");
  const ar = (row.acadrust.read ? "YES (Native)" : "NO").padEnd(13, " ");
  const aw = (row.acadrust.write ? "YES (Native)" : "Upgrade").padEnd(14, " ");
  const lr = (row.libreDwg.read ? "YES (Subproc)" : "NO").padEnd(13, " ");
  const lw = (row.libreDwg.write ? "YES" : "NO (Read-only)").padEnd(14, " ");
  console.log(`| ${v} | ${rel} | ${comp} | ${ar} | ${aw} | ${lr} | ${lw} |`);
}

// 3. M00 DWG Fixtures
const dwgResults = bridge.evaluateM00Fixtures();
console.log("\n3. M00 DWG FIXTURE EVALUATION (Byte Header & Format Inspection):");
console.log("-------------------------------------------------------------------------------");
for (const r of dwgResults) {
  console.log(`  • Fixture: ${r.fixture}`);
  console.log(`    Size: ${r.sizeBytes} bytes | Expected: ${r.expectedVersion} | Detected: ${r.detectedVersion}`);
  console.log(`    acadrust Fidelity: ${r.acadrust.fidelityPercent}% (${r.acadrust.status}) | LibreDWG: ${r.libreDwgSubprocess.status}`);
}

// 4. 2D Drafting Semantics
console.log("\n4. 2D DRAFTING SEMANTIC PARITY MATRIX (CADCraft vs TS Authority):");
console.log("-------------------------------------------------------------------------------");
console.log("| Entity Type       | CADCraft Support                        | TS Authority Support           | Parity Status       |");
console.log("|-------------------|-----------------------------------------|--------------------------------|---------------------|");
for (const ent of DRAFTING_ENTITIES) {
  const typeCol = ent.type.padEnd(17, " ");
  const ccCol = ent.cadcraftSupport.slice(0, 39).padEnd(39, " ");
  const tsCol = ent.tsAuthoritySupport.slice(0, 30).padEnd(30, " ");
  const parityCol = ent.semanticParity.padEnd(19, " ");
  console.log(`| ${typeCol} | ${ccCol} | ${tsCol} | ${parityCol} |`);
}

// 5. DXF Fixtures
const dxfComparator = new CadFixtureComparator();
const dxfResults = dxfComparator.evaluateDxfFixtures();
console.log("\n5. M00 DXF & DEGENERATE FIXTURE TEST MATRIX:");
console.log("-------------------------------------------------------------------------------");
for (const r of dxfResults) {
  console.log(`  • [${r.category.toUpperCase()}] ${r.fixture} (${r.lineCount} lines)`);
  console.log(`    Outcome: ${r.cadcraftResult} | Status: ${r.status}`);
  console.log(`    Notes:   ${r.notes}`);
}

// 6. Recommendation
console.log("\n===============================================================================");
console.log("6. ARCHITECTURAL FINDINGS & RECOMMENDATION (ADR-0015 §7):");
console.log("-------------------------------------------------------------------------------");
console.log("  1. Native DWG Write: acadrust provides native read + write capability for");
console.log("     modern AutoCAD generations (AC1015 through AC1032), solving the major M01");
console.log("     spike limitation where Contractor had NO DWG write capability.");
console.log("  2. License Cleanliness: acadrust is MPL-2.0, permitting in-process linking");
console.log("     without triggering copyleft obligations on the host application, unlike");
console.log("     LibreDWG (GPL-3.0-or-later) which requires strict subprocess isolation.");
console.log("  3. Headless Automation: CADCraft MCP protocol exposes 7 discrete tools for");
console.log("     opening, querying, snapping, computing areas, and exporting drawings.");
console.log("  4. Explicit Recommendation: Proceed toward a per-engine adoption ADR for");
console.log("     CADCraft (M07-T04 / ADR-0020), adopting acadrust for native DWG read/write");
console.log("     while retaining LibreDWG solely as a legacy fallback subprocess for AC1012/14.");
console.log("===============================================================================");
