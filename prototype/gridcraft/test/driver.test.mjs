import test from "node:test";
import assert from "node:assert/strict";
import { FixtureComparator } from "../lib/fixture_comparator.mjs";
import { GRIDCRAFT_MCP_TOOLS, GRIDCRAFT_VERSION, GridCraftMcpClient } from "../lib/mcp_protocol.mjs";
import { TsAuthorityEvaluator } from "../lib/ts_authority_evaluator.mjs";

test("GridCraft MCP Protocol: exposes 5 required headless tools", () => {
  const client = new GridCraftMcpClient();
  const tools = client.getTools();
  assert.equal(tools.length, 5);
  const toolNames = tools.map((t) => t.name);
  assert.ok(toolNames.includes("eval_formula"));
  assert.ok(toolNames.includes("recalculate_sheet"));
  assert.ok(toolNames.includes("inspect_ast"));
  assert.ok(toolNames.includes("check_cycles"));
  assert.ok(toolNames.includes("export_xlsx"));
});

test("GridCraft vs TS Authority: division by zero emits #DIV/0!", () => {
  const comparator = new FixtureComparator();
  const [result] = comparator.runComparisonCases([
    { id: "div-zero", category: "Errors", formula: "=100 / 0", expectedBehavior: "#DIV/0!" },
  ]);
  assert.equal(result.gridcraftError, "#DIV/0!");
  assert.equal(result.tsError, "#DIV/0!");
  assert.equal(result.match, true);
});

test("GridCraft vs TS Authority: circular reference halts and produces typed error", () => {
  const comparator = new FixtureComparator();
  const [result] = comparator.runComparisonCases([
    {
      id: "cycle-check",
      category: "Cycles",
      formula: "=B7 + 1",
      context: { B6: "=B7 + 1", B7: "=B6 * 2" },
      expectedBehavior: "Cycle detected",
    },
  ]);
  assert.ok(result.gridcraftError === "#REF!" || result.gridcraftError === "#CYCLE!");
  assert.ok(result.tsError === "#CYCLE!" || result.tsError === "#REF!");
  assert.equal(result.divergenceType, "ERROR_CODE");
});

test("GridCraft vs TS Authority: exact decimal calculation characterization", () => {
  const comparator = new FixtureComparator();
  const [result] = comparator.runComparisonCases([
    {
      id: "exact-decimal",
      category: "Precision",
      formula: "=0.1 + 0.2",
      expectedBehavior: "Exact decimal 0.3 vs float",
    },
  ]);
  assert.equal(result.gridcraftValue, "0.3");
  assert.equal(result.tsValue, 0.30000000000000004);
  assert.equal(result.divergenceType, "EXACT_DECIMAL");
});

test("GridCraft vs TS Authority: standard math and logic functions match", () => {
  const comparator = new FixtureComparator();
  const results = comparator.runComparisonCases([
    { id: "sum", category: "Math", formula: "=SUM(10, 20, 30)", expectedBehavior: "60" },
    { id: "round", category: "Math", formula: "=ROUND(45.678, 1)", expectedBehavior: "45.7" },
    { id: "if", category: "Logic", formula: '=IF(10 > 5, "YES", "NO")', expectedBehavior: "YES" },
  ]);
  for (const r of results) {
    assert.equal(r.match, true);
  }
});

test("GridCraft vs TS Authority: volatile functions flagged in both engines", () => {
  const gc = new GridCraftMcpClient();
  const ts = new TsAuthorityEvaluator();

  const gcNow = gc.evalFormula("=NOW()");
  const tsNow = ts.evaluateFormula("=NOW()");
  assert.equal(gcNow.isVolatile, true);
  assert.equal(tsNow.isVolatile, true);

  const gcRand = gc.evalFormula("=RAND()");
  const tsRand = ts.evaluateFormula("=RAND()");
  assert.equal(gcRand.isVolatile, true);
  assert.equal(tsRand.isVolatile, true);
});
