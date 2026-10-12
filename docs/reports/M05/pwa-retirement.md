# M05-T09 Field PWA Code Retirement Gate Report

**Milestone:** M05 Field Workflow Expansion  
**Task:** M05-T09 — Field PWA code retirement gate (drain verified)  
**Status:** PASSED & VERIFIED  
**Date:** 2026-10-12  
**Normative Reference:** Platform Plan v3 §6 M05 bullet 5; WP Sketch W08; AI-Agent Execution Protocol R2, R13  

---

## 1. Executive Summary

Milestone **M05-T09** executes the verified retirement gate for legacy browser field PWA code. Per platform plan v3 §6 M05 bullet 5, legacy browser field PWA code may only be retired **after** safe draining is proved and recorded with zero pending work lost.

Following the verification of safe browser drafts/queues draining in **M05-T07** (PR #62) and full contract suite + fault matrix pass in **M05-T08** (PR #63), this task establishes:
1. **Drain Pre-Condition Verification:** Confirms 100% of outbox records across `cm-field-outbox` and legacy `cm-offline-v2` are drained/archived with zero pending items remaining.
2. **Strict Boundary Scoping:** Retires only dead browser-local outbox and field PWA routes; guarantees that shared desktop web app routes, office review surfaces, the virtual worksheet grid, CAD engine, and PDF canvas takeoff remain completely untouched.
3. **Service Worker Sanitation:** Removes `cm-field-sync` / `cm-field-outbox` background sync loops while preserving static asset caching and service worker lifecycle handlers.
4. **Comprehensive Rollback Notes & Data Continuity:** Formulates deterministic git revert procedures and proves that operations written via the native Flutter client during any rollback window remain fully preserved via native WAL SQLite and server-side sync receipts.

---

## 2. Drain Pre-Condition Verification

The `PwaRetirementGate` audits the drain dispositions from M05-T07 against the zero-loss invariant (I1):

```
Total records evaluated:    47
Acknowledged & Archived:   38
Skipped (Already Synced):   4
Discarded (Stale >7d):      2
Legacy Mapped & Drained:    3
Retained Pending:           0
-----------------------------------------
Gate Verdict: SAFE TO RETIRE (100% resolved, 0 un-drained records)
```

Any attempt to execute the retirement gate while `retained_pending > 0` fails closed with a typed `PwaRetirementGateError`, preventing premature deletion of un-drained local mutations.

---

## 3. Scope Boundaries: Retired vs Retained

### 3.1 Components Retiring (Dead Field PWA Code)

The canonical retirement changeset (`M05-T09-PWA-RETIREMENT`) isolates code deadened by the transition to the Flutter native client:

| Path | Action | Rationale |
|---|---|---|
| `src/lib/field-outbox.ts` | Delete | Legacy IndexedDB outbox queue, retry timers, and flush loops superseded by native SQLite outbox. |
| `src/lib/field-db.ts` | Delete | `cm-field-outbox` IndexedDB connection and migration schemas (v1–v3) superseded by native SQLite migrations. |
| `src/lib/field-drafts.ts` | Delete | Browser-local draft storage wrapper superseded by native `private_draft` table. |
| `src/lib/field-cache.ts` | Delete | Transient browser cache wrapper superseded by native local SQLite tables (`attendance_local`, etc.). |
| `src/lib/field-entry-builders.ts` | Delete | Legacy client-side form payload builders superseded by unified `@contractor/platform-contracts`. |
| `src/lib/field-query-persist.ts` | Delete | Browser query caching superseded by native snapshot sync feed. |
| `src/lib/field-storage-keys.ts` | Delete | Retired localStorage keys for browser outbox state. |
| `src/app/m/tasks/new/page.tsx` | Deprecate | Mobile web route replaced with banner/redirect to native mobile application. |
| `src/app/m/tasks/page.tsx` | Deprecate | Mobile web task list replaced with native app guidance. |
| `src/app/m/sync/page.tsx` | Deprecate | Mobile sync page replaced with migration completion status and native app download prompt. |
| `src/app/m/photos/page.tsx` | Deprecate | Mobile photo capture route replaced with native camera/file adapter workflow. |
| `src/components/mobile/sync-status-chip.tsx` | Delete | Browser sync indicator component removed. |
| `src/components/mobile/mobile-guard.tsx` | Modify | Removed `initFieldOutbox` invocation on mount. |
| `public/sw.js` | Modify | Removed `cm-field-sync` background sync event listener and outbox replay loop. |

### 3.2 Components Retained (Protected Web Surfaces)

The changeset auditor (`PwaRetirementGate.auditChangeset`) verifies that zero protected web surfaces are modified or deleted:

| Subsystem | Protected Path Pattern | Verification |
|---|---|---|
| **Office Review Surfaces** | `src/app/admin/field-submissions/**` | Untouched; continues to review daily logs, attendance, site expenses, and MRRs. |
| **Daily Report Web Views** | `src/app/reports/daily/**` | Untouched; office daily report displays remain fully functional. |
| **Petty Cash / Finance** | `src/app/finance/**` | Untouched; office petty cash audit and ledger views preserved. |
| **Virtual Worksheet Grid** | `src/components/worksheet/**`, `src/lib/worksheet/**` | Untouched; core 100k-row virtualized calculation engine untouched. |
| **PDF Canvas Takeoff** | `src/lib/pdf-canvas/**` | Untouched; measurement and takeoff canvas engine untouched. |
| **CAD Kernel & Vector** | `src/lib/cad/**` | Untouched; DXF/DWG vector rendering engines untouched. |
| **Domain Server Routers** | `src/server/api/routers/workflow/**`, `attendance/**`, `siteExpense/**`, `materialDelivery/**` | Untouched; backend domain validation and financial guards untouched. |

---

## 4. Service Worker Sanitation

In `public/sw.js`, the background sync listener for `cm-field-outbox` and associated `runFlush()` replay methods are excised. The service worker continues to perform:
- Core lifecycle hooks (`install`, `activate`).
- Static web asset caching and cache-first offline shell delivery.
- Fetch proxying for web app application assets.

Automated inspection confirms:
- `hasFieldSyncArtifacts`: `false` (zero references to `cm-field-outbox` or `cm-field-sync`).
- `hasStaticCaching`: `true`.
- `hasLifecycleHandlers`: `true`.
- `isSanitized`: `true`.

---

## 5. Rollback Procedures & Data Continuity

### 5.1 Revert Command

In the event of an unforeseen regression requiring web field PWA restoration:
```bash
git revert <retirement-commit-sha> --no-edit
```
Deploying the reverted web application will automatically update the service worker on client browsers upon subsequent reload.

### 5.2 Physical IndexedDB Preservation

IndexedDB `cm-field-outbox` databases are **never dropped programmatically**. Even after PWA code retirement:
- Browser local storage remains physically intact on field worker devices.
- In the event of a rollback, previously cached records remain readable without data loss.

### 5.3 Cross-Platform Data Continuity Guarantee

Work authored in the Flutter native client during the retirement or rollback window:
- Is durably written to native SQLite in WAL mode.
- Synchronizes directly via the unified server API adapter using idempotent operation IDs.
- Creates durable server ledger receipts (`sync_receipt` / `dedup_ledger`).
- **Does not interact with or depend on browser IndexedDB.**
- A web PWA code rollback has **zero effect** on data authored in the native client.

---

## 6. Test Suite & Verification Results

### 6.1 Native Adapter & PWA Retirement Suite (`packages/native_adapter`)

```bash
$ node tool/check.mjs
✔ supported versions resolve exactly (1.1.0 and 1.0.0)
✔ happy path dispatches exactly once, to the registered service
✔ central rule: two devices submitting same worker converge deterministically with 0 duplicates
✔ site expense: office edit preserves original submitter and initial submission audit history
✔ anti-self-review: field submitter cannot approve/review their own MRR delivery
✔ field photo registration: registers photo with durable receipt and preserves EXIF geotag metadata
✔ M05-T07: crash-safety and resumability — interrupted drain resumes with 0 loss and 0 duplicates
✔ PWA Retirement Gate: blocks retirement if any un-drained items remain pending
✔ PWA Retirement Gate: approves retirement when 100% of outbox records are drained
✔ PWA Retirement Gate: validates canonical changeset against allowed field paths
✔ PWA Retirement Gate: rejects changesets attempting to retire protected web surfaces
✔ PWA Retirement Gate: verifies service worker cleanup removes field sync while keeping asset caching
✔ PWA Retirement Gate: documents rollback protocol and data continuity guarantees
ℹ tests 53
ℹ pass 53
ℹ fail 0
native_adapter: contract, attendance, site expense, material delivery, field photos, browser drain, and pwa retirement tests PASSED
```

### 6.2 Native Fault Matrix (`packages/native_faultmatrix`)

```bash
$ node tool/check.mjs
✔ F01-F17: all 17 SQLite fault legs PASS
✔ ZZ: fault matrix report is complete and reproducible
ℹ tests 19
ℹ pass 19
ℹ fail 0
```

### 6.3 Flutter Test Suite (`prototype/construction_client`)

```bash
$ flutter test test/workflows/m05_fault_matrix_test.dart
00:00 +0: M05 fault: attendance conflict preserves entry, surfaces in syncHealth, and survives reopen
00:00 +1: M05 fault: site expense permission revocation stops drain and preserves uncommitted work
00:00 +2: M05 fault: material delivery lost acknowledgement preserves original receipt on replay
00:00 +3: M05 fault: field photo staging interruption excludes photo from office review
00:00 +4: M05 fault: migration replay invariant — interrupted drain replays with zero loss
00:00 +5: All tests passed!
```

---

## 7. Acceptance Criteria Checklist

- [x] **Retirement diff removes only dead field PWA code:** Dead IndexedDB outbox/draft/query stores and mobile PWA routes isolated; shared desktop web app code untouched.
- [x] **Rollback notes documented:** Complete git revert procedure, IndexedDB physical preservation guarantee, and cross-platform continuity recorded.
- [x] **Post-retirement checks pass:** Office surfaces verified unaffected; service worker background sync cleanly removed while asset caching is preserved.
- [x] **Evidence recorded prior to merge:** Comprehensive evidence registered in `docs/reports/M05/pwa-retirement.md` with accompanying automated test harness.
