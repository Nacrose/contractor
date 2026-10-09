#!/usr/bin/env node
/**
 * Check runner for the observability package (M03-T08).
 * Compiles with the pinned TypeScript compiler and executes the node:test
 * suite against REAL SQLite (node:sqlite) for the device health read model.
 */
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TSC_VERSION = "5.9.3"; // pinned to match the other contract packages

function run(cmd, args, opts = {}) {
  execFileSync(cmd, args, { stdio: "inherit", cwd: PKG, ...opts });
}

const major = Number(process.versions.node.split(".")[0]);
if (major < 23) {
  console.error(`native_observability: node:sqlite requires Node >= 23 (unflagged); found ${process.versions.node}`);
  process.exit(1);
}

run("npx", ["-y", `-p`, `typescript@${TSC_VERSION}`, "tsc", "--project", "tsconfig.json"]);
run("node", [resolve(PKG, ".test-build/test/observability.test.js")]);
console.log("native_observability: observability tests PASSED (real SQLite health read model)");
