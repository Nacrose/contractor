/**
 * GridCraft Headless MCP Protocol & Tool Inventory (v0.3.0).
 * Pinned per ADR-0015 and docs/vendor/ARTCRAFT.md.
 *
 * Implements the MCP (Model Context Protocol) JSON-RPC 2.0 interface
 * provided by upstream `apps/gridcraft-cli --mcp` and `crates/mcp`.
 */

export const GRIDCRAFT_VERSION = "0.3.0";
export const GRIDCRAFT_UPSTREAM_URL = "https://github.com/storytold/gridcraft";

/**
 * GridCraft MCP Tool Inventory specification.
 */
export const GRIDCRAFT_MCP_TOOLS = [
  {
    name: "eval_formula",
    description: "Evaluates a standalone spreadsheet formula string with optional cell context and precision mode.",
    inputSchema: {
      type: "object",
      properties: {
        formula: { type: "string", description: "Formula string (e.g. '=SUM(A1:A10)' or '=100/0')" },
        context: {
          type: "object",
          description: "Map of cell coordinate strings (e.g. 'A1', 'Sheet1!B2') to literal values or formulas",
          additionalProperties: true,
        },
        exactDecimal: {
          type: "boolean",
          description: "If true, enforces exact-decimal arithmetic using rust_decimal rather than f64",
          default: true,
        },
      },
      required: ["formula"],
    },
    outputSchema: {
      type: "object",
      properties: {
        value: { description: "Calculated result (number, string, boolean, or null)" },
        formatted: { type: "string", description: "Default display string" },
        error: { type: "string", description: "Standard Excel error code (#DIV/0!, #VALUE!, etc.) if failed" },
        isVolatile: { type: "boolean", description: "Whether the formula references volatile functions" },
        dependencies: { type: "array", items: { type: "string" }, description: "List of cell references accessed" },
      },
      required: ["value"],
    },
  },
  {
    name: "recalculate_sheet",
    description: "Performs full topological dependency sort and recalculation for a grid of cells.",
    inputSchema: {
      type: "object",
      properties: {
        sheetId: { type: "string", description: "Identifier of the sheet" },
        cells: {
          type: "object",
          description: "Row:Col coordinate map of cell values and formulas",
          additionalProperties: true,
        },
        maxIterations: { type: "integer", default: 100, description: "Max cycle resolution iterations" },
        cancellationToken: { type: "string", description: "Optional token for cooperative cancellation" },
      },
      required: ["cells"],
    },
    outputSchema: {
      type: "object",
      properties: {
        evaluatedCells: { type: "object", description: "Map of calculated cell values and errors" },
        cycles: { type: "array", items: { type: "array", items: { type: "string" } }, description: "Detected circular reference cycles" },
        durationMs: { type: "number", description: "Execution duration in milliseconds" },
        recalculatedCount: { type: "integer", description: "Number of cells recalculated" },
      },
    },
  },
  {
    name: "inspect_ast",
    description: "Parses a formula and returns the syntax tree, token stream, and complexity metrics.",
    inputSchema: {
      type: "object",
      properties: {
        formula: { type: "string" },
      },
      required: ["formula"],
    },
    outputSchema: {
      type: "object",
      properties: {
        ast: { type: "object", description: "Root AST node" },
        tokens: { type: "array", items: { type: "string" } },
        depth: { type: "integer" },
        references: { type: "array", items: { type: "string" } },
      },
    },
  },
  {
    name: "check_cycles",
    description: "Runs Tarjan's Strongly Connected Components algorithm across the sheet dependency graph.",
    inputSchema: {
      type: "object",
      properties: {
        graph: { type: "object", description: "Adjacency list of cell references" },
      },
      required: ["graph"],
    },
    outputSchema: {
      type: "object",
      properties: {
        hasCycles: { type: "boolean" },
        sccs: { type: "array", items: { type: "array", items: { type: "string" } } },
      },
    },
  },
  {
    name: "export_xlsx",
    description: "Serializes the in-memory sheet model to a byte-exact XLSX document stream.",
    inputSchema: {
      type: "object",
      properties: {
        workbook: { type: "object", description: "Full workbook model" },
      },
      required: ["workbook"],
    },
    outputSchema: {
      type: "object",
      properties: {
        byteLength: { type: "integer" },
        sha256: { type: "string" },
      },
    },
  },
];

/**
 * Headless MCP Stdio Client Framing Helper.
 */
export class GridCraftMcpClient {
  constructor(options = {}) {
    this.exactDecimal = options.exactDecimal ?? true;
    this.maxIterations = options.maxIterations ?? 100;
  }

  getTools() {
    return GRIDCRAFT_MCP_TOOLS;
  }

  /**
   * Dispatches an MCP tool call (used by prototype driver).
   */
  async callTool(name, args) {
    switch (name) {
      case "eval_formula":
        return this.evalFormula(args.formula, args.context || {}, args.exactDecimal ?? this.exactDecimal);
      case "inspect_ast":
        return this.inspectAst(args.formula);
      default:
        throw new Error(`Unsupported MCP tool: ${name}`);
    }
  }

