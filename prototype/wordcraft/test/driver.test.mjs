import { test } from "node:test";
import assert from "node:assert/strict";
import {
  WORDCRAFT_MCP_TOOLS,
  WordCraftMcpClient,
  WORDCRAFT_VERSION,
  WORDCRAFT_COMMIT,
} from "../lib/mcp_protocol.mjs";
import {
  WordCraftDriver,
  SAMPLE_FIDIC_VARIATION_NOTICE,
} from "../lib/wordcraft_driver.mjs";

test("WordCraft MCP Protocol: exposes 12 required headless tools with valid schemas", () => {
  assert.equal(WORDCRAFT_VERSION, "0.3.0");
  assert.equal(WORDCRAFT_COMMIT, "b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1");
  assert.equal(WORDCRAFT_MCP_TOOLS.length, 12);

  const requiredToolNames = [
    "open_document",
    "inspect_metadata",
    "insert_paragraph",
    "replace_placeholder",
    "insert_table",
    "record_track_change",
    "add_comment",
    "accept_or_reject_changes",
    "apply_style",
    "export_docx",
    "export_pdf_preview",
    "validate_docx_fidelity",
  ];

  for (const name of requiredToolNames) {
    const tool = WORDCRAFT_MCP_TOOLS.find((t) => t.name === name);
    assert.ok(tool, `Tool ${name} must be present in inventory`);
    assert.ok(tool.description.length > 10, `Tool ${name} must have meaningful description`);
    assert.ok(tool.inputSchema, `Tool ${name} must have inputSchema`);
    assert.ok(tool.outputSchema, `Tool ${name} must have outputSchema`);
  }
});

test("WordCraftMcpClient: loads document, inspects metadata, and substitutes placeholders", async () => {
  const client = new WordCraftMcpClient();

  const openRes = await client.callTool("open_document", { path: "fixtures/notice.docx" });
  assert.ok(openRes.documentId);
  assert.equal(openRes.paragraphCount, 3);
  assert.equal(openRes.openXmlVersion, "ISO/IEC 29500:2012");

  const metaRes = await client.callTool("inspect_metadata", { documentId: openRes.documentId });
  assert.equal(metaRes.title, "FIDIC Construction Notice");
  assert.ok(metaRes.placeholdersDetected.includes("{{project_name}}"));

  const replaceRes = await client.callTool("replace_placeholder", {
    documentId: openRes.documentId,
    replacements: {
      project_name: "Kathmandu Valley Water Project",
      engineer_name: "Er. Ramesh Karki",
      employer_name: "Melamchi Board",
    },
  });
  assert.equal(replaceRes.replacedCount, 3);
  assert.equal(replaceRes.unresolvedPlaceholders.length, 0);
});

test("WordCraftMcpClient: inserts tables, manages track changes and reviewer comments", async () => {
  const client = new WordCraftMcpClient();
  const openRes = await client.callTool("open_document", { path: "fixtures/spec.docx" });

  // Insert cost summary table
  const tblRes = await client.callTool("insert_table", {
    documentId: openRes.documentId,
    headers: ["Item", "Cost", "Duration"],
    rows: [
      ["Tunnel Grouting", "1,200,000", "5 days"],
      ["Shotcrete Support", "2,500,000", "8 days"],
    ],
  });
  assert.ok(tblRes.tableId);
  assert.equal(tblRes.rowCount, 3);
  assert.equal(tblRes.colCount, 3);

  // Track changes insertion
  const tcRes = await client.callTool("record_track_change", {
    documentId: openRes.documentId,
    changeType: "insert",
    author: "Resident Engineer",
    text: "Approval subject to core sample laboratory compressive testing.",
  });
  assert.ok(tcRes.changeId);
  assert.equal(tcRes.applied, true);

  // Attach reviewer comment
  const cmtRes = await client.callTool("add_comment", {
    documentId: openRes.documentId,
    author: "Senior QA Inspector",
    commentText: "Test cubes must be cured in water tank for 28 days.",
    targetParagraphId: "p-01",
  });
  assert.ok(cmtRes.commentId);

  // Accept all track changes
  const resolveRes = await client.callTool("accept_or_reject_changes", {
    documentId: openRes.documentId,
    action: "accept_all",
  });
  assert.equal(resolveRes.resolvedCount, 1);
  assert.equal(resolveRes.remainingPendingCount, 0);
});

test("WordCraftDriver: verifies lossless round-trip and template placeholder integrity", () => {
  const driver = new WordCraftDriver();

  const template = driver.generateCorrespondenceTemplate();
  assert.ok(template.includes("{{client_name}}"));
  assert.ok(template.includes("{{subject}}"));

  const rendered = driver.renderLetter(template, {
    date: "2026-10-12",
    reference_number: SAMPLE_FIDIC_VARIATION_NOTICE.referenceNumber,
    client_name: SAMPLE_FIDIC_VARIATION_NOTICE.clientName,
    contractor_name: SAMPLE_FIDIC_VARIATION_NOTICE.contractorName,
    project_name: SAMPLE_FIDIC_VARIATION_NOTICE.projectName,
    subject: SAMPLE_FIDIC_VARIATION_NOTICE.subject,
    clauses: SAMPLE_FIDIC_VARIATION_NOTICE.clausesReferenced.join(", "),
    body_content: "Please find attached the schedule impact breakdown.",
    authorized_signatory: "Er. Bikash Sharma",
  });

  const unresolved = driver.findUnresolvedPlaceholders(rendered);
  assert.equal(unresolved.length, 0);

  const roundTrip = driver.evaluateRoundTrip(SAMPLE_FIDIC_VARIATION_NOTICE);
  assert.equal(roundTrip.roundTripPass, true);
  assert.equal(roundTrip.tablesPreserved, 1);
  assert.equal(roundTrip.commentsPreserved, 1);
});
