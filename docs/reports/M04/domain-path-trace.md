# M04-T01: Daily-report domain path trace through the M03 adapter + side-effect inventory

- **Task**: `M04-T01` — Daily-report domain path trace through the M03 adapter + side-effect inventory (PR #44)
- **Depends on**: M03-T01 (PR #32), M03-T04 (PR #35) — both merged
- **Status**: Corrected analysis deliverable · product PR #170 now contains an M03-T01-conformant binding; live acceptance remains open.
- **Original date**: 2026-10-09 · **Correction date**: 2026-10-11.
- **Correction**: the original §2–§7 route description relied on a stale M00 inventory and incorrectly selected `fieldSubmission.submit`. The original correction recorded the daily-report path and adapter gap as of its review; the 2026-10-11 product adapter update below supersedes that gap statement for the PR branch. Neither update claims live acceptance.

---

## 1. M03-T01 adapter contract and current binding

The M03-T01 contract is the required native-facing boundary; the list below describes that contract, not a claim that the current product transport already mounts it:

1. **Envelope** — an `AdapterRequest` carries `protocolVersion`, `operationId`, server-resolved `auth`, a durable `requestId` for mutations, and payload from an exact pinned `platform_contracts` release. `validateEnvelope` and `resolveVersion` reject malformed or unserved versions before dispatch — `packages/native_adapter/src/contract.ts`.
2. **Guard pipeline** — each registered operation declares its ordered `GUARD_ORDER` stages (`identity → tenantScope → rateLimit → projectMembership → projectPermission → capability → inputReferences → delegation → financial → fiscalLock → idempotency`). Missing implementations fail closed; a rejected stage never reaches dispatch — `adapter-guard-inventory.md` §§1–3.
3. **Authoritative dispatch** — a binding names the existing server service or engine; business rules and permissions stay server-side.
4. **Feed emission** — the audited M03-T04 pilot writers emit their sync-visible change atomically with their authoritative mutation through `publishAtomically` in the adapter binding — `sync-feed-pilot.md` §§3–5.

**Historical implementation gap (before product PR #170):** product PR #165's `POST /api/native/sync` accepted a separate `syncProtocolVersion` envelope, performed route-local checks, created a tRPC caller, and directly invoked `appRouter.workflow.dailyReport.createFieldReport`. It did not construct `AdapterRequest`, resolve the exact `platform_contracts` version, or dispatch through the `@contractor/native-adapter` operation registry and declared guard pipeline. Product PR #170 now adds that adapter binding on the product PR branch; its implementation and tests are recorded below. The PR remains unmerged and live acceptance is still required.

Sources of truth: `docs/reports/M00/inventory-routers.md`, `inventory-jobs-imports.md`, `inventory-local-stores.md` (M00-T07/T08 commit-pinned inventories); `docs/reports/M03/adapter-guard-inventory.md` (M03-T01); `docs/reports/M03/sync-feed-pilot.md` §3 (the audited writer list this report must cite); `docs/reports/M03/identity-device-design.md` (M03-T02 scope model); `docs/plans/native-web-platform-plan-v3.md` §6 M04 W01.

## 2. What the vertical workflow actually calls

The M04 headline workflow is: select project → create/edit daily log → attach photo → save locally (durable, M03-T03 contract) → sync via the M03-T07 orchestrator → observe accepted state on the web app and a second device.

The M00 inventory's statement that `daily-report.ts` is unmounted describes an older product revision and is not the current route. In the product checkout inspected on 2026-10-11, `_app.ts` mounts `workflowRouter`, `workflow.ts` mounts `dailyReportRouter` as `workflow.dailyReport`, and that router exposes `createFieldReport`. The workflow operation is **`workflow.dailyReport.createFieldReport`**, which creates a `DailyReport` draft and normalized child rows. Product PR #165 added `POST /api/native/sync` as the native transport binding; product PR #170 now routes that binding through the shared M03 adapter on its unmerged branch. Live acceptance remains open. `fieldSubmission.create` accepts other submission kinds and is not a daily-report substitute. The `daily-report-sync` service remains a separate writer for those field-submission kinds; it is not called by `createFieldReport`.

## 3. Writer inventory → current product route → feed coverage

Daily-report writers touched by this vertical, their current routes, and the M03-T04 feed mapping (sync-feed-pilot.md §3). The product path is read from the current checkout; feed coverage is the audited M03-T04 mapping. Product-backed feed delivery still requires the stacked product PRs and a live sync session.

| # | Writer | Current M04 route / use | Authorization and side effects | M03-T04 feed coverage |
|---|---|---|---|---|
| 1 | `workflow.dailyReport.createFieldReport` | M04 operation; product PR #170 routes `POST /api/native/sync` through `@contractor/native-adapter` before dispatch to the existing procedure | Adapter guard binding preserves server identity, tenant/project scope, rate limiting, membership and edit checks; the procedure retains transactional validation, `clientUuid` idempotency, and `DailyReport`/normalized-child/photo-reference writes | `daily-report/daily_report` is the audited projection for daily-report writes; product feed visibility remains unverified |
| 2 | `workflow.dailyReport.createReport` / `updateReport` | Existing office-side daily-report writers; **not called by the M04 field editor** | Existing server authorization and review behavior; M04 observes their accepted changes through sync | `daily-report/daily_report` |
| 3 | `fieldPhotos.create` | M04-T04 upload completion in `POST /api/native/photos/upload` calls the existing procedure (product PR #170; unmerged); the registered reference is then filed by `createFieldReport` | Project authorization is rechecked; bytes are chunked, resumed, and SHA-256 verified before registration; report transaction rechecks photo receipt, project, size, and digest | The audited M03-T04 mapping for `fieldPhotos.create` is `field-submission/field_submission`; product-backed delivery remains unverified |
| 4 | `service:daily-report-sync` | Separate server reconciliation for `FieldSubmission` rows; **not called by `createFieldReport`** | Triggered by the separate field-submission ingestion path; keeps that path's existing normalization semantics | `daily-report/daily_report` |
| 5 | `router:dailyReportAttachments.uploadAttachment` | Legacy attachment procedure; not used by the M04 registered-photo path | M04-T04 uses the M03-T06 upload/registration journal instead of inline bytes or this legacy upload route | `daily-report/daily_report` inventory mapping; no M04 write via this route |
| 6 | `router:fieldSubmission.submitFieldReport` | Separate submission workflow; **not called for daily reports** | Its validation and review semantics remain distinct from the daily-report draft/review procedure | `field-submission/field_submission` |

Intentionally excluded, citing the T04 audited list (sync-feed-pilot.md §3 — none silent): `daily-report-access.ts` (authorization helpers, no mutations), `job:session.cleanup` (identity-domain retention bookkeeping, client-invisible), `job:outbox.dispatch` (notification delivery state, not domain state). Out of this vertical's scope: `daily-program.ts` is the daily **program** execution domain, not the daily **log**. `fieldSubmission.submitFieldReport` is covered in the pilot feed but is excluded from the M04 daily-report call path because it creates a different record type.

**Reads**: accepted daily-log state reaches devices through the M03-T04 pull (`FeedConsumer` + `EntityApplier`, tenant-partitioned, `canReadProject`-scoped) and initial state through M03-T05 snapshot bootstrap. The workflow performs NO direct read calls to the domain routers in v3's architecture — local reads come from the replica.

## 4. Side-effect inventory and disposition (the central-transaction question)

v3 §6 M04 W01 asks exactly one structural question: **does any side effect need a central transaction the adapter path cannot give it?** The disposition for every side effect the pilot writers perform:

| Side effect | Transaction behavior | Disposition |
|---|---|---|
| `DailyReport` plus normalized workforce, progress, equipment, and material rows | Created in the existing `createFieldReport` transaction | **IN-PATH** — native sync dispatches the existing procedure; no client-side reconstruction of server rules. |
| Project permission | Checked before the transaction and rechecked inside it | **IN-PATH** — project and tenant authorization remain server-derived on every dispatch. |
| Report idempotency | `withIdempotency` and the report write share the transaction; the HTTP binding requires `payload.clientUuid === envelope.opId` | **IN-PATH** — stable M03 operation identity replays the existing report result. |
| Registered-photo filing | Receipt, project, digest, size, and stored-file metadata are checked and filed in the report transaction | **IN-PATH** after M03-T06 registration; incomplete upload states cannot be filed as a report attachment. |
| Photo bytes / `StoredFile` registration | M04-T06 upload journal chunks and verifies bytes before calling `fieldPhotos.create`; separate from report creation | **IN-PATH through M03-T06** — this is intentionally a separate resumable protocol, not a second report transaction. |
| Audit log | Scheduled after the response by the existing `audit()` path | **PRESERVED, not transaction-coupled** — this is existing product behavior; audit failures are surfaced through server error reporting. It is not the M03 change-feed mechanism. |
| Office notification (`daily_report.field_created`) | Dispatched after the response by `emitDomainEvent` | **PRESERVED, not transaction-coupled** — notification delivery is best-effort and does not determine report acceptance or feed correctness. |
| M03 sync feed | Product pull/snapshot routes expose committed server state; product feed implementation is in the stacked sync PRs | **REQUIRES LIVE VERIFICATION** — the M03-T04 audit maps this domain to `daily-report/daily_report`; the product endpoint/worker has not yet been merged and exercised end-to-end. Do not claim feed acceptance from local Flutter fixtures. |
| Separate field-submission normalization | `daily-report-sync` runs for `FieldSubmission`, not for `createFieldReport` | **OUTSIDE THIS CALL PATH** — preserve that workflow and its feed coverage without routing daily reports through it. |

**Summary of disposition:** the M04 client uses the existing `workflow.dailyReport.createFieldReport` procedure through the M03 adapter binding in product PR #170; it must not use the separate field-submission route. The PR branch preserves the procedure's transactional report write and replay behavior. Feed delivery is a cross-repository prerequisite and is not proven by the original M03 local feed tests or the adapter route tests.

## Product adapter status update — 2026-10-11

Construction_Manager PR #170 now routes `POST /api/native/sync` through the shared M03 adapter version resolver, registry, and declared guard chain before dispatching to the existing daily-report procedure. The product branch pins Contractor commit `74fe803`; product commit `449f50ae` includes the binding and route tests. This resolves the conformance implementation gap in the unmerged PR branch. Live authenticated acceptance, CDC feed visibility, and a second-client round trip remain unproven, so M04-T03 is still open.

The product sync binding and feed pull/snapshot work are in Construction_Manager PRs #165–#170. They remain unmerged, so this report identifies the intended, code-reviewed route and current feed mapping but does not claim a live accepted write.

## 5. Permissions for the pilot domain (M03-T02 scope-claims model)

The M03-T02 model: the session is opaque token evidence; `SessionIdentity` = `{sessionId, sessionFamilyId, userId, organizationId, deviceId}`; the adapter's `AdapterAuth` (`authenticated`, server-derived `organizationId`, `userId`) is resolved by the identity stage and **never trusted from the payload**. There are no client-held project/role claims: project and role authorization is re-derived server-side on EVERY dispatch through the guard pipeline, and the feed adds no permission logic of its own — the `FeedReadScope.canReadProject` port is bound to the SAME permission logic interactive reads use (M03-T04 §5).

| Workflow action | Expected current-app authorization | Current product enforcement / gap |
|---|---|---|
| Field user creates a daily-log draft | Project user with `project.dailyProgramme.edit` or the equivalent `dailyProgramme` module edit grant | On product PR #170, the M03 adapter guard binding resolves native identity from the server session and checks tenant/project scope, rate limit, membership, and edit permission; the existing procedure rechecks edit permission inside the transaction. |
| Field user attaches a photo | Same project edit scope | Resumable upload rechecks identity/project access on each action; completion calls the existing `fieldPhotos.create` procedure; report filing revalidates the registered photo and its digest |
| Office reviews / adjusts a submission | Manager/admin on the project (server web path today) | Server-side permission checks unchanged; field devices observe outcomes ONLY through the feed (they cannot mutate review state) |
| Devices read accepted daily-log state | Project member, view scope | Feed pull: structural tenant partition + `canReadProject` port (revoked project ⇒ immediately stops flowing; re-grant ⇒ withheld changes resume, cursor never skips) |

**Revalidation expectation**: every dispatch re-derives identity and authorization server-side — there is no cached client grant to go stale. Mid-flow revocation surfaces as typed `unauthorized`/`forbidden` at the next dispatch; expired or revoked sessions fail the `identity` stage outright (M03-T02: no client-side grace state); the M03-T07 orchestrator stops the drain and raises the auth event sink rather than retrying into a wall. Financial approvals are NOT part of this workflow's permission surface (submit ≠ approve; T03-class flows keep `delegation`/`financial` stages).

## 6. Flutter consumer path and parity evidence route

- **Consumer path**: the workflow's apply side is exactly `EntityApplier` + `FeedConsumer` (sync-feed-pilot.md §9 names the M04 vertical as the feed's consumer); local persistence is the M03-T03 outbox/drafts contract; initial state via M03-T05 bootstrap; health via M03-T08; all bound to device implementations by the M04-T02 mount.
- **Parity evidence route**: contract semantics flow through the M02 `platform_contracts` generation pattern (Dart/Rust ports, one owner per shared contract — v3 §9); workflow-behavior parity against the CURRENT daily-log rules is assembled at M04-T08 and consumed at the **M10 gate** (full parity & web migration), per this task's acceptance.

## 7. Disposition-before-use statement

The M04-T02 mount and M04-T03 workflow use the operation and side-effect dispositions above. The native operation is `workflow.dailyReport.createFieldReport`; `fieldSubmission.submit` creates a different record type and must not be used. Product PR #170 mounts `/api/native/sync` through the central M03 adapter contract on its unmerged branch. Feed behavior and authenticated acceptance remain open.

## 8. Correction history and current evidence

The original 2026-10-09 route description followed the M00 inventory's older `_app.ts` snapshot and was wrong for the current product code. The correction was identified on 2026-10-10 and is now incorporated into §§2–7 above. The current product checkout inspected on 2026-10-11 mounts `workflowRouter`, which mounts `dailyReportRouter`; `createFieldReport` validates the daily-report schema, rechecks `assertDailyReportEdit` inside the tenant transaction, deduplicates by `clientUuid`, writes normalized section rows, and files registered photo references after checking receipt, project, digest, and size. Audit and office notification use their existing post-response paths.

The product PR stack now contains `POST /api/native/sync` dispatching the operation to `appRouter.workflow.dailyReport.createFieldReport`, plus feed/snapshot, PKCE, and resumable-photo routes. Those PRs remain unmerged. Therefore the route and service path are code-reviewed locally, while authenticated report acceptance, feed visibility, and second-device visibility remain unproven.

Read-only evidence: product checkout `/private/tmp/construction-manager-m03-native-auth`, branch `codex/m04-resumable-photo-upload`; `src/server/routers/_app.ts`, `src/server/routers/workflow.ts`, `src/server/routers/daily-report.ts`, `src/app/api/native/sync/route.ts`, `src/app/api/native/sync/changes/route.ts`, `src/app/api/native/sync/snapshot/route.ts`, `src/app/api/native/photos/upload/route.ts`; Contractor `docs/reports/M03/sync-feed-pilot.md` §3.
