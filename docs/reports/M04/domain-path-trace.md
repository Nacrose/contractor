# M04-T01: Daily-report domain path trace through the M03 adapter + side-effect inventory

- **Task**: `M04-T01` — Daily-report domain path trace through the M03 adapter + side-effect inventory (PR #44)
- **Depends on**: M03-T01 (PR #32), M03-T04 (PR #35) — both merged
- **Status**: Complete · **No production code change** (analysis/report deliverable, per the task packet)
- **Date**: 2026-10-09 · **Precedence**: this report exists BEFORE any workflow code calls the adapter (M04-T02/T03 are not started); the dispositions in §4 bind that work.

---

## 1. Method — "exactly as the workflow will call it"

The trace follows the M04 vertical workflow's call path through the M03-T01 adapter boundary one stage at a time, using only ratified artifacts — no new mechanisms are proposed here:

1. **Envelope** — the workflow (via the M04-T02 mount) issues an `AdapterRequest` (`protocolVersion`, `operationId`, session-derived `auth`, durable `requestId`, payload from the pinned `platform_contracts` release); `validateEnvelope` + `resolveVersion` gate it (exact-pin resolution, no silent minor upgrading) — `packages/native_adapter/src/contract.ts`.
2. **Guard pipeline** — the request passes the ordered `GUARD_ORDER` stages (`identity → tenantScope → rateLimit → projectMembership → projectPermission → capability → inputReferences → delegation → financial → fiscalLock → idempotency`); a binding that has not declared its chain cannot be registered, and a failed stage never reaches dispatch — the adapter "adds no authority of its own" (adapter-guard-inventory.md §1).
3. **Authoritative dispatch** — the operation binding names the EXISTING server service/engine; business rules stay server-side, byte-for-byte the ones tRPC procedures run today.
4. **Feed emission** — migrated writers emit their sync-visible change inside the SAME serialized transaction as the authoritative mutation (`publishAtomically`, M03-T04 §4): success emits exactly one event; a forced domain failure rolls back both sides.

Sources of truth: `docs/reports/M00/inventory-routers.md`, `inventory-jobs-imports.md`, `inventory-local-stores.md` (M00-T07/T08 commit-pinned inventories); `docs/reports/M03/adapter-guard-inventory.md` (M03-T01); `docs/reports/M03/sync-feed-pilot.md` §3 (the audited writer list this report must cite); `docs/reports/M03/identity-device-design.md` (M03-T02 scope model); `docs/plans/native-web-platform-plan-v3.md` §6 M04 W01.

## 2. What the vertical workflow actually calls

The M04 headline workflow is: select project → create/edit daily log → attach photo → save locally (durable, M03-T03 contract) → sync via the M03-T07 orchestrator → observe accepted state on the web app and a second device.

The M00 inventories pin the live ingestion route (inventory-routers.md §"Field operations" key discovery): **`daily-report.ts` is UNMOUNTED in `_app.ts`; live field ingestion uses `field-submission` and `field-photos`, with background server normalization by the `daily-report-sync` reconciliation service** (inventory-jobs-imports.md row 2). The browser client's existing offline flow confirms the shape the native workflow preserves: drafts in IndexedDB, replay of `fieldSubmission.submitFieldReport` with a device-generated `clientUuid` idempotency key, photos via `fieldPhotos.create` (inventory-local-stores.md rows 35/49/50). The M04 workflow therefore submits through the field-submission path; it does NOT resurrect the unmounted legacy router. Every daily-report writer the inventories list is still accounted for in §3 — including the legacy router rows — because the sync surfaces must reflect state produced by ANY writer of the domain.

## 3. Writer inventory → adapter route → feed coverage

Every inventoried daily-report/field-submission writer from the M00 router/job/import inventories that this workflow touches, with its adapter route and its M03-T04 audited coverage (sync-feed-pilot.md §3 — cited per the acceptance requirement):

| # | Writer | Inventory source | Adapter route (`operationId` → authoritative service) | Guard chain declared at binding | M03-T04 feed coverage |
|---|---|---|---|---|---|
| 1 | `router:fieldSubmission.submitFieldReport` | inventory-routers.md row 26 (`field-submission.ts`, `createDomainRouter`, 11 asserts) | **`fieldSubmission.submit`** → field-submission ingestion (`daily-report-sync` normalization, idempotency, audit-log) — SEEDED in `SEED_OPERATIONS` | `identity, tenantScope, rateLimit, projectMembership, projectPermission, capability, inputReferences, idempotency` (seed, pinned) | **MIGRATED** → `field-submission/field_submission` |
| 2 | `router:fieldPhotos.create` | inventory-routers.md row 25 (`field-photos.ts`, `createDomainRouter`, 9 asserts) | `fieldPhotos.create` → field-photo metadata registration (photo BYTES travel via M03-T06 staging, not the JSON payload) | `identity, tenantScope, rateLimit, projectMembership, projectPermission, capability, inputReferences, idempotency` — registered at M04-T02, derived from the inventory row + the `createDomainRouter` pipeline | **MIGRATED** → `field-submission/field_submission` (attachment bytes are M03-T06 per the audited list) |
| 3 | `router:dailyReport.create` | inventory-routers.md row 14 (`daily-report.ts` — UNMOUNTED legacy, 27 asserts) | `dailyReport.create` → daily-report service — **not called by this workflow** (§2); route named for completeness | would require `identity, tenantScope, rateLimit, projectMembership, projectPermission, capability, fiscalLock, idempotency` (inventory side effects: audit-log, fiscal-year-lock, idempotency, domain-events) | **MIGRATED** → `daily-report/daily_report` |
| 4 | `router:dailyReport.update` | inventory-routers.md row 14 | `dailyReport.update` → daily-report service — **not called by this workflow** (§2) | as row 3 | **MIGRATED** → `daily-report/daily_report` |
| 5 | `router:dailyReportAttachments.attach` | inventory-routers.md row 13 (`daily-report-attachments.ts` — unmounted legacy, 8 asserts) | `dailyReportAttachments.attach` → daily-report attachment registration (bytes via M03-T06) — **not called by this workflow** | `identity, tenantScope, projectMembership, projectPermission, capability, idempotency` (inventory side effects: audit-log) | **MIGRATED** → `daily-report/daily_report` |
| 6 | `service:daily-report-sync` | inventory-jobs-imports.md (reconciliation service; normalizes `FieldSubmission` → `DailyReport` + `DailyReportProgress`, `DailyReportMaterialConsumed`, `DailyReportEquipment`, `DailyReportWorkforce`, `DailyReportAttachment`) | **Server-internal — not client-callable.** Triggered by field-submission ingestion; the adapter never invokes it directly | server-internal (the ingestion route's guard chain already gates everything that reaches it) | **MIGRATED** → `daily-report/daily_report` |

Intentionally excluded, citing the T04 audited list (sync-feed-pilot.md §3 — none silent): `daily-report-access.ts` (0 mutations, read-only legacy router), `job:session.cleanup` (identity-domain retention bookkeeping, client-invisible), `job:outbox.dispatch` (notification delivery state, not domain state). Out of pilot scope, with reason: `daily-program.ts` (row 11) is the daily **program** execution domain — a different feature surface, not the daily **log**; it is not touched by this workflow and not part of the T04 pilot list.

**Reads**: accepted daily-log state reaches devices through the M03-T04 pull (`FeedConsumer` + `EntityApplier`, tenant-partitioned, `canReadProject`-scoped) and initial state through M03-T05 snapshot bootstrap. The workflow performs NO direct read calls to the domain routers in v3's architecture — local reads come from the replica.

## 4. Side-effect inventory and disposition (the central-transaction question)

v3 §6 M04 W01 asks exactly one structural question: **does any side effect need a central transaction the adapter path cannot give it?** The disposition for every side effect the pilot writers perform:

| Side effect | Writers | Needs the central transaction? | Disposition |
|---|---|---|---|
| Domain mutation (`FieldSubmission`, `FieldPhoto`, `DailyReport` + sub-tables) | all | IS the transaction | **IN-PATH** — the adapter binds the same authoritative service; the mutation runs in the same server transaction as today. Nothing moves client-side. |
| Sync-feed event emission | all migrated writers | Yes — with the domain write | **IN-PATH** — `publishAtomically` allocates the commit-order seq inside the same serialized transaction as the mutation (M03-T04 §4, pinned by the pilot audit test: exactly one event on success; forced domain failure rolls back BOTH). |
| `withIdempotency` / `IdempotencyRecord` replay dedup | field-submission, field-photos, daily-report | Yes — atomic with the domain write (replay must return the cached result, not duplicate) | **IN-PATH** — the `idempotency` guard stage runs server-side; the adapter envelope's `requestId` carries the durable client request identity (the browser flow's `clientUuid`, preserved per the local-stores inventory). See constraint (a) below. |
| audit-log | all pilot writers | Yes (evidence integrity) | **IN-PATH** — performed by the same service call in the same transaction, exactly as tRPC procedures do today. |
| domain-events | field-submission, daily-report | Yes | **IN-PATH** — same service, same transaction. |
| fiscal-year-lock (`assertNotLocked`) | daily-report | Yes (guard must not be bypassable) | **IN-PATH** — `fiscalLock` is a declared `GUARD_ORDER` stage; the service-level lock check runs unchanged. (Not reached by this workflow, which submits via field-submission — but the disposition holds for the office-side route.) |
| `daily-report-sync` normalization (`FieldSubmission` → `DailyReport` + 5 sub-tables) | service:daily-report-sync | **No — asynchronous by design** | **DEFERRED, with reason** — the M00 inventory records it as "Event / Background ingestion of field submissions". Its outputs are feed-covered; the service is idempotent by reconciliation design. Pulling normalization into the ingestion transaction would CHANGE current business behavior, which the M04 parity requirement forbids (silent behavior change = M04-T08 gate failure). |
| StoredFile registration + S3/local object write | field-photos, daily-report-attachments | Split by protocol design | **IN-PATH (metadata) + M03-T06 (bytes)** — attachment BYTES go stage → finalize → register with digest verification at BOTH integrity boundaries; server-side SHA-256 dedup reuses the existing `StoredFile` record (local-stores row 50). Complete == registered (M04-T04 acceptance). |
| MaterialTransaction / progress / workforce / equipment writes | daily-report, daily-report-sync | Yes, with their parent write | **IN-PATH** — written by the owning service transaction (direct) or the reconciliation service (normalized), both server-side, both feed-covered. |

**Summary of disposition: NO side effect requires an adapter contract change; no `[PLAN-AMEND]` is needed.** Every transactional side effect is already inside a transaction the adapter path preserves, because the adapter re-routes to the same services instead of re-implementing them. Known constraints, recorded here per the acceptance requirement:

- **(a) `requestId` enforcement at binding level.** The envelope contract states `requestId` is REQUIRED for mutations (doc-comment) and `validateEnvelope` checks it is non-empty when present; structural validation does not force presence for every mutation. The M04-T02 mount MUST enforce "mutation ⇒ requestId" at binding registration (each expansion workflow's binding asserts it). This is mount configuration inside the existing contract — not an adapter change.
- **(b) Registry entries for rows 2–5 are not in `SEED_OPERATIONS` yet.** By design, the seed carries exemplar bindings (`fieldSubmission.submit` among them); per-deployment bindings are mount configuration. M04-T02 registers `fieldPhotos.create` (and, if ever needed, the office-side `dailyReport.*` routes) with the guard chains named in §3 — a binding that cannot name its inventory row and chain cannot be registered (M03-T01 registry rule).
- **(c) The legacy unmounted routers stay unmounted for native clients.** This workflow submits through field-submission (the live path). Should a future task want direct `DailyReport` authoring from native, it is a NEW task packet naming its guard chain + feed coverage — it is not silently added here.

## 5. Permissions for the pilot domain (M03-T02 scope-claims model)

The M03-T02 model: the session is opaque token evidence; `SessionIdentity` = `{sessionId, sessionFamilyId, userId, organizationId, deviceId}`; the adapter's `AdapterAuth` (`authenticated`, server-derived `organizationId`, `userId`) is resolved by the identity stage and **never trusted from the payload**. There are no client-held project/role claims: project and role authorization is re-derived server-side on EVERY dispatch through the guard pipeline, and the feed adds no permission logic of its own — the `FeedReadScope.canReadProject` port is bound to the SAME permission logic interactive reads use (M03-T04 §5).

| Workflow action | Expected current-app authorization | Enforced at the adapter by |
|---|---|---|
| Field user creates/edits a daily log draft and submits | Project member with write access to the field module | `identity` (session validity), `tenantScope` (organization), `projectMembership` (`assertProjectMember`), `projectPermission` (`assertProjectPermissionOrModuleEdit`), `capability` (active `OrganizationPolicyVersion`), `inputReferences` (FK tenancy), `idempotency` — in `GUARD_ORDER` |
| Field user attaches a photo | Same as submit; upload authorized server-side | Same chain on the metadata route + M03-T06 `AttachmentRegistrar` authorization at register |
| Office reviews / adjusts a submission | Manager/admin on the project (server web path today) | Server-side permission checks unchanged; field devices observe outcomes ONLY through the feed (they cannot mutate review state) |
| Devices read accepted daily-log state | Project member, view scope | Feed pull: structural tenant partition + `canReadProject` port (revoked project ⇒ immediately stops flowing; re-grant ⇒ withheld changes resume, cursor never skips) |

**Revalidation expectation**: every dispatch re-derives identity and authorization server-side — there is no cached client grant to go stale. Mid-flow revocation surfaces as typed `unauthorized`/`forbidden` at the next dispatch; expired or revoked sessions fail the `identity` stage outright (M03-T02: no client-side grace state); the M03-T07 orchestrator stops the drain and raises the auth event sink rather than retrying into a wall. Financial approvals are NOT part of this workflow's permission surface (submit ≠ approve; T03-class flows keep `delegation`/`financial` stages).

## 6. Flutter consumer path and parity evidence route

- **Consumer path**: the workflow's apply side is exactly `EntityApplier` + `FeedConsumer` (sync-feed-pilot.md §9 names the M04 vertical as the feed's consumer); local persistence is the M03-T03 outbox/drafts contract; initial state via M03-T05 bootstrap; health via M03-T08; all bound to device implementations by the M04-T02 mount.
- **Parity evidence route**: contract semantics flow through the M02 `platform_contracts` generation pattern (Dart/Rust ports, one owner per shared contract — v3 §9); workflow-behavior parity against the CURRENT daily-log rules is assembled at M04-T08 and consumed at the **M10 gate** (full parity & web migration), per this task's acceptance.

## 7. Disposition-before-use statement

The M04-T02 mount wiring and M04-T03 workflow implementation MUST treat §3 as the operation-binding source of truth, §4 as the side-effect disposition (no workflow code re-implements or relocates any listed side effect), and §5 as the permission/revalidation contract. Any deviation discovered during implementation is either a `[PLAN-AMEND]` or a new task packet — never a silent local decision.

## 8. Correction required before M04-T03 implementation

The route identification in §§2–4 is incorrect for the current product repo. The M00 inventory snapshot describes an older route mount: in the product checkout inspected 2026-10-10 (`/private/tmp/construction-manager-m02-t04`, commit `05922456`), `_app.ts` mounts `workflowRouter`; `workflow.ts` mounts `dailyReportRouter`; and `daily-report.ts` exposes `createFieldReport`. The current daily-log form builder also targets `workflow.dailyReport.createFieldReport`. `fieldSubmission.create` accepts only `material_inward`, `site_expense`, or `labour_log`, so the seed operation `fieldSubmission.submit` cannot represent this daily-log workflow.

The product procedure validates the daily-report sections, rechecks `assertDailyReportEdit` inside the tenant transaction, deduplicates by `clientUuid`, writes normalized section rows, registers photos, audits, and emits the office event. The current M03 sync package has no product HTTP adapter endpoint that dispatches this operation and emits the M03 change-feed event atomically. The Flutter workflow must not call `fieldSubmission.submit` as a substitute. Before M04-T03 can claim server acceptance or cross-device visibility, a separate product-repo change must bind the existing field-report service to M03 sync, preserve its authorization/idempotency and feed transaction, and be merged. Photo transfer must then use the M03-T06 path under M04-T04 rather than bypassing it with inline image bytes.

Read-only evidence commands: `git -C /private/tmp/construction-manager-m02-t04 rev-parse --short HEAD` → `05922456`; `rg -n "workflowRouter|dailyReportRouter" /private/tmp/construction-manager-m02-t04/src/server/routers/{_app,workflow}.ts`; `rg -n "createFieldReport|FieldReportCreateSchema" /private/tmp/construction-manager-m02-t04/src/server/routers/daily-report.ts`; `rg -n "endpoint: \"workflow.dailyReport.createFieldReport\"" /private/tmp/construction-manager-m02-t04/src/lib/field-entry-builders.ts`.
