#!/usr/bin/env node
/**
 * Check runner for the attachment transfer package (M03-T06).
 * Compiles with the pinned TypeScript compiler and executes the node:test
 * suite against REAL SQLite (node:sqlite), a REAL on-disk object store,
 * and a DISPOSABLE server/object fixture (real SQLite + real directory).
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
  console.error(`native_attachment: node:sqlite requires Node >= 23 (unflagged); found ${process.versions.node}`);
  process.exit(1);
}

run("npx", ["-y", `-p`, `typescript@${TSC_VERSION}`, "tsc", "--project", "tsconfig.json"]);
run("node", [resolve(PKG, ".test-build/test/attachment.test.js")]);
console.log("native_attachment: attachment transfer tests PASSED (real storage + real SQLite + disposable fixture)");
