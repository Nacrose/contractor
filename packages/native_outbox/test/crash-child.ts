/**
 * Crash-recovery child process (M03-T03 tests).
 *
 * Spawned by outbox.test.ts with [dbPath, mode, opId]:
 *   - mode `midtx`: opens the repository, starts a save whose domain
 *     callback prints READY and then blocks — the parent SIGKILLs the child
 *     while the transaction is open, proving rollback on next open.
 *   - mode `ack`: completes the save (prints ACKED only AFTER commit
 *     returns) and idles — the parent SIGKILLs afterwards, proving that an
 *     acknowledged save survives termination.
 */

import { DatabaseSync } from "node:sqlite";
import { writeSync } from "node:fs";
import { openOutbox } from "../src/repository.js";
import { DAILY_LOG_MIGRATION } from "./fixtures.js";

const encoder = new TextEncoder();
function signal(line: string): void {
  writeSync(1, encoder.encode(`${line}\n`));
}

function sleepMs(ms: number): void {
  const sab = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(sab), 0, 0, ms);
}

const [, , dbPath, mode, opId] = process.argv;
if (!dbPath || !mode || !opId) {
  process.exit(2);
}

const db = new DatabaseSync(dbPath);
const { repository } = openOutbox(db, { extraMigrations: [DAILY_LOG_MIGRATION], busyTimeoutMs: 2_000 });

if (mode === "midtx") {
  try {
    repository.saveMutation({
      accountId: "A",
      op: { opId, kind: "fieldSubmission.submit", payload: JSON.stringify({ note: "crash-midtx" }) },
      domain: (tx) => {
        tx.prepare(`INSERT INTO daily_log (id, account_id, project_id, note, created_at) VALUES (?, 'A', NULL, ?, ?)`).run(
          `log-${opId}`,
          "written before the crash; must roll back",
          Date.now(),
        );
        signal("READY");
        sleepMs(60_000); // parent SIGKILLs here — transaction still open
      },
    });
    signal("UNEXPECTED_COMMIT");
  } catch {
    signal("SAVE_FAILED_AFTER_SIGNAL");
  }
  process.exit(0);
}

if (mode === "ack") {
  repository.saveMutation({
    accountId: "A",
    op: { opId, kind: "fieldSubmission.submit", payload: JSON.stringify({ note: "acked-before-kill" }) },
    domain: (tx) => {
      tx.prepare(`INSERT INTO daily_log (id, account_id, project_id, note, created_at) VALUES (?, 'A', NULL, ?, ?)`).run(
        `log-${opId}`,
        "committed before ACKED",
        Date.now(),
      );
    },
  });
  signal("ACKED"); // printed only after COMMIT returned
  sleepMs(60_000); // parent SIGKILLs here — commit already durable
  process.exit(0);
}

process.exit(2);
