/**
 * Crash-recovery child process (M03-T04 tests).
 *
 * Spawned by feed.test.ts with [clientDbPath, mode, pageJson]:
 *   - mode `midapply`: opens the consumer with a blocking daily-report
 *     applier that prints READY and then blocks INSIDE the single apply
 *     transaction — the parent SIGKILLs the child while the transaction is
 *     open, proving that entity applies, dedup rows and the checkpoint roll
 *     back together (no cursor ahead of applied data).
 *   - mode `postapply`: completes applyBatch (prints APPLIED only AFTER the
 *     commit returned) and idles — the parent SIGKILLs afterwards, proving
 *     that an applied batch survives termination and that re-delivery of
 *     the same page is a dedup no-op (the lost-ack scenario).
 */

import { DatabaseSync } from "node:sqlite";
import { writeSync } from "node:fs";
import { openFeedConsumer } from "../src/consumer.js";
import { PILOT_APPLIERS, PILOT_DOMAIN_MIGRATION } from "./fixtures.js";
import type { EntityApplier, PullPage } from "../src/contract.js";

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

const page = JSON.parse(pageJson) as PullPage;
const db = new DatabaseSync(dbPath);

if (mode === "midapply") {
  const blockingDailyReport: EntityApplier = (drv, event) => {
    PILOT_APPLIERS["daily-report"](drv, event); // entity insert inside the open transaction
    signal("READY");
    sleepMs(60_000); // parent SIGKILLs here — apply transaction still open
  };
  const { consumer } = openFeedConsumer(db, {
    extraMigrations: [PILOT_DOMAIN_MIGRATION],
    appliers: { ...PILOT_APPLIERS, "daily-report": blockingDailyReport },
    busyTimeoutMs: 2_000,
  });
  try {
    consumer.applyBatch(page, "A");
    signal("UNEXPECTED_COMMIT");
  } catch {
    signal("APPLY_FAILED_AFTER_SIGNAL");
  }
  process.exit(0);
}

if (mode === "postapply") {
  const { consumer } = openFeedConsumer(db, {
    extraMigrations: [PILOT_DOMAIN_MIGRATION],
    appliers: PILOT_APPLIERS,
    busyTimeoutMs: 2_000,
  });
  consumer.applyBatch(page, "A");
  signal("APPLIED"); // printed only after COMMIT returned
  sleepMs(60_000); // parent SIGKILLs here — applied batch already durable
  process.exit(0);
}

process.exit(2);
