#!/usr/bin/env node
/**
 * WordCraft Prototype Runner (M12-T01).
 * Executes headless MCP tools over construction letter and specification fixtures.
 */

import { WordCraftMcpClient, WORDCRAFT_MCP_TOOLS, WORDCRAFT_VERSION, WORDCRAFT_COMMIT } from "./lib/mcp_protocol.mjs";
import { WordCraftDriver, SAMPLE_FIDIC_VARIATION_NOTICE } from "./lib/wordcraft_driver.mjs";

console.log("===============================================================================");
console.log(`WordCraft Headless MCP Prototype Driver — v${WORDCRAFT_VERSION} (${WORDCRAFT_COMMIT})`);
console.log("===============================================================================\n");

async function main() {
  const client = new WordCraftMcpClient();
  const driver = new WordCraftDriver();

  console.log(`[1] Ingesting WordCraft MCP tool inventory (${WORDCRAFT_MCP_TOOLS.length} tools registered)...`);
  for (const t of WORDCRAFT_MCP_TOOLS) {
    console.log(`    - ${t.name}: ${t.description.substring(0, 70)}...`);
  }

  console.log("\n[2] Loading sample construction notice fixture...");
  const openRes = await client.callTool("open_document", { path: "fixtures/fidic_notice.docx" });
  console.log(`    Document loaded: ${openRes.documentId} (paragraphs: ${openRes.paragraphCount}, OpenXML: ${openRes.openXmlVersion})`);

  console.log("\n[3] Inspecting document metadata and placeholders...");
  const metaRes = await client.callTool("inspect_metadata", { documentId: openRes.documentId });
  console.log(`    Title: "${metaRes.title}", Creator: "${metaRes.creator}"`);
  console.log(`    Placeholders detected: ${metaRes.placeholdersDetected.join(", ")}`);

  console.log("\n[4] Executing mail-merge placeholder replacement...");
  const replaceRes = await client.callTool("replace_placeholder", {
    documentId: openRes.documentId,
    replacements: {
      project_name: SAMPLE_FIDIC_VARIATION_NOTICE.projectName,
      engineer_name: "Er. Sushil Thapa",
      employer_name: SAMPLE_FIDIC_VARIATION_NOTICE.clientName,
    },
  });
  console.log(`    Replaced: ${replaceRes.replacedCount} fields; Unresolved remaining: ${replaceRes.unresolvedPlaceholders.length}`);

  console.log("\n[5] Appending cost impact table...");
  const tableRes = await client.callTool("insert_table", {
    documentId: openRes.documentId,
    headers: SAMPLE_FIDIC_VARIATION_NOTICE.tables[0].headers,
    rows: SAMPLE_FIDIC_VARIATION_NOTICE.tables[0].rows,
  });
  console.log(`    Table inserted: ${tableRes.tableId} (${tableRes.rowCount} rows x ${tableRes.colCount} cols)`);

  console.log("\n[6] Recording tracked redline changes and reviewer comments...");
  const tcRes = await client.callTool("record_track_change", {
    documentId: openRes.documentId,
    changeType: "insert",
    author: "Contractor Legal Counsel",
    text: "Claim submitted under strict reservation of rights per Sub-Clause 20.1.",
  });
  console.log(`    Track change recorded: ${tcRes.changeId} (author: Contractor Legal Counsel)`);

  const cmtRes = await client.callTool("add_comment", {
    documentId: openRes.documentId,
    author: SAMPLE_FIDIC_VARIATION_NOTICE.reviewComments[0].author,
    commentText: SAMPLE_FIDIC_VARIATION_NOTICE.reviewComments[0].comment,
    targetParagraphId: "p-01",
  });
  console.log(`    Comment attached: ${cmtRes.commentId}`);

  console.log("\n[7] Exporting and validating OpenXML DOCX package...");
  const expRes = await client.callTool("export_docx", { documentId: openRes.documentId });
  console.log(`    DOCX package serialized: ${expRes.outputPath} (${expRes.byteLength} bytes)`);

  const valRes = await client.callTool("validate_docx_fidelity", { documentId: openRes.documentId });
  console.log(`    OpenXML schema valid: ${valRes.xmlStructureValid}, Conformant: ${valRes.conformant}`);

  const roundTrip = driver.evaluateRoundTrip(SAMPLE_FIDIC_VARIATION_NOTICE);
  console.log(`    Round-trip verification: ${roundTrip.roundTripPass ? "PASS" : "FAIL"} (paragraphs: ${roundTrip.paragraphsPreserved}, tables: ${roundTrip.tablesPreserved})`);

  console.log("\n===============================================================================");
  console.log("WordCraft Prototype Driver Execution Completed Successfully (M12-T01)");
  console.log("===============================================================================\n");
}

main().catch((err) => {
  console.error("WordCraft prototype driver failed:", err);
  process.exit(1);
});
