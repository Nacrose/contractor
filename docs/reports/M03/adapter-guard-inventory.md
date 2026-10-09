# M03-T01: Native adapter guard inventory and compatibility rules

- **Milestone:** M03 (Native identity, repositories and sync engine)
- **Task:** `M03-T01` — Define a versioned native-facing API adapter
- **Evidence sources:** [M00-T07 router inventory](../M00/inventory-routers.md) (app commit `7d80083e`), [platform_contracts release policy](../../../packages/platform_contracts/CHANGELOG.md), platform plan v3 §4/§5.1/§9, [M02-GATE packet](../M02/gate-evidence.md)
- **Contract package:** [`packages/native_adapter/`](../../../packages/native_adapter/)
- **Date:** 2026-10-09

---

## 1. Purpose and scope

The native adapter is the single boundary through which Flutter clients call the existing Construction_Manager domain services. Its contract has one governing rule: **the adapter adds no authority of its own** — every business rule, permission check, and side-effect guard that protects a tRPC procedure today must protect the equivalent adapter operation, in the same order, with the same server-side enforcement. The M00-T07 inventory quantified why this boundary is non-negotiable: 79 router files, 711 procedures, and **2,025 hand-rolled `assert*` authorization call sites**, with the declarative `createDomainRouter` pipeline adopted by only 5 of 79 routers (6.3%). Authorization lives at the application layer, not in database RLS — so a native client that bypasses the tRPC boundary bypasses 2,025 guards. The adapter's job is to make bypassing structurally impossible: an operation that has not declared its guard chain cannot be registered, and a request that fails any stage never reaches dispatch.

This task delivers the **contract**, not the transport. The package (`@contractor/native-adapter`) is pure TypeScript with zero runtime dependencies and **no tRPC import**: tRPC remains the app's internal routing machinery; the native surface binds only to the envelope, error taxonomy, guard pipeline, and operation registry defined here. No new server-side domain feature is introduced (M03-T01 acceptance; standing constraint 3) — follow-up tasks that add domain behavior must name their change-feed integration and Flutter-parity path in their own packets.

## 2. Guard inventory: app guard → adapter stage → preservation mechanism

Each row maps a guard observed in the M00-T07 inventory to a named, ordered stage of the adapter pipeline (`GUARD_ORDER` in `src/contract.ts`) and records how preservation is enforced.

| # | App guard (M00-T07 §2) | Where it applies today | Adapter stage | Preservation mechanism |
|---|---|---|---|---|
| 1 | Session authentication (`protectedProcedure`) | tRPC middleware, all procedures | `identity` | First stage of every registered operation; registry construction **fails** if an operation omits it. Identity is session-derived; the envelope carries auth as server-derived evidence, never a client assertion. |
| 2 | `assertOrganizationPermissionOrAdmin` / `isOrgAdmin` | 74 hand-rolled + 5 declarative routers | `tenantScope` | Organization scope re-derived server-side per request; test proves tenant mismatch yields typed `forbidden` before dispatch. |
| 3 | Server rate limiting (v3 §5.1 requirement) | Server middleware | `rateLimit` | Declared stage in the fixed order; typed `rate_limited` rejection demonstrated before dispatch; must remain server-enforced when mounted. |
| 4 | `assertProjectMember` | 2,025 call sites (project-scoped procedures) | `projectMembership` | Per-operation declaration; seeded exemplars include it on every project-scoped operation. |
| 5 | `assertProjectPermissionOrModuleEdit` / `…ModuleView` | Module-level RBAC per procedure | `projectPermission` | Declared per operation with edit/view distinction carried by the binding, not the client. |
| 6 | `capabilityGuard` (active `OrganizationPolicyVersion`) | `createDomainRouter` pipeline (5 routers today) | `capability` | Stage preserved so declarative-pipeline semantics survive unchanged as more routers adopt it. |
| 7 | `assertInputReferences` | FK tenancy validation in procedure bodies | `inputReferences` | Cross-tenant foreign-key references rejected before service dispatch. |
| 8 | `assertDelegation` | Delegated spending authority (finance paths) | `delegation` | Declared on financial mutations (see `siteExpense.create`, `vendorBill.create` seeds). |
| 9 | `financialGuard` (approval limits) | `createDomainRouter` finance procedures | `financial` | Approval-limit enforcement stays in the service; the stage blocks dispatch before it. |
| 10 | `assertNotLocked` (fiscal-year lock) | 20+ routers incl. all money paths | `fiscalLock` | Period freezes enforced pre-dispatch; typed `locked` error (tRPC `CONFLICT`). |
| 11 | `withIdempotency` (16 routers, money paths) | Wraps financial mutations | `idempotency` | Last stage before dispatch; the envelope REQUIRES a durable `requestId` for every mutation (validated pre-pipeline), preserving dedup semantics. |

Two inventory facts shape the registry discipline. First, **87.1% of mutations (350 of 402) are engine-mediated** — they delegate to domain engines (`ledger-entry`, `gantt-cpm`, `ipc-recalc`, `state-machine`, `daily-report-sync`), so adapter dispatch must call the same engine entry point, never a re-implementation. The registry therefore requires every binding to name its authoritative service, making an unfaithful mapping visible in review. Second, **41 direct-Prisma mutations (10.2%)** are simple CRUD; they adapt directly but keep the same guard discipline — the guard chain, not the engine wrapper, is what the adapter preserves.

## 3. Pipeline ordering and fail-closed rules

