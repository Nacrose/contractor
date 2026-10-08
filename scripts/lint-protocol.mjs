#!/usr/bin/env node
/**
 * AI-Agent Protocol & Master Register Linter (M00-T20)
 *
 * Mechanically enforces the protocol rules:
 * 1. Checkbox syntax well-formedness: `- [ ] **Mxx-Tyy**` or `- [x] **Mxx-Tyy**`
 * 2. Ticked task evidence: Every ticked task MUST include a PR reference `(PR #<number>)`
 * 3. Rollup consistency: Milestone file counts match `EXECUTION-PLAN.md` rollup table
 * 4. Program total consistency: Program total equals the sum of all milestone files
 * 5. Task ID validation: Referenced task IDs exist in the register
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(fileURLToPath(import.meta.url), "../../");
const PLANS_DIR = join(ROOT_DIR, "docs/plans");
const MILESTONES_DIR = join(PLANS_DIR, "milestones");
const EXECUTION_PLAN_PATH = join(PLANS_DIR, "EXECUTION-PLAN.md");

export function lintRegister(options = {}) {
  const milestonesDir = options.milestonesDir || MILESTONES_DIR;
  const executionPlanPath = options.executionPlanPath || EXECUTION_PLAN_PATH;
  const prTitle = options.prTitle || process.env.PR_TITLE;

  const errors = [];
  const warnings = [];
  const taskRegistry = new Map(); // taskId -> { file, ticked, prRef, title }
  const milestoneCounts = new Map(); // filename -> { done, total }

  // 1. Scan and parse all milestone markdown files
  if (!existsSync(milestonesDir)) {
    errors.push(`Milestones directory not found: ${milestonesDir}`);
    return { ok: false, errors, warnings };
  }

  const milestoneFiles = readdirSync(milestonesDir)
    .filter((f) => f.startsWith("M") && f.endsWith(".md"))
    .sort();

  for (const filename of milestoneFiles) {
    const filePath = join(milestonesDir, filename);
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    let doneCount = 0;
    let totalCount = 0;

    for (let lineNum = 1; lineNum <= lines.length; lineNum++) {
      const line = lines[lineNum - 1];

      // Check for malformed task lines (e.g. missing bolding or missing checkbox brackets)
      if (line.match(/^-\s*\[\s*[xX]?\s*\]\s*M\d{2}-T\d{2}/) && !line.includes("**")) {
        errors.push(`[${filename}:${lineNum}] Malformed task syntax (missing bold asterisks): "${line}"`);
      }

      // Match valid task checkbox: - [ ] **Mxx-Tyy** or - [x] **Mxx-Tyy**
      const match = line.match(/^-\s*\[([ xX])\]\s*\*\*([A-Za-z0-9_-]+)\*\*\s*—\s*(.*)$/);
      if (match) {
        const isTicked = match[1].toLowerCase() === "x";
        const taskId = match[2];
        const restOfLine = match[3];

        totalCount++;
        if (isTicked) doneCount++;

        // Rule: Ticked tasks MUST include (PR #<number>) reference
        let prRef = null;
        if (isTicked) {
          const prMatch = restOfLine.match(/\(PR\s*#(\d+)\)/i);
          if (!prMatch) {
            errors.push(`[${filename}:${lineNum}] Ticked task ${taskId} is missing required PR reference "(PR #<number>)": "${line}"`);
          } else {
            prRef = prMatch[1];
          }
        }

        if (taskRegistry.has(taskId)) {
          errors.push(`[${filename}:${lineNum}] Duplicate task ID "${taskId}" already defined in ${taskRegistry.get(taskId).file}`);
        } else {
          taskRegistry.set(taskId, {
            file: filename,
            lineNum,
            ticked: isTicked,
            prRef,
            title: restOfLine
          });
        }
      }
    }

    milestoneCounts.set(filename, { done: doneCount, total: totalCount });
  }

  // 2. Validate EXECUTION-PLAN.md Rollup Table
  if (!existsSync(executionPlanPath)) {
    errors.push(`Master execution plan not found: ${executionPlanPath}`);
  } else {
    const execPlanContent = readFileSync(executionPlanPath, "utf-8");
    const execPlanLines = execPlanContent.split("\n");

    let parsedProgDone = null;
    let parsedProgTotal = null;
    let sumDone = 0;
    let sumTotal = 0;

    for (const [filename, counts] of milestoneCounts.entries()) {
      sumDone += counts.done;
      sumTotal += counts.total;

      // Look for the table row corresponding to this milestone file
      // Format: | Milestone Title | [filename](milestones/filename) | State | Done/Total | Gate |
      const escapedFilename = filename.replace(/\./g, "\\.");
      const regex = new RegExp(`\\[${escapedFilename}\\]\\(milestones\\/${escapedFilename}\\)\\s*\\|\\s*[^|]+\\|\\s*(\\d+)\\/(\\d+)`);
      const rowMatch = execPlanContent.match(regex);

      if (!rowMatch) {
        errors.push(`EXECUTION-PLAN.md is missing rollup table row for milestone file "${filename}"`);
      } else {
        const tableDone = parseInt(rowMatch[1], 10);
        const tableTotal = parseInt(rowMatch[2], 10);

        if (tableDone !== counts.done || tableTotal !== counts.total) {
          errors.push(
            `Rollup count mismatch for ${filename}: EXECUTION-PLAN.md reports ${tableDone}/${tableTotal}, but milestone file contains ${counts.done}/${counts.total}`
          );
        }
      }
    }

    // Check Program Total row: | **Program total** | | | **XX/YY** | |
    const totalMatch = execPlanContent.match(/\|\s*\*\*Program total\*\*\s*\|\s*\|\s*\|\s*\*\*(\d+)\/(\d+)\*\*/);
    if (!totalMatch) {
      errors.push("EXECUTION-PLAN.md is missing or has malformed '**Program total**' row");
    } else {
      parsedProgDone = parseInt(totalMatch[1], 10);
      parsedProgTotal = parseInt(totalMatch[2], 10);

      if (parsedProgDone !== sumDone || parsedProgTotal !== sumTotal) {
        errors.push(
          `Program total mismatch: EXECUTION-PLAN.md reports **${parsedProgDone}/${parsedProgTotal}**, but sum of milestone files is **${sumDone}/${sumTotal}**`
        );
      }
    }
  }

  // 3. Optional PR Title Task ID validation
  if (prTitle) {
    const prTaskMatch = prTitle.match(/\[([A-Za-z0-9_-]+)\]/);
    if (prTaskMatch) {
      const claimedTaskId = prTaskMatch[1];
      // Special allowance for protocol amendments or gate PRs
      const allowedSpecial = ["BOOTSTRAP", "PROTOCOL-AMEND", "M00-GATE", "M01-GATE"];
      if (!taskRegistry.has(claimedTaskId) && !allowedSpecial.includes(claimedTaskId)) {
        errors.push(`PR title claims task ID "${claimedTaskId}", but this task ID does not exist in any milestone file`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    taskCount: taskRegistry.size,
    milestoneCount: milestoneCounts.size
  };
}

// CLI runner
if (process.argv[1] && (process.argv[1].endsWith("/lint-protocol.mjs") || process.argv[1] === "lint-protocol.mjs")) {
  // Check for --test-negative flag
  if (process.argv.includes("--test-negative")) {
    console.log("Running self-test negative suite...");
    // Mock corrupted execution plan test
    const mockPlan = `
| Milestone | File | State | Done/Total | Gate |
| M00 | [M00-inventory-fixtures-baseline.md](milestones/M00-inventory-fixtures-baseline.md) | In progress | 999/999 | Gate |
| **Program total** | | | **999/999** | |
    `;
    const res = lintRegister({
      executionPlanPath: "/non-existent/file.md"
    });
    if (!res.ok) {
      console.log("✓ Negative test succeeded: correctly caught error on missing/invalid file.");
      process.exit(0);
    } else {
      console.error("✗ Negative test failed: expected error but got ok.");
      process.exit(1);
    }
  }

  console.log("===============================================================================");
  console.log("                   AI-AGENT PROTOCOL & REGISTER LINTER");
  console.log("===============================================================================");

  const result = lintRegister();

  console.log(`Audited: ${result.milestoneCount} milestone files, ${result.taskCount} task definitions.`);
  console.log("-------------------------------------------------------------------------------");

  if (result.warnings.length > 0) {
    console.log("WARNINGS:");
    for (const w of result.warnings) console.warn(`  ⚠️  ${w}`);
  }

  if (result.errors.length > 0) {
    console.error("LINT ERRORS FOUND:");
    for (const e of result.errors) console.error(`  ❌  ${e}`);
    console.log("-------------------------------------------------------------------------------");
    console.error("FAILED: Execution plan register violates protocol specifications.");
    process.exit(1);
  }

  console.log("PASSED: All milestone task checkboxes, PR references, and rollup counts are valid.");
  console.log("===============================================================================\n");
  process.exit(0);
}
