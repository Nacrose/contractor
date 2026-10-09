#!/usr/bin/env node
/** Create PLAN-AMEND PR for M04 refinement. */
const https = require("https");
const payload = JSON.stringify({
  title: "[PLAN-AMEND] plan: refine M04 to task level (M04-T01..T09) per protocol R9, before the M03 gate",
  head: "plan-amend-m04-task-level",
  base: "main",
  body: "## Task\n`[PLAN-AMEND]` per protocol R9: refine **M04 (First vertical workflow: daily log + photo)** from work-package level (7 WPs) to task level (M04-T01..T09) BEFORE the M03-T10 gate PR opens \u2014 exactly as the M03-T10 definition requires.\n\nEdits planning documents ONLY (milestone file + register) \u2014 no code, no runtime behavior.\n\n## What changes\n- **`docs/plans/milestones/M04-vertical-daily-log-photo.md`**: WP sketches replaced by M04-T01..T09, each with scope, outputs, dependencies, and testable acceptance criteria:\n  - T01 domain path trace + side-effect inventory through the M03 adapter (before any UI wiring)\n  - T02 Flutter mount wiring of the M03 ports (identity/outbox/snapshot/orchestrator/health) with binding tests\n  - T03 the vertical workflow (shared Flutter, one code path native+web, local save per M03-T03 contract)\n  - T04 photo attachment path live via M03-T06 + sync-health UI bound to M03-T08's honest surface\n  - T05 vertical fault matrix (the v3 W03 scenario list) extending the M03-T09 runner, invariants I1-I4 on the ASSEMBLED system\n  - T06 retention/restore proof + the attachment DOWNLOAD contract device restore needs (receipt-keyed fetch, digest-verified re-fetch)\n  - T07 real-device telemetry + capacity re-baseline PROPOSAL (bands change only via [PLAN-AMEND])\n  - T08 evidence package + parity check vs current daily-log rules; user verification explicitly requested\n  - T09 GATE (adds the explicit M05 refinement precondition per R9)\n- WP-to-T mapping preserved in a `Refinement record` section; the refinement contract now targets M05 before the M04 gate.\n- **`docs/plans/EXECUTION-PLAN.md`**: M04 row -> \"refined to task level by [PLAN-AMEND] (PR #41)\", 0/9; program total 55/131 (task count 129 -> 131).\n\n## Why now\nM03-T10 (GATE) depends on \"M04 task-level refinement PR\" \u2014 protocol R9: before a milestone gate PR may open, the NEXT milestone's file must be refined to task level via a [PLAN-AMEND] PR.\n\n## Checklist\n- Planning documents only (R6)\n- Protocol linter PASS (13 milestone files, 131 tasks, rollup 55/131)\n- No checkbox of a task is ticked by this PR (one task -> one PR -> one checkbox still holds for implementation work)\n",
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
