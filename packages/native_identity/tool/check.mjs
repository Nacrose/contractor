#!/usr/bin/env node
/**
 * Check runner for the native identity contract package (M03-T02).
 * Compiles with the pinned TypeScript compiler (no node_modules install
 * required in CI) and executes the node:test suite.
 */
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TSC_VERSION = "5.9.3"; // pinned to match packages/platform_contracts

function run(cmd, args, opts = {}) {
  execFileSync(cmd, args, { stdio: "inherit", cwd: PKG, ...opts });
}

run("npx", ["-y", `-p`, `typescript@${TSC_VERSION}`, "tsc", "--project", "tsconfig.json"]);
run("node", [resolve(PKG, ".test-build/test/identity.test.js")]);
console.log("native_identity: contract tests PASSED");
