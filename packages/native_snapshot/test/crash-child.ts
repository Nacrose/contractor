/**
 * Crash-recovery child process (M03-T05 tests).
 *
 * Spawned by snapshot.test.ts with [clientDbPath, serverDbPath, mode, pageJson]:
 *   - mode `midapply`: opens the applier with a blocking daily-report
 *     applier that applies the FIRST row, prints READY and then blocks
 *     INSIDE the single apply transaction — the parent SIGKILLs the child
 *     while the transaction is open, proving that entity applies, the page
 *     dedup row and the cursor advance roll back together (the cursor can
 *     never advance ahead of applied data).
 *   - mode `postapply`: completes applyPage (prints APPLIED only AFTER the
 *     commit returned) and idles — the parent SIGKILLs afterwards, proving
 *     an applied page survives termination and that re-delivery of the same
 *     page is a dedup no-op (the lost-ack scenario).
 */

import { DatabaseSync } from "node:sqlite";
import { writeSync } from "node:fs";
import { openSnapshotApplier } from "../src/client.js";
import { PILOT_APPLIERS, PILOT_DOMAIN_MIGRATION } from "./fixtures.js";
import type { SnapshotEntityApplier, SnapshotPage } from "../src/contract.js";

const encoder = new TextEncoder();
function signal(line: string): void {
  writeSync(1, encoder.encode(`${line}\n`));
}

function sleepMs(ms: number): void {
  const sab = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(sab), 0, 0, ms);
}

const [, , dbPath, mode, pageJson] = process.argv;
if (!dbPath || !mode || !pageJson) {
  process.exit(2);
}

const page = JSON.parse(pageJson) as SnapshotPage;
const db = new DatabaseSync(dbPath);

if (mode === "midapply") {
  const blockingDailyReport: SnapshotEntityApplier = {
    ...PILOT_APPLIERS["daily-report"],
    upsert: (drv, domain, entityId, payload) => {
      PILOT_APPLIERS["daily-report"].upsert(drv, domain, entityId, payload); // entity insert inside the open transaction
      signal("READY");
      sleepMs(60_000); // parent SIGKILLs here — apply transaction still open
    },
  };
  const { applier } = openSnapshotApplier(db, {
    extraMigrations: [PILOT_DOMAIN_MIGRATION],
    appliers: { ...PILOT_APPLIERS, "daily-report": blockingDailyReport },
    busyTimeoutMs: 2_000,
  });
  try {
    applier.applyPage(page, "A", "t1:all");
    signal("UNEXPECTED_COMMIT");
  } catch {
    signal("APPLY_FAILED_AFTER_SIGNAL");
  }
  process.exit(0);
}

if (mode === "postapply") {
  const { applier } = openSnapshotApplier(db, {
    extraMigrations: [PILOT_DOMAIN_MIGRATION],
    appliers: PILOT_APPLIERS,
    busyTimeoutMs: 2_000,
  });
  applier.applyPage(page, "A", "t1:all");
  signal("APPLIED"); // printed only after COMMIT returned
  sleepMs(60_000); // parent SIGKILLs here — applied page already durable
  process.exit(0);
}

process.exit(2);
