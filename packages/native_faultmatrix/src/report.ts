/**
 * Fault-matrix report model (M03-T09).
 *
 * One row per covered boundary: what was exercised, the evidence source
 * (real SQLite here; disposable PostgreSQL in the CI service run), the
 * global invariant it proves, and the deterministic recovery action.
 * The runner emits a reproducible markdown report — the same run locally
 * (SQLite legs, PG legs SKIPped with an explicit marker) and in CI (both
 * engines live) produces the same table shape.
 */

export type MatrixResult = "PASS" | "SKIP" | "FAIL";

export interface MatrixRow {
  id: string;
  scenario: string;
  boundary: "local-commit" | "server-acceptance" | "feed-delivery" | "checkpoint" | "attachment" | "device-recovery";
  engine: "SQLite (real, node:sqlite)" | "PostgreSQL (disposable, CI service)";
  evidence: string;
  invariant: string;
  recovery: string;
  result: MatrixResult;
  detail?: string;
}

export const MATRIX_INVARIANTS = [
  "I1 no lost accepted operation",
  "I2 no duplicate business effect",
  "I3 no cross-tenant disclosure",
  "I4 safe recovery at every covered transaction/network boundary",
] as const;

export class MatrixReport {
  readonly rows: MatrixRow[] = [];

  add(row: MatrixRow): void {
    this.rows.push(row);
  }

  mark(id: string, result: MatrixResult, detail?: string): void {
    const row = this.rows.find((r) => r.id === id);
    if (!row) throw new Error(`unknown matrix row ${id}`);
    row.result = result;
    if (detail !== undefined) row.detail = detail;
  }

  get failures(): MatrixRow[] {
    return this.rows.filter((r) => r.result === "FAIL");
  }

  get skips(): MatrixRow[] {
    return this.rows.filter((r) => r.result === "SKIP");
  }

  markdown(): string {
    const lines: string[] = [];
    lines.push("# M03-T09 fault matrix — run results");
    lines.push("");
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push("");
    lines.push("Global invariants under test: " + MATRIX_INVARIANTS.join("; ") + ".");
    lines.push("");
    lines.push("| # | Scenario | Boundary | Engine | Invariant | Deterministic recovery | Result | Evidence |");
    lines.push("|---|----------|----------|--------|-----------|------------------------|--------|----------|");
    for (const r of this.rows) {
      lines.push(
        `| ${r.id} | ${r.scenario} | ${r.boundary} | ${r.engine} | ${r.invariant} | ${r.recovery} | ${r.result}${r.detail ? ` (${r.detail})` : ""} | ${r.evidence} |`,
      );
    }
    lines.push("");
    lines.push(`Totals: ${this.rows.filter((r) => r.result === "PASS").length} PASS, ${this.skips.length} SKIP, ${this.failures.length} FAIL.`);
    if (this.skips.length > 0) {
      lines.push("");
      lines.push("SKIP semantics: disposable PostgreSQL was unreachable on this host — the CI run (services: postgres:16) provides that engine's evidence. No mock substitutes for either engine anywhere in this matrix.");
    }
    return lines.join("\n");
  }
}
