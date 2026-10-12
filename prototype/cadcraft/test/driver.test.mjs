import { test } from "node:test";
import assert from "node:assert/strict";
import { CADCRAFT_MCP_TOOLS, CadCraftMcpClient, CADCRAFT_VERSION, ACADRUST_VERSION } from "../lib/mcp_protocol.mjs";
import { AcadrustBridge, DWG_VERSIONS } from "../lib/acadrust_bridge.mjs";
import { CadFixtureComparator, DRAFTING_ENTITIES } from "../lib/ts_authority_cad.mjs";

test("CADCraft MCP Protocol: exposes 7 required headless tools with valid schemas", () => {
  assert.equal(CADCRAFT_VERSION, "0.3.0");
  assert.equal(CADCRAFT_MCP_TOOLS.length, 7);

  const requiredToolNames = [
    "open_drawing",
    "export_drawing",
    "query_entities",
    "detect_snaps",
    "calculate_area",
    "execute_command",
    "check_dwg_fidelity",
  ];

  for (const name of requiredToolNames) {
    const tool = CADCRAFT_MCP_TOOLS.find((t) => t.name === name);
    assert.ok(tool, `Tool ${name} must be present in inventory`);
    assert.ok(tool.description.length > 10, `Tool ${name} must have description`);
    assert.ok(tool.inputSchema, `Tool ${name} must have inputSchema`);
    assert.ok(tool.outputSchema, `Tool ${name} must have outputSchema`);
  }
});

test("CadCraftMcpClient: dispatches headless tools with structured responses", async () => {
  const client = new CadCraftMcpClient();

  const openRes = await client.callTool("open_drawing", { path: "test.dwg", format: "dwg" });
  assert.ok(openRes.documentId);
  assert.equal(openRes.format, "dwg");
  assert.equal(openRes.version, "AC1015");
  assert.ok(openRes.entityCount > 0);

  const snapRes = await client.callTool("detect_snaps", {
    documentId: openRes.documentId,
    point: { x: 10, y: 0 },
    modes: ["endpoint"],
  });
  assert.equal(snapRes.snapped, true);
  assert.equal(snapRes.snapMode, "endpoint");

  const areaRes = await client.callTool("calculate_area", {
    documentId: openRes.documentId,
    entityHandles: ["3B"],
  });
  assert.equal(areaRes.netArea, 47.5);
  assert.equal(areaRes.isValid, true);

  const fidelityRes = await client.callTool("check_dwg_fidelity", {
    inputDwgPath: "sample_2000.dwg",
    targetVersion: "AC1032",
  });
  assert.equal(fidelityRes.inputVersion, "AC1015");
  assert.equal(fidelityRes.outputVersion, "AC1032");
  assert.ok(fidelityRes.fidelityPercent >= 99.0);
});

test("acadrust DWG Bridge: version matrix covers AC1015 through AC1032 read and write", () => {
  const bridge = new AcadrustBridge();
  const matrix = bridge.getDwgVersionComparisonMatrix();

  assert.equal(matrix.length, DWG_VERSIONS.length);

  // Modern versions AC1015..AC1032 must support both read and write in acadrust
  const modernVersions = ["AC1015", "AC1018", "AC1021", "AC1024", "AC1027", "AC1032"];
  for (const vCode of modernVersions) {
    const entry = matrix.find((m) => m.version === vCode);
    assert.ok(entry, `Version ${vCode} must exist`);
    assert.equal(entry.acadrust.read, true, `${vCode} read must be true`);
    assert.equal(entry.acadrust.write, true, `${vCode} write must be true`);
    assert.equal(entry.acadrust.roundtrip, true, `${vCode} roundtrip must be true`);
    assert.equal(entry.acadrust.license, "MPL-2.0");
    // LibreDWG baseline is read-only in contractor architecture
    assert.equal(entry.libreDwg.write, false);
    assert.equal(entry.libreDwg.license, "GPL-3.0");
  }

  // Legacy versions AC1012 and AC1014: read supported, write upgrades to modern
  for (const legacyCode of ["AC1012", "AC1014"]) {
    const entry = matrix.find((m) => m.version === legacyCode);
    assert.ok(entry);
    assert.equal(entry.acadrust.read, true);
    assert.equal(entry.acadrust.write, false); // upgrades
  }
});

test("M00 DWG Fixtures: detect magic headers on sample_r13, sample_r14, and sample_2000", () => {
  const bridge = new AcadrustBridge();
  const results = bridge.evaluateM00Fixtures();

  assert.equal(results.length, 3);
  for (const r of results) {
    assert.equal(r.exists, true, `Fixture ${r.fixture} must exist on disk`);
    assert.ok(r.sizeBytes > 1000, `Fixture ${r.fixture} size must be non-trivial`);
    assert.equal(r.detectedVersion, r.expectedVersion, `Magic header must match expected for ${r.fixture}`);
    assert.ok(r.acadrust.fidelityPercent >= 98.0, `Fidelity must exceed 98% for ${r.fixture}`);
    assert.equal(r.acadrust.status, "PASS");
  }
});

test("2D Drafting Semantics: entity comparison establishes exact parity and CADCraft superset", () => {
  assert.equal(DRAFTING_ENTITIES.length, 9);

  // Exact parity for foundational entities
  const exactTypes = ["LINE", "CIRCLE", "ARC", "LWPOLYLINE", "INSERT"];
  for (const t of exactTypes) {
    const ent = DRAFTING_ENTITIES.find((e) => e.type === t);
    assert.ok(ent, `Entity ${t} must exist`);
    assert.equal(ent.semanticParity, "EXACT_PARITY");
  }

  // CADCraft superset for advanced drafting entities
  const supersetTypes = ["DIMENSION", "HATCH", "TEXT / MTEXT", "LAYOUT / VIEWPORT"];
  for (const t of supersetTypes) {
    const ent = DRAFTING_ENTITIES.find((e) => e.type === t);
    assert.ok(ent, `Entity ${t} must exist`);
    assert.equal(ent.semanticParity, "CADCRAFT_SUPERSET");
  }
});

test("M00 DXF Fixtures: standard site plan, micro-geometry tolerance, extreme UTM coords, and corrupt syntax fail-closed", () => {
  const comparator = new CadFixtureComparator();
  const results = comparator.evaluateDxfFixtures();

  assert.equal(results.length, 4);

  const standard = results.find((r) => r.fixture === "standard_site_plan.dxf");
  assert.ok(standard);
  assert.equal(standard.cadcraftResult, "PASS");
  assert.equal(standard.status, "MATCH");

  const micro = results.find((r) => r.fixture === "degenerate_micro_geom.dxf");
  assert.ok(micro);
  assert.equal(micro.cadcraftResult, "TOLERANCE_NORMALIZED");

  const extreme = results.find((r) => r.fixture === "degenerate_extreme_coords.dxf");
  assert.ok(extreme);
  assert.equal(extreme.cadcraftResult, "F64_ACCURATE");

  const corrupt = results.find((r) => r.fixture === "degenerate_malformed_syntax.dxf");
  assert.ok(corrupt);
  assert.equal(corrupt.cadcraftResult, "SYNTAX_ERROR_REJECTED");
  assert.equal(corrupt.tsResult, "SYNTAX_ERROR_REJECTED");
});
