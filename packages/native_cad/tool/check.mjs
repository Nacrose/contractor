#!/usr/bin/env node
/**
 * Check runner for native_cad (M07-T02).
 * Compiles with pinned TypeScript and executes the test suite.
 */
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync } from "node:fs";

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TSC_VERSION = "5.9.3";

function run(cmd, args, opts = {}) {
  execFileSync(cmd, args, { stdio: "inherit", cwd: PKG, ...opts });
}

run("npx", ["-y", "-p", `typescript@${TSC_VERSION}`, "tsc", "--project", "tsconfig.json"]);

const testDir = resolve(PKG, ".test-build/test");
const testFiles = readdirSync(testDir).filter((f) => f.endsWith(".test.js"));

for (const testFile of testFiles) {
  run("node", [resolve(testDir, testFile)]);
}

console.log("native_cad: all CAD command registry, input state, topology, and spatial batch tests PASSED (M07-T02/T03/T04)");
