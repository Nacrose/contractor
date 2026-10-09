#!/usr/bin/env node
/**
 * Check runner for the fault matrix (M03-T09).
 * Compiles with the pinned TypeScript compiler, runs the matrix against
 * REAL SQLite (node:sqlite) always, and against DISPOSABLE PostgreSQL
 * when reachable (CI services: postgres:16 + pinned pg client via
 * NODE_PATH). Emits the reproducible markdown matrix report.
 */
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TSC_VERSION = "5.9.3";

function run(cmd, args, opts = {}) {
  execFileSync(cmd, args, { stdio: "inherit", cwd: PKG, ...opts });
}

const major = Number(process.versions.node.split(".")[0]);
if (major < 23) {
  console.error(`native_faultmatrix: node:sqlite requires Node >= 23 (unflagged); found ${process.versions.node}`);
  process.exit(1);
}

run("npx", ["-y", `-p`, `typescript@${TSC_VERSION}`, "tsc", "--project", "tsconfig.json"]);
// Hard wall-clock: a wedged leg fails the check instead of hanging CI.
run("node", [resolve(PKG, ".test-build/test/matrix.test.js")], { timeout: 300_000, killSignal: "SIGKILL" });
const pgLegs = process.env.DATABASE_URL ? "PostgreSQL legs live" : "PostgreSQL legs SKIPped (engine unreachable on this host; CI service run provides them)";
console.log(`native_faultmatrix: fault matrix PASSED (real SQLite legs live; ${pgLegs})`);
