#!/usr/bin/env node
/** Create PR #36 for M03-T05 (snapshot bootstrap, cursor persistence, tombstones). */
const https = require("https");

const BODY = `## Task
Closes the **M03-T05** register item: add snapshot bootstrap, cursor persistence, and tombstones. One task → one PR → one checkbox.

**Output (register):** consistent snapshot materialization, cursor persistence, tombstone semantics, and manifest-closure reconcile for the sync engine.

## What lands
- **\`packages/native_snapshot/\`** — new zero-dep TS contract package \`@contractor/native-snapshot\`, mirroring the T03/T04 two-sides-one-package pattern:
  - **Server \`SnapshotService\`**: \`openSnapshot\` materializes rows + scope tombstones + feed watermark inside ONE \`BEGIN IMMEDIATE\` transaction — pages are byte-for-byte deterministic afterwards (concurrent-write immunity tested). Byte-bounded pagination (default 256 KiB) with the feed's no-starvation rule (oversized row delivered alone); \`maxObjects\` bound and mid-open source failure roll back transactionally (typed \`misconfigured\`).
  - **Client \`SnapshotApplier\`**: \`applyPage\` covers entity applies, page dedup, per-entity applied ledger, and cursor advance in ONE transaction. SIGKILL pair proves the cursor can never advance ahead of applied data; lost-ack replay is a dedup no-op; cursor advance is monotonic (\`MAX\` guard).
  - **Tombstones + manifest closure**: deletes/scope changes materialize as explicit delete rows (stale rows cannot resurrect); rebootstrap completion reconciles local rows against the applied-entity ledger, EXCEPT ids the \`PendingWorkProbe\` port reports as protected — protection wins in both the reconcile (\`preserved\`) and tombstone apply (\`protectedDeletes\`): pending work survives, nothing discarded silently.
  - **Typed rebootstrap**: unknown/swept snapshots surface \`resync_required\` (ADR-0011 analogue); swept manifests retain a \`state='swept'\` row so cursors get the typed signal; \`abortBootstrap\` is the single typed reset (checkpoints + dedup + ledger only — domain rows and outbox untouched).
  - **Feed handoff**: completed bootstrap ends at the snapshot watermark = the \`afterSeq\` the T04 \`FeedConsumer\` resumes with (pinned in test); completed bootstraps structurally refuse further pages.
  - **No domain schema**: server rows arrive via injected \`SnapshotSource\` (called inside the open transaction, counter-pinned); client applies via \`SnapshotEntityApplier\`; pending-work protection via \`PendingWorkProbe\` — zero-dep isolation preserved, no cross-package import. Both class surfaces pinned by test to exactly their four public methods.
- **\`docs/reports/M03/snapshot-bootstrap.md\`** — recovery report (7 sections mapped to acceptance lines).
- **CI**: new "Run Native Snapshot Bootstrap Tests" step in \`lint_and_protocol\` (\`tool/check.mjs\`, pinned \`typescript@5.9.3\`), after the sync-feed step it hands off to.

## Acceptance mapping
- ✅ Snapshot data + watermark represent ONE consistent state; concurrent writes during bootstrap never change page contents (report §2)
- ✅ Pages deterministic and byte-bounded; no starvation (report §2)
- ✅ One-transaction apply; interruption cannot advance the cursor past unapplied data; replay is dedup no-op (report §3)
- ✅ Tombstones make deleted rows non-resurrectable; safe rebootstrap preserves + reconciles pending local work instead of discarding it (report §4)
- ✅ Expired/invalid cursors → typed \`resync_required\` rebootstrap, never a silent skip (report §5)

## Evidence
- 20/20 node:test cases against REAL on-disk SQLite (Node built-in \`node:sqlite\`, check tool refuses < Node 23) — no mocks as durability proof; 2 SIGKILL scenarios spawn real child processes, spawn-stable across 3 consecutive runs
- Protocol linter PASS (13 milestone files, 129 tasks, rollup 51/129)
- Checkbox M03-T05 ticked with this PR ref; EXECUTION-PLAN M03 row → 5/10, program total 51/129
`;

const payload = JSON.stringify({
  title: "[M03-T05] feat: snapshot bootstrap, cursor persistence and tombstones (one-tx materialization + apply, byte-bounded deterministic pagination, pending-work-preserving reconcile, typed resync_required; real-SQLite durability via node:sqlite)",
  head: "m03-t05-snapshot-bootstrap",
  base: "main",
  body: BODY,
});

const req = https.request(
  { hostname: "api.github.com", path: "/repos/Nacrose/contractor/pulls", method: "POST",
    headers: { "User-Agent": "task-bot", Authorization: "token " + process.env.GH_TOKEN,
      Accept: "application/vnd.github+json", "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } },
  (res) => {
    let d = "";
    res.on("data", (c) => (d += c));
    res.on("end", () => { const j = JSON.parse(d); console.log(res.statusCode, j.number ? `PR #${j.number} ${j.html_url}` : d.slice(0, 400)); });
  }
);
req.on("error", (e) => console.error("ERR", e.message));
req.end(payload);