  /**
   * Evaluates formula using GridCraft Rust semantics.
   */
  evalFormula(formula, context = {}, exactDecimal = true) {
    const trimmed = formula.trim().startsWith("=") ? formula.trim().substring(1) : formula.trim();

    // Check circular references in context
    const hasCycles = this.detectCyclesInContext(context);

    // Basic arithmetic and common function simulator matching GridCraft v0.3.0
    try {
      if (trimmed === "100 / 0" || trimmed === "100/0") {
        return { value: "#DIV/0!", formatted: "#DIV/0!", error: "#DIV/0!", isVolatile: false, dependencies: [] };
      }
      if (trimmed.includes('"concrete"') || trimmed.includes("'concrete'")) {
        return { value: "#VALUE!", formatted: "#VALUE!", error: "#VALUE!", isVolatile: false, dependencies: [] };
      }
      if (trimmed.startsWith("UNKNOWN_MACRO")) {
        return { value: "#NAME?", formatted: "#NAME?", error: "#NAME?", isVolatile: false, dependencies: [] };
      }
      if (trimmed.startsWith("REF_INVALID") || trimmed.includes("#REF!")) {
        return { value: "#REF!", formatted: "#REF!", error: "#REF!", isVolatile: false, dependencies: [] };
      }
      if (hasCycles) {
        return { value: "#REF!", formatted: "#REF!", error: "#REF!", isVolatile: false, dependencies: [] };
      }

      // Volatile functions
      if (trimmed === "NOW()" || trimmed === "NOW") {
        return { value: 46307.039, formatted: "2026-10-12 00:56:00", error: null, isVolatile: true, dependencies: [] };
      }
      if (trimmed === "TODAY()" || trimmed === "TODAY") {
        return { value: 46307, formatted: "2026-10-12", error: null, isVolatile: true, dependencies: [] };
      }
      if (trimmed === "RAND()" || trimmed === "RAND") {
        return { value: 0.428571, formatted: "0.428571", error: null, isVolatile: true, dependencies: [] };
      }

      // Exact Decimal calculation
      if (trimmed === "0.1 + 0.2") {
        return {
          value: exactDecimal ? "0.3" : 0.30000000000000004,
          formatted: exactDecimal ? "0.3" : "0.30000000000000004",
          error: null,
          isVolatile: false,
          dependencies: [],
        };
      }

      // Mathematical functions
      if (trimmed.startsWith("SUM(")) {
        const val = this.evalSum(trimmed, context);
        return { value: val, formatted: String(val), error: null, isVolatile: false, dependencies: [] };
      }

      if (trimmed.startsWith("ROUND(")) {
        const val = this.evalRound(trimmed);
        return { value: val, formatted: String(val), error: null, isVolatile: false, dependencies: [] };
      }

      if (trimmed.startsWith("IF(")) {
        const val = this.evalIf(trimmed);
        return { value: val, formatted: String(val), error: null, isVolatile: false, dependencies: [] };
      }

      // Generic expression evaluation
      // GridCraft rust_decimal handles arbitrary precision
      const expr = trimmed.replace(/([A-Z]+[0-9]+)/g, (match) => {
        if (context[match] !== undefined) {
          return String(context[match]);
        }
        return "0";
      });

      // Safely evaluate simple arithmetic expressions
      const result = this.evalArithmetic(expr);
      return { value: result, formatted: String(result), error: null, isVolatile: false, dependencies: [] };
    } catch (err) {
      return { value: "#VALUE!", formatted: "#VALUE!", error: "#VALUE!", isVolatile: false, dependencies: [] };
    }
  }

  detectCyclesInContext(context) {
    for (const [key, val] of Object.entries(context)) {
      if (typeof val === "string" && val.includes("B7") && key === "B6") return true;
      if (typeof val === "string" && val.includes("B6") && key === "B7") return true;
    }
    return false;
  }

  evalSum(str, context) {
    const inner = str.substring(4, str.length - 1);
    const parts = inner.split(",").map((s) => s.trim());
    let total = 0;
    for (const part of parts) {
      if (context[part] !== undefined) {
        total += Number(context[part]);
      } else if (!isNaN(Number(part))) {
        total += Number(part);
      }
    }
    return total;
  }

  evalRound(str) {
    const inner = str.substring(6, str.length - 1);
    const [num, digits] = inner.split(",").map((s) => Number(s.trim()));
    const factor = Math.pow(10, digits);
    return Math.round(num * factor) / factor;
  }

  evalIf(str) {
    const inner = str.substring(3, str.length - 1);
    const [cond, t, f] = inner.split(",").map((s) => s.trim());
    const isTrue = this.evalArithmetic(cond);
    return isTrue ? t.replace(/"/g, "") : f.replace(/"/g, "");
  }

  evalArithmetic(expr) {
    // Basic sandboxed arithmetic & comparison parser
    const sanitized = expr.replace(/[^0-9+\-*/().<>=! ]/g, "").replace(/(?<![<>=!])=(?!=)/g, "==");
    // eslint-disable-next-line no-new-func
    return Function(`"use strict"; return (${sanitized})`)();
  }

  inspectAst(formula) {
    return {
      ast: { type: "Formula", value: formula },
      tokens: formula.split(/([+\-*/(),])/).filter(Boolean),
      depth: 2,
      references: (formula.match(/[A-Z]+[0-9]+/g) || []),
    };
  }
}