The stage order is fixed (`GUARD_ORDER`) and mirrors the effective evaluation order in the app: identity → tenant scope → rate limit → project membership → project permission → capability → input references → delegation → financial → fiscal lock → idempotency. Rationale: cheap identity/scope rejections run first; authorization stages run before payload-sensitive stages; side-effect protection (`idempotency`) runs last, immediately before dispatch, so a rejected request can never consume an idempotency key. Enforcement is mechanical, not conventional:

- A registry entry whose guards are out of pipeline order throws at construction (test: `misconfiguration: out-of-order guard declaration`).
- A registry entry without the `identity` stage throws at construction (test: `misconfiguration: operation without identity guard`).
- A declared stage with no implementation **fails closed** — dispatch is blocked with typed `internal` error rather than proceeding unprotected.
- Every rejection path returns before dispatch; tests assert `dispatches.length === 0` on each rejection (unauthenticated, tenant mismatch, rate limit, malformed mutation envelope, unknown operation).

## 4. Protocol versioning and compatibility rules

The adapter versions against the platform_contracts release policy: Git tags `platform-contracts/vMAJOR.MINOR.PATCH`, breaking schema changes require a new major plus an explicit migration plan. Recorded, testable rules (`resolveVersion`):

1. **Exact-pin resolution.** A request resolves only against a version the deployment explicitly serves. There is no silent minor upgrading: a client pinned to `1.0.0` talking to a deployment serving `1.1.0` is served `1.0.0` semantics exactly, because the deployment may declare both versions during an upgrade window.
2. **Major mismatch → typed rejection** (`version_unsupported`, tRPC `BAD_REQUEST`) with the served list attached; the client must upgrade.
3. **Unlisted minor/patch within a served major → typed rejection** with the served list; the client re-pins. This keeps "which schema am I bound to" answerable at any moment — the property the M02 drift-check CI established for the build side now holds for the request side.
4. **Malformed versions are envelope errors** (`malformed_envelope`), rejected before compatibility logic runs.

Current served set at contract level: `1.0.0` and `1.1.0` (per the platform_contracts CHANGELOG). Note for release hygiene: the git tag `platform-contracts/v1.0.0` exists; the `v1.1.0` release recorded in the CHANGELOG should be tagged in a follow-up chore PR so both served versions have pin targets — this task does not cut releases.

## 5. Operation mapping: seed exemplars

The seed registry (`src/registry.ts`) demonstrates the mapping discipline on real routers from the M00-T07 inventory. Each binding: operation kind, authoritative service (engine path from inventory §4), and guard set (from inventory §3 rows).

| operationId | Kind | Authoritative service (M00-T07 §4) | Guards declared |
|---|---|---|---|
| `fieldSubmission.submit` | mutation | field-submission ingestion (`daily-report-sync`, idempotency, audit-log) | identity, tenantScope, rateLimit, projectMembership, projectPermission, capability, inputReferences, idempotency |
| `siteExpense.create` | mutation | site-expense engine (financial-event-log, bank-balance, fiscal-year-lock, ledger-entry) | identity, tenantScope, rateLimit, projectMembership, projectPermission, capability, delegation, financial, fiscalLock, idempotency |
| `vendorBill.create` | mutation | vendor-bill engine (ledger-entry, financial-event-log, idempotency) | identity, tenantScope, rateLimit, projectMembership, projectPermission, delegation, financial, fiscalLock, idempotency |
| `worksheet.update` | mutation | worksheet engine (workbook revisions, ipc-recalc) | identity, tenantScope, rateLimit, projectMembership, projectPermission, fiscalLock |
| `ganttTasks.update` | mutation | gantt-cpm engine (schedule recalculation, baselines) | identity, tenantScope, rateLimit, projectMembership, projectPermission, fiscalLock |
| `dashboard.summary` | query | dashboard read service (aggregations) | identity, tenantScope, rateLimit, projectMembership |

These are exemplars, not coverage: full per-domain activation happens in later M03 tasks, and each activation PR must verify its guard set against the M00-T07 inventory row for that router (the inventory is the checklist of record). The seed registry test enforces that engine-mediated mutations declare `idempotency` or an explicit fiscal-lock boundary.

## 6. Test evidence and CI wiring

`packages/native_adapter/test/contract.test.ts` runs 17 `node:test` cases covering the M03-T01 acceptance matrix: supported versions accepted exactly; unserved minor and foreign-major versions rejected with served-list details; malformed envelope fields rejected (version shape, namespaced operationId, missing auth evidence, missing mutation `requestId`); authorization failures typed as `unauthorized`/`forbidden`/`rate_limited` with the tRPC code mapping asserted; and — the core preservation proof — **every rejection path demonstrates zero dispatches** to the authoritative service. The happy-path test asserts exactly one dispatch to the registered service string. Construction-time tests prove mis-ordered or identity-less registries cannot exist. CI runs the suite via `packages/native_adapter/tool/check.mjs` (pinned `typescript@5.9.3` compile + test) as a new step in the `lint_and_protocol` job of `client-ci.yml`, following the M02-T07 precedent of wiring package checks into the existing job.

## 7. Non-goals and follow-ups

- **No transport mount.** Wiring the adapter into the Next.js app (route handlers, session extraction, per-operation dispatch to actual services) is subsequent M03 work; the dispatch seam here is injectable precisely so the mount is thin.
- **No release cut.** Tagging `platform-contracts/v1.1.0` is a follow-up chore PR.
- **No domain activation.** Per-domain guard-chain activation PRs follow, each naming its change-feed integration and Flutter-parity path per standing constraint 3.
- **Rate-limit provenance.** The `rateLimit` stage is declared and typed here; when the adapter mounts, its implementation must bind to the server's existing rate-limit middleware (not a new policy), per v3 §5.1 and the one-owner-per-shared-contract rule (§9).
