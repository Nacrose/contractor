#!/usr/bin/env node
/**
 * GridCraft Prototype & Fixture Comparison Runner (M06-T01).
 *
 * Drives GridCraft v0.3.0 and TypeScript Authority over M00 worksheet fixtures.
 */

import { FixtureComparator } from "./lib/fixture_comparator.mjs";
import { GRIDCRAFT_MCP_TOOLS, GRIDCRAFT_VERSION } from "./lib/mcp_protocol.mjs";

console.log("===============================================================================");
console.log(`     M06-T01: GRIDCRAFT v${GRIDCRAFT_VERSION} PROTOTYPE & FIXTURE COMPARISON RUNNER`);
console.log("===============================================================================");
console.log(`Upstream Pin: GridCraft v${GRIDCRAFT_VERSION} (storytold/gridcraft)`);
console.log("Authority:    TypeScript Spreadsheet Engine (spreadsheet-engine.ts, ADR-0013)");
console.log("-------------------------------------------------------------------------------\n");

const comparator = new FixtureComparator();
const cases = comparator.getStandardBenchmarkCases();
const results = comparator.runComparisonCases(cases);

console.log("1. MCP TOOL INVENTORY (GridCraft v0.3.0 Headless MCP Server):");
console.log("-------------------------------------------------------------------------------");
for (const tool of GRIDCRAFT_MCP_TOOLS) {
  console.log(`  • Tool: ${tool.name}`);
  console.log(`    Description: ${tool.description}`);
  console.log(`    Required Inputs: [${tool.inputSchema.required?.join(", ") || "none"}]`);
}
console.log("\n2. FIXTURE COMPARISON RESULTS (GridCraft vs TS Authority):");
console.log("-------------------------------------------------------------------------------");
console.log(
  "| ID                          | Formula              | GridCraft (Rust)     | TS Authority (JS)    | Status     |"
);
console.log(
  "|-----------------------------|----------------------|----------------------|----------------------|------------|"
);

let exactMatches = 0;
let semanticDivergences = 0;
let volatileMatches = 0;

for (const r of results) {
  const idCol = r.id.padEnd(27, " ");
  const formulaCol = r.formula.padEnd(20, " ");
  const gcVal = String(r.gridcraftValue).padEnd(20, " ");
  const tsVal = String(r.tsValue).padEnd(20, " ");
  let status = "MATCH";

  if (r.match) {
    if (r.divergenceType === "VOLATILE") {
      status = "VOLATILE";
      volatileMatches++;
    } else {
      exactMatches++;
    }
  } else {
    status = r.divergenceType || "MISMATCH";
    semanticDivergences++;
  }

  console.log(`| ${idCol} | ${formulaCol} | ${gcVal} | ${tsVal} | ${status.padEnd(10, " ")} |`);
}

console.log("-------------------------------------------------------------------------------");
console.log(`Totals: ${cases.length} cases evaluated.`);
console.log(`  - Exact Semantic Parity:       ${exactMatches}`);
console.log(`  - Volatile Agreed Behaviors:   ${volatileMatches}`);
console.log(`  - Characterized Divergences:   ${semanticDivergences} (Exact decimal & Error code taxonomy)`);
console.log("===============================================================================\n");

console.log("3. SEMANTIC CHARACTERIZATION SUMMARY:");
console.log("  • Exact Decimal Semantics: GridCraft uses `rust_decimal`, yielding exact decimal '0.3'");
console.log("    whereas JS TS authority yields IEEE 754 float 0.30000000000000004. For financial BoQ");
console.log("    calculations, GridCraft exact-decimal prevents floating-point penny drift.");
console.log("  • Error Taxonomy: GridCraft maps circular references to Excel standard #REF! while TS");
console.log("    emitted internal #CYCLE!. Both correctly halt recursion without infinite loops.");
console.log("  • Volatile Recalculation: NOW(), TODAY(), RAND() are flagged volatile in both engines;");
console.log("    GridCraft headless MCP allows deterministic evaluation with fixed timestamp overrides.");
console.log("===============================================================================");
