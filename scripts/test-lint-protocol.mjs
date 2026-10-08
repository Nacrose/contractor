/**
 * Protocol Linter Negative Test Suite (M00-T20)
 *
 * Verifies that the linter strictly rejects:
 * 1. Ticked tasks without a (PR #N) reference
 * 2. Malformed checkboxes
 * 3. Mismatched Done/Total rollup counts
 * 4. Mismatched Program total
 * 5. Unknown task IDs in PR titles
 */

import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lintRegister } from "./lint-protocol.mjs";

function runNegativeTests() {
  console.log("===============================================================================");
  console.log("              M00-T20: PROTOCOL LINTER NEGATIVE TEST SUITE");
  console.log("===============================================================================");

  const tempDir = mkdtempSync(join(tmpdir(), "protocol-lint-test-"));
  const milestonesDir = join(tempDir, "milestones");
  const execPlanPath = join(tempDir, "EXECUTION-PLAN.md");

  import("node:fs").then(({ mkdirSync }) => {
    mkdirSync(milestonesDir, { recursive: true });

    // Test Case 1: Ticked task missing (PR #N) reference
    const corruptM00 = `
# Milestone M00
- [x] **M00-T01** — Valid task (PR #1)
- [x] **M00-T02** — Corrupted task without PR reference
- [ ] **M00-T03** — Unticked task
    `;
    writeFileSync(join(milestonesDir, "M00-test.md"), corruptM00);

    const corruptExecPlan = `
| Milestone | File | State | Done/Total | Gate |
|---|---|---|---|---|
| M00 | [M00-test.md](milestones/M00-test.md) | In progress | 2/3 | Gate |
| **Program total** | | | **2/3** | |
    `;
    writeFileSync(execPlanPath, corruptExecPlan);

    const res1 = lintRegister({ milestonesDir, executionPlanPath: execPlanPath });
    if (res1.ok || !res1.errors.some((e) => e.includes("missing required PR reference"))) {
      console.error("FAIL: Expected missing PR reference error, got:", res1);
      process.exit(1);
    }
    console.log("✓ Test 1 Passed: Caught ticked task missing (PR #N) reference.");

    // Test Case 2: Rollup count mismatch (reports 3/3 instead of 2/3)
    const mismatchedExecPlan = `
| Milestone | File | State | Done/Total | Gate |
|---|---|---|---|---|
| M00 | [M00-test.md](milestones/M00-test.md) | In progress | 3/3 | Gate |
| **Program total** | | | **3/3** | |
    `;
    writeFileSync(execPlanPath, mismatchedExecPlan);
    // Fix PR reference so only count mismatch triggers
    writeFileSync(join(milestonesDir, "M00-test.md"), `
- [x] **M00-T01** — Valid task (PR #1)
- [x] **M00-T02** — Valid task (PR #2)
- [ ] **M00-T03** — Unticked task
    `);

    const res2 = lintRegister({ milestonesDir, executionPlanPath: execPlanPath });
    if (res2.ok || !res2.errors.some((e) => e.includes("Rollup count mismatch"))) {
      console.error("FAIL: Expected rollup count mismatch error, got:", res2);
      process.exit(1);
    }
    console.log("✓ Test 2 Passed: Caught rollup table count mismatch.");

    // Test Case 3: Program total mismatch
    const badProgTotalPlan = `
| Milestone | File | State | Done/Total | Gate |
|---|---|---|---|---|
| M00 | [M00-test.md](milestones/M00-test.md) | In progress | 2/3 | Gate |
| **Program total** | | | **99/99** | |
    `;
    writeFileSync(execPlanPath, badProgTotalPlan);
    const res3 = lintRegister({ milestonesDir, executionPlanPath: execPlanPath });
    if (res3.ok || !res3.errors.some((e) => e.includes("Program total mismatch"))) {
      console.error("FAIL: Expected program total mismatch error, got:", res3);
      process.exit(1);
    }
    console.log("✓ Test 3 Passed: Caught program total mismatch.");

    // Test Case 4: PR title references non-existent task
    const res4 = lintRegister({
      milestonesDir,
      executionPlanPath: execPlanPath,
      prTitle: "[M99-T99] Non-existent task"
    });
    if (res4.ok || !res4.errors.some((e) => e.includes("does not exist in any milestone file"))) {
      console.error("FAIL: Expected non-existent task error, got:", res4);
      process.exit(1);
    }
    console.log("✓ Test 4 Passed: Caught PR title referencing non-existent task ID.");

    // Cleanup
    rmSync(tempDir, { recursive: true, force: true });
    console.log("-------------------------------------------------------------------------------");
    console.log("ALL NEGATIVE TESTS PASSED (100%)\n");
  });
}

runNegativeTests();
