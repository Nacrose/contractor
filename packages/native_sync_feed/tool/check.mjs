#!/usr/bin/env node
/**
 * Check runner for the change feed package (M03-T04).
 * Compiles with the pinned TypeScript compiler and executes the node:test
 * suite against REAL SQLite via node:sqlite (server feed db + client
 * consumer db as separate on-disk databases).
 *
 * Runtime requirement: node:sqlite needs Node >= 22.5 (unflagged >= 23.4).
 * CI runs this check on Node 24 via a dedicated setup-node step.
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
  console.error(`native_sync_feed: node:sqlite requires Node >= 23 (unflagged); found ${process.versions.node}`);
  process.exit(1);
}

run("npx", ["-y", `-p`, `typescript@${TSC_VERSION}`, "tsc", "--project", "tsconfig.json"]);
run("node", [resolve(PKG, ".test-build/test/feed.test.js")]);
console.log("native_sync_feed: change feed tests PASSED (real SQLite)");
