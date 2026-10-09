# M03-T04: Authorized Change Feed for the Pilot Domain — Evidence Report

- **Task**: `M03-T04` — Implement the selected authorized change feed for the pilot domain (PR #35)
- **Depends on**: M00 change-feed decision record (ratified), M03-T01 (PR #32), M03-T03 (PR #34) — all satisfied
- **Status**: Complete · 23/23 node:test cases green locally (3/3 consecutive runs) and in CI against real SQLite (`node:sqlite`, Node 24)

---

## 1. The Ratified Mechanism and This Task's Scope

The mechanism is NOT selected here. It was empirically selected in M00 and ratified by the owner in
[ADR-0011](../../adr/0011-change-feed-mechanism.md) / [spike-decision.md](spike-decision.md): the
**Server-Mediated Hybrid Change-Feed** — commit-order capture, tenant partitioning with pre-fanout
redaction, edge pull over standard HTTP/tRPC with monotonic cursors, durable client checkpoints with
idempotent dedup, and a slot-retention circuit breaker on the CDC daemon. M03-T04 implements those
ratified semantics as the contract package `@contractor/native-sync-feed`
(`packages/native_sync_feed`), on the same zero-dependency structural-port pattern as
`native_outbox` (M03-T03): the prototype binds `node:sqlite` directly; app mounts bind their native
drivers without changing this code.

## 2. The Pilot Domain, Explicitly Named

**Pilot domain: the daily report / field submission domain** — `DailyReport` and its sub-tables,
`FieldSubmission`, and their routers/services. Rationale: it is the substrate of the M04 first
vertical workflow ("daily log + photo"), it is the highest-traffic offline field workflow in the
client local-stores inventory, and its writer set spans both a router family and a reconciliation
service, which exercises the full audited-writer obligation.

## 3. Audited Pilot-Domain Writer List (M00 inventories)

Migrated (each emits its sync-visible change atomically with its authoritative mutation, pinned by
the `pilot audit` test — success emits exactly one event; a forced domain failure rolls back BOTH
sides):

| Writer | Inventory source | Emits |
|---|---|---|
| `router:fieldSubmission.submitFieldReport` | inventory-routers.md `field-submission.ts` | `field-submission/field_submission` |
| `router:fieldPhotos.create` | inventory-routers.md `field-photos.ts` | `field-submission/field_submission` (attachment BYTES are M03-T06) |
| `router:dailyReport.create` | inventory-routers.md `daily-report.ts` | `daily-report/daily_report` |
| `router:dailyReport.update` | inventory-routers.md `daily-report.ts` | `daily-report/daily_report` |
| `router:dailyReportAttachments.attach` | inventory-routers.md `daily-report-attachments.ts` | `daily-report/daily_report` |
| `service:daily-report-sync` | inventory-jobs-imports.md (reconciliation service) | `daily-report/daily_report` |

Intentionally excluded (recorded per the acceptance requirement, full reasons in
`test/fixtures.ts`): `daily-report-access.ts` (0 mutations, read-only legacy router),
`job:session.cleanup` (identity-domain retention bookkeeping, client-invisible),
`job:outbox.dispatch` (notification delivery state, not domain state). **Coverage: every writer of
the pilot domain in the M00 router/job/import inventories is either migrated in this release or
explicitly excluded above — none are silent.**

## 4. Commit-Safe Ordering (Late and Concurrent Commits)

The prototype proves the ordering property ADR-0011 buys with commit-LSN on PostgreSQL:

- **Commit-time position allocation**: `publishAtomically` allocates the seq inside the same
  serialized `BEGIN IMMEDIATE` transaction as the domain write; the row becomes visible to other
  connections only at COMMIT. A late commit therefore always lands with a HIGHER seq than anything
  committed earlier — the pinned pair of tests demonstrate (a) uncommitted changes are invisible to
  pull and a late commit is delivered after the consumer's cursor without a skip, and (b) a writer
  that loses the BEGIN IMMEDIATE race gets a typed `busy` and, on retry, commits with a higher seq
  than the winner. Inversion is structurally impossible, matching the ADR's "gap loss is
  mathematically impossible" (production keeps the identical guarantee via the slot's commit-LSN).
- **Cursor advancement cannot skip a late transaction**: cursors advance only over DELIVERED
  events; permission-filtered events never advance the cursor (no-skip rule, pinned), so a
  re-granted scope receives withheld changes rather than silently skipping them.
- **Positions are never reused**: `feed_event.seq` is `AUTOINCREMENT`; the retention test proves a
  compacted seq is never reallocated, which is what makes stale-cursor detection sound.

## 5. Authorization and Redaction

- **Tenant partitioning is structural** (WHERE clause per pull); the cross-tenant test proves a
  foreign tenant's pull returns nothing.
- **Project authorization is a port** (`FeedReadScope.canReadProject`) so the app mount supplies
  the SAME permission logic its interactive reads use (v3 §4: the feed adds no permission logic of
  its own). The revoked-access test pins: revoked projects stop flowing immediately, re-granted
  projects resume with the withheld changes intact.
- **Redaction is schema-driven and fail-closed** (ADR-0011 contract 3): a
  `(domain, schemaVersion)` policy MUST be registered before any publish; payloads are sanitized
  BEFORE persistence (PAN/bank fields stripped, contact fields masked — verified against the STORED
  row, not just the delivered envelope). Publishing without a policy rolls back the whole
  transaction including the domain write — nothing leaks by default.

## 6. Durable Consumer Checkpoints and Idempotent Replay (ADR-0011 contract 4)

`sync_checkpoint` ~ `_sync_checkpoint`; `sync_inbox_dedup` ~ `_sync_inbox_dedup`. `applyBatch`
applies entity mutations (injected `EntityApplier` port — the only domain writer), dedup
bookkeeping, and the checkpoint advance inside ONE transaction. Pinned evidence:

- duplicate page delivery and lost-ack redelivery apply nothing twice;
- checkpoint loss (`resetCheckpoint`, dedup rows kept) re-pulls from 0 with zero double effects;
- SIGKILL mid-apply rolls back entity + dedup + checkpoint together (no cursor ahead of applied
  data) and the same page redelivers cleanly on a fresh connection;
- SIGKILL after apply survives and redelivery is a pure dedup no-op;
- replaying an OLD page cannot move the checkpoint backwards (MAX guard);
- a page containing an unregistered domain fails closed — no partial application;
- delete events replay safely: a stale upsert cannot resurrect a deleted row (per-event dedup
  keys; full tombstone/scope-change semantics are M03-T05).

## 7. Command Receipts: Financial Retention Beyond the 30-Day Default, with Compaction

Plan v3 §6 M03 requires financially effective commands to retain durable receipts beyond the 30-day
default WITH compaction rather than expiry-driven replay risk. Implemented and pinned:

- Receipts are recorded ONLY from server outcomes (`recordCommandReceipt` — the native_outbox
  authority rule); rejected outcomes never block retries.
- Non-financial receipts expire with the configurable default (30 days).
- Financial receipts are NEVER expiry-deleted. After `compactFinancialAfterDays` they compact in
  place: payload digest dropped, outcome digest and opId kept.
- The replay gate stays fail-closed after compaction: a full receipt blocks on payload-digest
  match; a compacted receipt blocks on opId presence alone — compaction trades precision for
  storage, it cannot open a replay path.

## 8. Operational Behavior, Rollback Runbook, Monitoring Hooks

Per the ratified record: retention sweeps advance a watermark; a consumer presenting a cursor
below the floor receives a typed `resync_required` (the ADR's "410 Gone" analogue) and must
rebootstrap — it never silently skips a compacted range (pinned). Bounds (`maxEvents`/
`maxBytes`, serialized-byte accounting) keep every pull incrementally bounded and deterministic;
a single oversized event is delivered alone rather than starving.

**Rollback runbook (feed side, prototype obligations; the CDC/slot runbook lives with the daemon
deployment):**
1. **Stop fanout** — disable feed publishing at the adapter boundary (M03-T01 versioned adapter);
   domain writes continue (they are authoritative), writers fail loud, no partial events exist by
   construction.
2. **Freeze cursors** — consumers keep working offline (M03-T03 pending ops accumulate locally);
   the last confirmed checkpoint is durable on every device.
3. **Drop or rebuild the feed** — truncating `feed_event` + resetting `feed_watermark` is safe;
   every consumer's next pull then returns `resync_required`.
4. **Rebootstrap** — clients reconcile via the M03-T05 snapshot bootstrap (which preserves and
   reconciles pending local work instead of discarding it).
5. **Verify** — the receipt/dedup tables make replay of already-applied effects impossible during
   the transition (pinned by the replay-protection tests).

Monitoring hooks follow ADR-0011 §2 contract 6 and are wired at the M03 observability task
(cursor/floor distance per tenant is `retentionFloor()` vs max seq; pull page sizes and
`resync_required` events are the client-lag signal).

## 9. Flutter Consumer and Parity Path

The feed is consumed by the **M04 first vertical workflow (daily log + photo) Flutter repository** —
the client-side apply path lands with that vertical's repository task; its task id is assigned at
the M04 R9 refinement (due before M03-W10 merges, per the M04 milestone file). The apply-side
contract it must implement is exactly `EntityApplier` + `FeedConsumer` above; parity evidence
follows the M02 `platform_contracts` generation pattern.

## 10. Test Evidence and CI Wiring

- `packages/native_sync_feed/test/feed.test.ts` — 23 node:test cases, real on-disk SQLite, two
  separate databases (server feed db, client consumer db) with JSON round-trip as the transport
  boundary; SIGKILL child-process scenarios in `test/crash-child.ts`.
- CI: `Run Native Sync Feed Tests` step (Node 24, after the outbox step) in `client-ci.yml`.
- Engine notes carried from M03-T03: WAL + `synchronous=FULL`, extended-code masking, and the
  documented divergence — `withImmediateTransaction` in this package maps BEGIN/COMMIT failures
  too, so BEGIN contention surfaces as a typed `busy` error.

## 11. Non-Goals

Snapshot bootstrap, cursor expiry, and tombstone/scope-change semantics are M03-T05; attachment
byte transfer is M03-T06; the sync envelope and orchestration policy are M03-T07; the disposable
PostgreSQL fault matrix is M03-T09. The CDC daemon itself (pgoutput slot, watchdog) is a deployment
concern of the ratified record — this package fixes the feed CONTRACT those components must honor.
