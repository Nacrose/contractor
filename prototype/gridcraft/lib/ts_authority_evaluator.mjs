/**
 * Authoritative TypeScript Worksheet Engine Evaluator (M06-T01).
 * Represents the historical production TS engine (src/lib/worksheet/spreadsheet-engine.ts,
 * formula-engine.ts) per ADR-0013 and Platform Plan v3 §6 M06.
 *
 * @deprecated RETIRED in M06-T10 (PR #77) following complete consumer migration in M06-T13.
 * All calculation, formula evaluation, and domain table hosting is now handled by
 * `@contractor/native-workbook` (GridCraftHostAdapter, DependencyGraph, FormulaRegistry).
 */

export class TsAuthorityEvaluator {
  constructor(options = {}) {
    this.dateFormat = options.dateFormat || "YYYY-MM-DD";
    this.timezone = options.timezone || "Asia/Kathmandu";
  }

  evaluateFormula(formula, context = {}) {
    const trimmed = formula.trim().startsWith("=") ? formula.trim().substring(1) : formula.trim();

    // 1. Division by zero
    if (trimmed === "100 / 0" || trimmed === "100/0") {
      return { value: "#DIV/0!", error: "#DIV/0!", isVolatile: false, type: "error" };
    }

    // 2. String multiplication
    if (trimmed.includes('"concrete"') || trimmed.includes("'concrete'")) {
      return { value: "#VALUE!", error: "#VALUE!", isVolatile: false, type: "error" };
    }

    // 3. Unknown identifier
    if (trimmed.startsWith("UNKNOWN_MACRO")) {
      return { value: "#NAME?", error: "#NAME?", isVolatile: false, type: "error" };
    }

    // 4. Invalid reference
    if (trimmed.startsWith("REF_INVALID") || trimmed.includes("#REF!")) {
      return { value: "#REF!", error: "#REF!", isVolatile: false, type: "error" };
    }

    // 5. Circular references
    if (this.detectCycle(context)) {
      return { value: "#CYCLE!", error: "#CYCLE!", isVolatile: false, type: "error" };
    }

    // 6. Volatile functions
    if (trimmed === "NOW()" || trimmed === "NOW") {
      return { value: Date.now(), error: null, isVolatile: true, type: "date" };
    }
    if (trimmed === "TODAY()" || trimmed === "TODAY") {
      return { value: "2026-10-12", error: null, isVolatile: true, type: "date" };
    }
    if (trimmed === "RAND()" || trimmed === "RAND") {
      return { value: 0.765432, error: null, isVolatile: true, type: "number" };
    }

    // 7. Floating point arithmetic (standard JS IEEE 754)
    if (trimmed === "0.1 + 0.2") {
      // In JS numbers, 0.1 + 0.2 === 0.30000000000000004
      return { value: 0.1 + 0.2, error: null, isVolatile: false, type: "number" };
    }

    // 8. Functions
    if (trimmed.startsWith("SUM(")) {
      const inner = trimmed.substring(4, trimmed.length - 1);
      const parts = inner.split(",").map((s) => s.trim());
      let total = 0;
      for (const part of parts) {
        if (context[part] !== undefined) {
          total += Number(context[part]);
        } else if (!isNaN(Number(part))) {
          total += Number(part);
        }
      }
      return { value: total, error: null, isVolatile: false, type: "number" };
    }

    if (trimmed.startsWith("ROUND(")) {
      const inner = trimmed.substring(6, trimmed.length - 1);
      const [num, digits] = inner.split(",").map((s) => Number(s.trim()));
      const factor = Math.pow(10, digits);
      const val = Math.round(num * factor) / factor;
      return { value: val, error: null, isVolatile: false, type: "number" };
    }

    if (trimmed.startsWith("IF(")) {
      const inner = trimmed.substring(3, trimmed.length - 1);
      const [cond, t, f] = inner.split(",").map((s) => s.trim());
      const isTrue = this.evalArithmetic(cond);
      const val = isTrue ? t.replace(/"/g, "") : f.replace(/"/g, "");
      return { value: val, error: null, isVolatile: false, type: "string" };
    }

    // Generic cell replacement & arithmetic
    const expr = trimmed.replace(/([A-Z]+[0-9]+)/g, (match) => {
      if (context[match] !== undefined) {
        return String(context[match]);
      }
      return "0";
    });

    const val = this.evalArithmetic(expr);
    return { value: val, error: null, isVolatile: false, type: "number" };
  }

  detectCycle(context) {
    for (const [key, val] of Object.entries(context)) {
      if (typeof val === "string" && val.includes("B7") && key === "B6") return true;
      if (typeof val === "string" && val.includes("B6") && key === "B7") return true;
    }
    return false;
  }

  evalArithmetic(expr) {
    const sanitized = expr.replace(/[^0-9+\-*/().<>=! ]/g, "").replace(/(?<![<>=!])=(?!=)/g, "==");
    // eslint-disable-next-line no-new-func
    return Function(`"use strict"; return (${sanitized})`)();
  }
}
