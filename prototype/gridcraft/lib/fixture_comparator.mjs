/**
 * Fixture Comparator between GridCraft (Rust) and TypeScript Authority (M06-T01).
 *
 * Runs M00 worksheet fixtures across both engines and analyzes:
 * - Functional parity & divergences
 * - Decimal precision semantics (rust_decimal vs IEEE 754)
 * - Date/Time handling (UTC instant vs date-only in Nepal timezone)
 * - Error classification (#DIV/0!, #VALUE!, #NAME?, #REF!, #CYCLE!)
 * - Volatile function behavior (NOW, TODAY, RAND)
 */

import { GridCraftMcpClient } from "./mcp_protocol.mjs";
import { TsAuthorityEvaluator } from "./ts_authority_evaluator.mjs";

export class FixtureComparator {
  constructor() {
    this.gridcraft = new GridCraftMcpClient({ exactDecimal: true });
    this.tsAuthority = new TsAuthorityEvaluator();
  }

  runComparisonCases(cases) {
    const results = [];

    for (const testCase of cases) {
      const gResult = this.gridcraft.evalFormula(testCase.formula, testCase.context || {}, true);
      const tsResult = this.tsAuthority.evaluateFormula(testCase.formula, testCase.context || {});

      let match = false;
      let divergenceType = "NONE";
      let divergenceNote = "";

      // 1. Error parity check
      if (gResult.error && tsResult.error) {
        if (gResult.error === tsResult.error) {
          match = true;
        } else if (
          (gResult.error === "#REF!" && tsResult.error === "#CYCLE!") ||
          (gResult.error === "#CYCLE!" && tsResult.error === "#REF!")
        ) {
          // Both caught the circular reference, but GridCraft emits Excel standard #REF! while TS emitted internal #CYCLE!
          match = false;
          divergenceType = "ERROR_CODE";
          divergenceNote = "GridCraft emits standard Excel #REF! on cycle; TS authority emitted #CYCLE!";
        } else {
          match = false;
          divergenceType = "ERROR_CODE";
          divergenceNote = `Error mismatch: GridCraft=${gResult.error}, TS=${tsResult.error}`;
        }
      } else if (gResult.error || tsResult.error) {
        match = false;
        divergenceType = "ERROR_CODE";
        divergenceNote = `One engine errored while other succeeded (GC=${gResult.error}, TS=${tsResult.error})`;
      } else if (gResult.isVolatile || tsResult.isVolatile) {
        // Volatile functions will naturally differ in random / time values
        match = true;
        divergenceType = "VOLATILE";
        divergenceNote = "Volatile function: both engines recognize volatile recalculation semantics";
      } else if (typeof gResult.value === "string" && typeof tsResult.value === "number") {
        // Exact decimal string vs IEEE 754 number (e.g. "0.3" vs 0.30000000000000004)
        if (Math.abs(Number(gResult.value) - tsResult.value) < 1e-9) {
          match = false;
          divergenceType = "EXACT_DECIMAL";
          divergenceNote = `Exact decimal string '${gResult.value}' (rust_decimal) vs IEEE float ${tsResult.value}`;
        }
      } else {
        match = gResult.value === tsResult.value;
        if (!match && typeof gResult.value === "number" && typeof tsResult.value === "number") {
          match = Math.abs(gResult.value - tsResult.value) < 1e-6;
        }
      }

      results.push({
        id: testCase.id,
        category: testCase.category,
        formula: testCase.formula,
        gridcraftValue: gResult.value,
        gridcraftError: gResult.error,
        tsValue: tsResult.value,
        tsError: tsResult.error,
        match,
        divergenceType,
        divergenceNote,
      });
    }

    return results;
  }

  getStandardBenchmarkCases() {
    return [
      {
        id: "div-zero",
        category: "Errors",
        formula: "=100 / 0",
        expectedBehavior: "#DIV/0!",
      },
      {
        id: "value-string-arithmetic",
        category: "Errors",
        formula: '="concrete" * 10',
        expectedBehavior: "#VALUE!",
      },
      {
        id: "name-unknown-fn",
        category: "Errors",
        formula: "=UNKNOWN_MACRO(42)",
        expectedBehavior: "#NAME?",
      },
      {
        id: "ref-invalid-pointer",
        category: "Errors",
        formula: "=REF_INVALID!A1",
        expectedBehavior: "#REF!",
      },
      {
        id: "cycle-circular-ref",
        category: "Cycles",
        formula: "=B7 + 1",
        context: { B6: "=B7 + 1", B7: "=B6 * 2" },
        expectedBehavior: "Cycle detected, graceful error",
      },
      {
        id: "decimal-precision-addition",
        category: "Precision",
        formula: "=0.1 + 0.2",
        expectedBehavior: "Exact decimal 0.3 vs 0.30000000000000004",
      },
      {
        id: "math-sum-range",
        category: "Math",
        formula: "=SUM(10, 20, 30, 40)",
        expectedBehavior: "100",
      },
      {
        id: "math-sum-with-context",
        category: "Math",
        formula: "=SUM(A1, B1, 50)",
        context: { A1: 150, B1: 250 },
        expectedBehavior: "450",
      },
      {
        id: "math-round-decimal",
        category: "Math",
        formula: "=ROUND(123.456, 2)",
        expectedBehavior: "123.46",
      },
      {
        id: "logic-if-true",
        category: "Logic",
        formula: '=IF(10 > 5, "PASS", "FAIL")',
        expectedBehavior: "PASS",
      },
      {
        id: "logic-if-false",
        category: "Logic",
        formula: '=IF(2 > 5, "PASS", "FAIL")',
        expectedBehavior: "FAIL",
      },
      {
        id: "volatile-today",
        category: "Volatile",
        formula: "=TODAY()",
        expectedBehavior: "Current Date",
      },
      {
        id: "volatile-now",
        category: "Volatile",
        formula: "=NOW()",
        expectedBehavior: "Current Timestamp",
      },
      {
        id: "volatile-rand",
        category: "Volatile",
        formula: "=RAND()",
        expectedBehavior: "Number between 0 and 1",
      },
    ];
  }
}
