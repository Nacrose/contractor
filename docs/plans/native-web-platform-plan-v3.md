# Native and web construction platform — agent implementation plan (v3)

Date: 2026-10-08 (Asia/Kathmandu). Inspection baseline: `7d80083e` plus the current working tree.

Status: **Plan only. Implementation has not started.** The user requested this plan after selecting a direction of Flutter across installed apps and web, local SQLite, shared performance-critical engines, and the existing cloud backend. Technology adoption remains subject to the performance and interoperability gate below. This document does not certify performance, parity, synchronization, or backup readiness.

**Revision v3 — 2026-10-08.** Seven corrections from a second review; v1/v2 text otherwise preserved. Summary:

1. **M01 fallback matrix split (§6):** implementation fallbacks remain pre-committed; product-scope changes (permanent separate React surfaces, platform-gated features, dropped browser targets) become evidence-and-proposal rows requiring an explicit user decision. The §1 parity gate holds until such a decision is recorded.
2. **Kernel governance replaces the bare Dart-first rule (§4):** per-engine decision records name the authoritative implementation, per-target execution/binding strategy, shared fixtures, and duplication status; architecture diagram updated to match.
3. **Fixed 2× threshold removed (§4, M01):** selection is by bounded comparative prototypes scored on performance, correctness, interoperability and maintenance cost.
4. **Cross-repository execution contract added (§4); charter supersession marked proposed (§1.1)** pending verification of the `contractor` repository, with an M00 verification task.
5. **LibreDWG license corrected to GPLv3** (not LGPL); the M01 DWG spike must inventory the existing TypeScript DWG reader (`src/lib/dwg/`).
6. **Maintenance-posture dashboard row relabeled "Defer / do not start"** (§6.0).
7. **Capacity gate fixed (§2.13):** bounded M00 discovery is exempt; the gate applies from M01. Effort bands remain provisional until supported by inventory and measured throughput (§6.0).
8. **Change-feed spike and sync contract now require durable consumer checkpoints and duplicate-delivery recovery** — PostgreSQL documents that logical decoding can replay changes after a crash (§3, §5.3, M00, M03, §8).

**Revision v2 — 2026-10-08.** Amendments applied after external review; v1 text is otherwise preserved. Summary of changes:

1. **§1.1 (new)** — this plan supersedes the clean-rewrite charter of the `contractor` repository; that repo is repurposed as the monorepo home; ADR-0010 records the pivot.
2. **§2** — new instruction 13 (document precedence and the Dart-first kernel rule).
3. **§3** — added the change-feed writer-coverage risk to the observed risks list.
4. **§4** — Dart-first kernel default; Rust adoption is a measured exception with a binding-ownership requirement; monorepo home named.
5. **§5.3** — change-feed sequencing mechanism is selected by the M00 spike and ratified as a decision record before M03.
6. **§6.0 (new)** — capacity envelope, maintenance posture, and ordered-magnitude effort bands to ratify in M00.
7. **M00** — added the change-feed mechanism spike and capacity-envelope ratification as exit-gate outputs.
8. **M01** — added the pre-committed fallback matrix, a dedicated DWG dependency spike, and made the Rust prototype optional per engine.
9. **M03/M04** — observability and sync telemetry moved forward from M11.
10. **§8** — observability verification row added. **§10** — ledger rows updated to carry the new evidence requirements.

---

## 1. Outcome and scope

Deliver one construction product with shared workflows and UX on macOS (Apple Silicon and Intel), Windows, Linux, Android, iOS, and the browser. Installed apps must support durable local work and background synchronization. The browser must offer the same construction features and synchronized records without installation. Mobile layouts adapt to screen and input size without quietly omitting capabilities.

The four priority engineering engines are CAD, worksheets/BoQ, PDF takeoff, and CPM scheduling. Field operations provide the first complete offline-to-cloud implementation. Existing contractor workflows, including billing, procurement, workforce, accounting, documents, and JV operations, remain part of final feature parity. Dashboard work stays last.

Success means tested behavior on declared hardware and file fixtures, not claims of zero latency, unlimited scale, full AutoCAD/Excel equivalence, indestructible local storage, or unrestricted mobile background execution. Unsynchronized work cannot survive loss of its only device. Cloud synchronization and disaster-recovery backups are separate systems.

### 1.1 Relationship to the clean-rewrite charter (v3: proposed, pending verification)

An earlier charter planned a greenfield Next.js rewrite in the `contractor` repository. The direction this plan implements — evolve-in-place client expansion over the existing backend, no backend-language or wholesale repository rewrite — is a deliberate move away from that charter. **However, the supersession is a proposal until the `contractor` repository state is verified**: its current charter text, commits, and working tree were not re-verified during the v2 review.

- **M00 verification task:** read the `contractor` repository (charter text, commits, working tree), confirm or rewrite its README charter to reference this plan, and record repository identities for the §4 cross-repository execution contract.
- Until verification, conflicting documents resolve in this order: the verified `Construction_Manager` sources, this plan, then the `contractor` charter.
- On verification: the `contractor` repository becomes the monorepo home per §4 (`apps/`, `packages/`, `crates/`, `fixtures/`, `benchmarks/`); inherited ADRs 0001–0009 remain in force; **ADR-0010** records the pivot decision.

## 2. Mandatory instructions for every implementing agent

1. Read the applicable `AGENTS.md`, [workspace rules](../../.agents/AGENTS.md), [design system](../DESIGN_SYSTEM.md), this plan, and the relevant engine sources before proposing edits. For Next.js changes, read the relevant guide in `node_modules/next/dist/docs/` before coding.
2. Treat the user's current authorization as the scope. This request authorizes preparing the plan; it does not authorize production migrations, publication, or replacing the application. Follow the workspace consultation rule when implementation starts. Do not repeatedly request permission for work already explicitly authorized.
3. **Find, extend, and converge on the central engine.** Do not create screen-specific calculators, offline queues, auth checks, document stores, importers, status machines, or component variants.
4. Name the existing engine, consumers, contract changes, and retirement path in each task. New packages must have a distinct responsibility that existing code cannot already fulfill.
5. Preserve existing uncommitted changes. During this inspection three drawing-page/viewer files were modified; re-check `git status` at the beginning of every task. Do not reset, overwrite, or attribute unrelated edits to this migration.
6. Keep server authority: tenant isolation, permission checks, approvals, fiscal locks, accounting and stock effects remain in existing server domain services and engines. A client preview never authorizes a financial posting.
7. Preserve domain invariants: contractual BoQ rate and rate-analysis cost are independent; exact financial rounding remains centralized; workforce identity is separate from login/access; accepted history is auditable.
8. Build interfaces around reusable contracts, not a speculative universal framework. Ordinary queries and preferences need not be forced through the financial/lifecycle engine; see [ADR-0006](../adr/0006-policy-aware-central-engine.md).
9. Introduce no permanent duplicate source of truth. Temporary TypeScript/Rust implementations are migration comparisons with an owner, fixtures, and a removal gate. No production dual-write business models or `V2` domain tables.
10. Perform a repository-wide consumer search after central changes. Include all transport entry points, jobs, imports, and background writers, not just the new client.
11. Do not interpret [ADR-0008](../adr/0008-clean-break-over-coexistence.md) as permission to discard current data: it explicitly covers the earlier operating-model redesign. Establish actual data classification before any destructive migration.
12. Report measured evidence and limitations. A mock test is not a device test; a build is not an installer test; configured backup CI is not a successful restore.
13. **(v3)** Document precedence follows §1.1. Kernel language follows §4: Dart-first is the working hypothesis; selection is by bounded comparative prototype with a per-engine decision record. The capacity envelope (§6.0) gates implementation milestones **from M01 onward**; bounded M00 discovery, spike, and ratification work is explicitly exempt.

## 3. Grounded reuse map

These are inspection findings, not a complete call-site or security audit. Reconcile source, tests, and documentation in milestone M00 before freezing capability claims.

| Engine | Existing source of behavior | Required evolution |
|---|---|---|
| CAD commands/document state | `src/lib/cad/editor.ts`, `command-registry.ts`, `command-types.ts`, `entity-ops.ts`, `geom.ts`, `layout-types.ts`, `plot-engine.ts`; `src/lib/dxf/`; `src/components/cad/` | Retain command vocabulary, entity identity, layouts and undo semantics; extract portable contracts, robust topology and bounded rendering. Flutter views must send engine commands, not modify entities. |
| Worksheet | `src/lib/worksheet/`: `spreadsheet-engine.ts`, `formula-engine.ts`, `workbook-recalc.ts`, `workbook-document.ts`, `workbook-structure.ts`, `virtual-grid.ts`, `workbook-excel.ts`, `workbook-save-queue.ts`; `src/components/worksheet/` | Preserve workbook format and tested editing semantics; introduce dependency-based recalculation and collaboration operations. `WorksheetDocument.version` is a starting point, not a complete collaborative protocol. |
| Document/takeoff | `src/lib/document-engine/`: `contracts.ts`, `measurement.ts`, `annotations/model.ts`, `pdf-session.ts`, `session-registry.ts`, `job.ts`; `src/server/routers/document.ts`; Prisma `Drawing`, `DrawingRevision`, `DrawingMarkup` | Extend one document session and measurement engine with platform renderer adapters, revision-aware calibration, persisted takeoff links, cancellation and resource budgets. |
| CPM and progress | `src/lib/cpm-engine.ts`, `calendar-snapshot.ts`, `nepal-calendar.ts`; `src/server/utils/gantt-cpm-engine.ts`; `src/server/services/scheduler/` | Preserve inclusive dates, calendars, lag-hour interpretation, constraints, actuals and retained logic; keep one calculation contract used by preview and authoritative server recalculation. |
| UX | `src/lib/ux/`; `src/components/ui/`; `docs/DESIGN_SYSTEM.md` | Define platform-neutral tokens and interaction contracts; implement one Flutter component library corresponding to the central React components. React components remain mandatory for existing React surfaces. |
| Policy/lifecycle/finance | `src/server/engine/`, `src/server/trpc.ts`, `src/lib/authz.ts`, `src/lib/permission-engine.ts`, `src/lib/rls.ts`, `src/server/utils/state-machine.ts`, `financial-scopes.ts`, `financial-event-log.ts` | Share authenticated domain entry points across tRPC and native APIs. No direct native SQL access to cloud PostgreSQL and no bypass of capability/financial procedure guards. |
| Field operations | `src/lib/field-entry-builders.ts`, `field-db.ts`, `field-outbox.ts`, `field-drafts.ts`, `field-photo.ts`; `src/server/routers/field-submission.ts`, `field-photos.ts`, `daily-report.ts`; `src/server/services/daily-report-sync.ts` | Keep existing submission and review semantics. Replace native persistence/replay with SQLite under a shared sync contract. `daily-report-sync.ts` normalizes report relations; it is not a device replication service. |
| Retry/events | `src/server/utils/idempotency.ts`, `outbox.ts`, `domain-events.ts`; Prisma `IdempotencyRecord`, `OutboxEvent` | Evolve durable command deduplication and transactional change capture. Existing worker outbox events are not an authorized client change feed. |
| Files/recovery | `src/server/stored-file-source.ts`, `stored-file-reconciliation-service.ts`, Prisma `StoredFile`; `scripts/backup/`, `docs/backup/`, `.github/workflows/backup.yml` | Reuse registry and checksums; add resumable device file transfer and device bootstrap. Complete independent vault and restore evidence; do not build a parallel backup framework. |

Observed risks to resolve explicitly:

- `field-db.ts` uses IndexedDB. `field-outbox.ts` has best-effort storage paths that swallow persistence errors. These semantics must not become native durability guarantees.
- `withIdempotency` currently defaults to a 30-day expiry. A command retried after that window must not repeat a financial effect. Preserve durable accepted-operation identity or refuse stale replay pending authoritative reconciliation.
- `OutboxEvent` is intentionally internal and is not protected as a client-facing RLS stream. Never expose it directly to devices.
- **(v2)** Server-side change capture for the sync feed currently exists only as internal `OutboxEvent` and `IdempotencyRecord`. Writer coverage across ~60 tRPC routers, imports, admin tools, and background jobs is unmeasured. The M00 spike (§6) must size writer instrumentation against WAL logical decoding before the M03 protocol freeze; the feed is the highest-uncertainty subsystem in this plan. PostgreSQL logical decoding can re-deliver changes after a crash unless consumer positions are durably confirmed, so durable checkpoints and duplicate-delivery recovery are part of the mechanism decision, not a downstream detail.
- Workbook recalculation creates a fresh evaluator/cache and scans workbook cells. Profile real formula graphs before choosing the incremental replacement boundary.
- `workbook-recalc.ts` includes array-spill behavior while `docs/native-spreadsheet.md` still lists some related functionality as missing. Source comments and feature lists are not parity evidence.
- `DrawingMarkup` persistence uses one-based page indices while document page APIs describe indexed pages separately. Freeze explicit page/rotation/coordinate conversions and test them.
- The README still describes online-first behavior while field offline code exists. M00 must produce an accurate current capability inventory.
- [Backup progress](../backup/progress.md) records unfinished coverage, vault configuration, live restore, device restore, and private-draft work. Keep these as release dependencies.

## 4. Target boundaries and dependency direction

```text
Shared Flutter application: routes, workflows, commands, views, design components
       |
Application services: use cases, document sessions, sync status, permissions display
       |
       +-- Portable engineering contracts --> shared kernels: one authoritative
       |        implementation per engine (Dart-first; Rust where measured),
       |        executed native (Dart or FFI), in Flutter web (compiled Dart),
       |        and on the server via its decided binding (Wasm/sidecar) or
       |        retained as the authoritative TypeScript implementation
       +-- Local repository contracts ------> SQLite + files on installed apps
       |                                     browser/cloud adapter on web
       +-- Sync client ---------------------> versioned authenticated API
                                                   |
Existing server domain services + policy/lifecycle/finance engines
                                                   |
                           PostgreSQL + registered object storage
                                                   |
                           independent backup and verified restoration
```

The existing Next.js web application remains operational during migration. It does not become an embedded WebView in the installed app. Flutter web replaces feature areas only after parity gates pass. Both clients use the same authoritative server paths during overlap.

**Monorepo home (v3):** the `contractor` repository hosts the artifacts below from the first commit (pending the §1.1 verification). The server stays in its current repository initially; do not combine this migration with a wholesale repository move.

Proposed additions, created only when the owning milestone needs them:

| Location | Responsibility |
|---|---|
| `apps/construction_client/` | Flutter application and platform runners; no domain formulas in widgets |
| `packages/platform_contracts/` | Versioned transport/operation schemas and generated bindings; choose one canonical schema format in M01 |
| `packages/construction_ui/` | Shared Flutter design system and command-driven engineering controls |
| `packages/construction_application/` | Flutter application services and repository interfaces |
| `packages/construction_platform/` | Native/web implementations for persistence, files, credentials, jobs and kernel bindings |
| `crates/construction_core/` | Portable geometry, worksheet and scheduling modules introduced incrementally; no OS or database dependencies |
| `crates/construction_ffi/`, `crates/construction_wasm/` | Thin bindings around the same portable core; no duplicate algorithms |
| `fixtures/platform-parity/` | Versioned input/output and operation-sequence fixtures derived from current engines and reviewed expected behavior |
| `benchmarks/platform/` | Reproducible data generators, sanitized file manifests, harnesses and measured results |

Keep the server in its current location initially. Do not combine this migration with a wholesale repository move or backend-language rewrite. Server use of Rust must have a deployment-compatible binding (for example a verified Node/Wasm integration), tested before retiring its TypeScript calculation. No Rust migration solely to satisfy a language preference.

### Cross-repository execution contract (v3)

Two repositories participate: `Construction_Manager` (server, PostgreSQL access, React application, existing CI and backup) and `contractor` (Flutter application, shared packages, kernels, fixtures, benchmarks — pending §1.1 verification). Agents must not copy engine or domain source between repositories; cross-repo consumption happens only through versioned contracts:

- **Contract artifact and versioning.** One canonical schema format (chosen in M01) lives in `packages/platform_contracts/`. Generated TS/Dart/Rust bindings are committed artifacts. Every interface change is a versioned release (git tag + changelog entry) verified by generation-drift checks.
- **Dependency pinning.** The server pins exact contract releases (tag or commit hash), never a floating branch. Bindings regenerate only as part of a contract release, never ad hoc.
- **Cross-repository compatibility CI.** A workflow in `contractor` checks out `Construction_Manager` at the pinned contract ref and runs the shared fixture suite plus binding-drift checks; a matching job in `Construction_Manager` validates its exported surface against the pinned contract version. A release that breaks either side fails CI and is blocked.
- **Native API adapter boundary (M03).** The native-facing adapter is defined against the contract version, not against tRPC internals, so a contract release cannot silently break device clients.
- **Repository identities are recorded in M00** (§1.1 verification task) before any package is created.

### Kernel governance (v3)

**Dart-first remains the working hypothesis, not a gate.** New calculation kernels start from Dart, but language is a measured engineering decision per engine, and the deeper requirement is that each engine has exactly one authoritative calculation semantics wherever it runs.

**Selection is by bounded comparative prototype.** For each engine, within a timebox ratified in M00/M01, prototype the plausible candidates — e.g. (i) a focused Dart implementation, (ii) an existing library where one exists, (iii) a Rust port where profiling justifies — and score them against:

- performance against the ratified budget on the declared minimum hardware — a candidate that misses the budget outright still enters the comparison if a binding strategy could close the gap within the timebox; there is no fixed multiplier that qualifies or disqualifies;
- correctness against the shared fixture set (§5.1);
- interoperability cost across the required execution targets (native, Flutter web, server);
- maintenance and licensing cost.

**Per-engine decision record (required before any screen depends on the engine)** must name:

- the **authoritative implementation** — the single source of calculation semantics;
- **execution targets and binding strategy per target** — native (Dart directly, or FFI), Flutter web (Dart compiles to the browser; no bridge), and the server (Wasm-in-Node, an AOT sidecar/service, or a retained TypeScript implementation);
- the **shared fixture set** that proves equivalence everywhere the engine runs;
- **duplication status** — exactly one of: a single implementation for all targets; a temporary duplicate governed by instruction 9 (named owner, fixtures, removal gate); or an explicitly accepted permanent exception with recorded rationale.

Expected outcome unchanged: the worksheet recalculation engine is the strongest binding-heavy candidate for a non-Dart kernel; CPM is expected to remain server-authoritative TypeScript with any client-side port governed as a temporary duplicate under instruction 9; adopting zero Rust kernels is an acceptable, pre-approved outcome if budgets are met.

### Cross-platform rules

- One widget/workflow implementation wherever possible; native and web adapters carry platform differences. Avoid `isWeb` branches scattered through domain logic or pages.
- Native FFI cannot simply run in a browser. Verify the same core through the browser Wasm binding and worker execution path. Dart isolates are not assumed available in Flutter web; cancellation and message ordering need explicit browser tests.
- A Rust calculation library does not automatically provide a GPU renderer. Rendering is a separately measured adapter consuming compact geometry/layout results. Avoid per-cell or per-vertex bridge calls; batch geometry and layout results across the boundary.
- Select PDF rendering, DWG conversion, fonts, printing and spreadsheet format dependencies only after desktop/mobile/web support, licensing, fidelity and offline behavior checks. A cloud-only converter cannot satisfy native offline file editing.
- Native SQLite and native files provide the offline contract. Browser storage may be used as an optimization, but web correctness must not depend on cache durability or service-worker execution. Preserve the requested online, zero-install web workflow.
- Match commands, data, outcomes, design tokens and feature availability. OS file dialogs, printer selection, permissions and mobile layouts remain platform adaptations. Browser shortcuts reserved by the OS/browser need an equivalent menu action.

## 5. Contracts to establish before screens

### 5.1 Engineering document contract

Version documents, operations, schemas and calculation semantics separately. Define stable document/entity/sheet/row/column identities, units, coordinate systems, precision, ordering, command errors, resource ownership and cancellation. Do not use display positions or array indices as durable collaboration identity.

Document mutations go through a command dispatcher. Commands yield a new revision, bounded patches, derived invalidations and undo metadata. Views subscribe to affected regions; they do not serialize/recalculate the entire document on selection or pointer movement. Collaboration undo is a compensating command against current state, not restoration of an old full-document snapshot that erases others' edits.

Financial amounts cross language boundaries as exact decimal strings or explicitly scaled integers. Generic spreadsheet numeric semantics remain separately specified for Excel compatibility. Geometry uses documented tolerances; date-only construction/calendar values remain date-only, with explicit UTC instant types for audit events. Test Nepal dates and existing inclusive scheduling conventions.

### 5.2 Local durability contract

- A native save succeeds only after the SQLite transaction commits both the local mutation and its pending operation. Never acknowledge on a statement callback before transaction completion or suppress disk-full errors.
- Configure and verify SQLite journaling/synchronization, busy handling, migrations, indexing and interruption recovery. WAL alone is not proof of durable writes. Prefer one bounded write coordinator and explicit read snapshots.
- Store photos and documents outside cache directories. Stage bytes, compute digest, durably finalize the file, then register it; recover interrupted file/DB transitions through a reconciliation journal. Never claim cross-filesystem/SQLite atomicity.
- Separate databases or enforce equivalent tested isolation per account/organization. Use platform credential stores; define at-rest encryption and recoverable key policy before sensitive local rollout.
- Pending operations, original attachments and private drafts cannot be evicted as disposable cache. Define disk budgets and eviction only for reproducible server-backed data.
- Logout, account switch and local database reset must surface unsynchronized work. Do not silently upload private drafts or delete them. Explicitly define which saves are private/local and which are project-shared; synchronize project work by default once the user chooses that workflow.

### 5.3 Synchronization contract

Use typed domain commands, not arbitrary table replication or raw tRPC-path replay. Required envelope concepts: protocol version, operation ID, device ID, claimed organization/project scope, command type, entity ID, expected revision, dependencies, payload digest and payload. Derive actual actor/authority from server authentication, never those claims.

Server command pipeline:

1. Authenticate device/user; check current membership, project scope, capability and replay-result visibility.
2. Validate command schema and bounded payload. Same operation ID with a different digest is an error.
3. Serialize against relevant entity versions and deduplication scope. Define durable operation receipt retention beyond ordinary result-cache TTL.
4. Execute the existing domain service, policy and financial guards in the tenant-scoped transaction. Apply lifecycle, stock and ledger side effects exactly once within that transaction.
5. Commit mutation, operation receipt and sync-visible change atomically. Acknowledge only after commit. Network delivery remains at-least-once; the business effect is deduplicated.
6. Notify connected clients to pull durable changes. Push/WebSocket notifications are hints, not the source of truth.

Response states distinguish accepted, previously accepted, conflict, validation rejected, access revoked, authentication required, dependency blocked and retryable failure. Preserve rejected input and remediation information. Do not retry permanent failures indefinitely or pretend a queued financial submission is posted.

Change feed requirements:

- Capture every relevant writer: existing web mutations, native commands, imports, admin tools and background jobs. A native-only feed is incomplete.
- Define project/organization visibility filters and field redaction. Apply current authorization to snapshots, pages, operation receipts and attachments.
- Establish a commit-safe cursor. A naive auto-increment event ID can skip a transaction that commits late. Select and prove a scoped transactional sequencing mechanism or equivalent commit-ordered stream; include out-of-order commit tests and contention benchmarks. **(v3)** The concrete mechanism — writer instrumentation, WAL logical decoding, or a hybrid — is selected by the M00 spike (§6, M00) and ratified as a named decision record before M03 begins. The decision record must include (a) the failure/rollback story for the chosen mechanism (for example, replication-slot retention monitoring on Neon), and (b) the **durable consumer checkpoint design and duplicate-delivery recovery**: the feed is at-least-once, and PostgreSQL documents that logical decoding can replay changes after a crash, so consumers must durably store their position and deduplicate re-delivered batches.
- Snapshot/bootstrap and its watermark must represent a consistent state. Apply each downloaded batch and cursor in one local transaction. Page results with bounded bytes and deterministic ordering.
- Keep tombstones, scope-removal events and a retention policy. An expired cursor triggers safe rebootstrap while preserving pending local work, not silent gap skipping. Adding project access must bootstrap existing records, even if they have not recently changed.
- Support version negotiation and a minimum supported protocol. Preserve pending commands during upgrades. A clock timestamp is metadata, never conflict authority or a sole change cursor.
- Use bounded retries with jitter, dependency ordering, network/power awareness and resumable attachment transfers. Resume on app launch/foreground/manual sync as well as OS background opportunities.

### 5.4 Conflict and collaboration contract

| Data class | Required policy |
|---|---|
| Independent field submissions | Preserve both with stable IDs; reuse `FieldSubmission` review/confirmation flows |
| Ordinary record edits | Compare expected revision; merge disjoint fields only under an explicit domain policy; show conflicting values otherwise |
| Money, stock, approvals | Server serializes and validates; never last-write-wins; corrections follow existing reversal/amendment rules |
| Worksheet cells | Stable sheet/row/column identities plus cell/property revisions; disjoint edits can compose; overlapping edits preserve a conflict |
| Worksheet structure | Ordered insert/delete/move operations and tested reference transformations; no full-workbook blind replacement |
| CAD entities | Entity revisions; independent edits compose; topology-changing/group operations validate their whole affected set atomically |
| Takeoff/calibration | Version measurement and calibration together; revision changes invalidate/review derived quantities rather than silently rebasing |
| Gantt | Version task/dependency/calendar commands; server revalidates graph, constraints and downstream calculation |

Start with server-ordered operations and explicit conflict resolution, not a generic CRDT over financial/domain objects. If a collaborative transform or CRDT becomes necessary for a particular document type, document its semantics, failure cases and migration before adoption. Presence/selection indicators are ephemeral and never authorization. Leases can improve online UX but cannot prevent offline edits; correctness relies on version validation.

Old clients using snapshot saves must participate in version checks or be denied writes to migrated document types. Never allow a legacy full-document save to erase accepted granular operations.

## 6. Milestones and exit gates

Each milestone produces a bounded reviewed change and evidence. Milestone labels are sequencing units, not time estimates. Do not mark later milestones complete because a scaffold compiles.

### 6.0 Capacity envelope and maintenance posture (v2, new)

The plan deliberately avoids time estimates, but a solo-capacity effort with a live production application cannot schedule honestly without them. The bands below are **provisional ordered-magnitude planning figures**: they are ratified or corrected in M00 and remain provisional until the inventory and, later, measured throughput (M04 re-baseline) support them. They are not commitments; they assume one developer with AI-assisted tooling working full-time on this effort. If actual throughput after M01 and M04 diverges materially from the ratified bands, re-baseline the remaining ledger rather than compressing exit gates.

| Milestone | Band | Note |
|---|---|---|
| M00 inventory & fixtures | 2–4 weeks | Consumer sweep is large; timebox the change-feed spike to 1–2 weeks |
| M01 platform gate | 4–8 weeks | Includes fallback-matrix execution |
| M02 contracts & shared UX | 4–8 weeks | |
| M03 identity, storage, sync | 8–16 weeks | Hardest subsystem; includes the change-feed build-out |
| M04 first vertical slice | 4–8 weeks | |
| M05 field workflow expansion | 6–10 weeks | |
| M06 worksheet/BoQ engine | 10–20 weeks | Largest single engine |
| M07 CAD kernel & plot | 12–24 weeks | |
| M08 PDF takeoff | 6–12 weeks | |
| M09 scheduling engine | 8–16 weeks | |
| M10 parity & web migration | 12–24 weeks | Long-tail; overlap tax peaks here |
| M11 recovery, packaging, release | 6–10 weeks | Backup groundwork starts earlier per M11 |

**Order of magnitude:** the full program is realistically a multi-year effort. This is acceptable only with the maintenance posture below made explicit; otherwise the existing application decays during the overlap and the migration competes with customer work indefinitely.

Maintenance posture during the migration (ratify in M00, revisit at M04 and M10):

| Posture | Scope |
|---|---|
| **Maintain** (security and correctness fixes continue immediately) | Auth/session, RLS and tenancy, financial guards and ledger correctness, backups and restore evidence, dependency CVEs via the existing CI gates |
| **Freeze** (critical fixes only, no new features) | React CAD/drawings UI, React worksheet UI, React Gantt UI, and other surfaces with an approved Flutter successor path |
| **Continue** (normal iteration until explicitly replaced) | Daily reports and field PWA until M05 drains existing drafts, billing/procurement/HR workflows until their M10 migration, admin and people-access tooling |
| **Defer / do not start** | Analytical dashboard work (stays last per §1) and new React feature areas without a Flutter migration path — do not begin these during the migration |

New server-side domain features accepted during the overlap must state in their task packet how they will join the change feed and reach Flutter parity (§10 ledger tracks this as a standing constraint).

### M00 — Inventory, behavior fixtures and baseline

Dependencies: none. Starting owner: repository/domain architecture agent role.

- Inventory every route, server mutation, job, import, local draft store, document format and user-visible workflow. Map each to its central engine, current tests and target platforms.
- Record the current feature matrix as implemented/partial/missing/unverified. Separate existing-product parity from requested additions and full third-party application compatibility.
- Capture representative CAD, worksheet, PDF and CPM fixtures; sanitize project data and record hashes, sizes, units and licensing. Include adverse/degenerate inputs.
- Establish reference outputs from existing tests plus independently reviewed domain expectations; do not preserve known bugs just because existing code emits them.
- Profile current performance and record actual hardware, builds and datasets. Record baseline failures without silently weakening tests.
- Define OS/browser versions, Intel macOS coverage, minimum hardware, disk budgets and offline retention expectations before release commitments.
- **(v3) Change-feed mechanism spike (timeboxed 1–2 weeks).** Prototype and compare (a) explicit writer instrumentation across routers/jobs/imports versus (b) WAL logical decoding (or an equivalent commit-ordered stream), against: commit-order correctness under late commits, full-writer coverage without touching ~60 routers, visibility/redaction filter feasibility, Neon compatibility and replication-slot retention risk, operational monitoring, **and durable consumer checkpoints with duplicate-delivery recovery — PostgreSQL documents that logical decoding can replay changes after a crash, so the spike must demonstrate checkpoint durability and idempotent re-application of re-delivered batches**. Output: a decision record naming the mechanism, its checkpoint/replay design and its failure/rollback story, consumed by M03. If neither mechanism survives, M03's sync design must be revisited before any protocol freeze.
- **(v2) Ratify the capacity envelope (§6.0):** confirm or correct the provisional effort bands against the completed inventory, freeze the maintenance-posture table, and name what is frozen/continued. Ratify the initial performance budgets in §7 against declared hardware.
- **(v2) Draft ADR-0010** (§1.1) and amend the `contractor` README charter.
- **(v3) Verify the `contractor` repository** (charter text, commits, working tree) and complete the §1.1 proposed supersession: confirm or rewrite its README charter to reference this plan; record repository identities for the §4 cross-repository execution contract.

Exit: reviewed engine/consumer inventory, behavior matrix, reproducible baseline, ratified change-feed mechanism and capacity envelope, and no unsupported claim that the current app already meets the new platform requirements.

### M01 — Platform feasibility and performance gate

Dependencies: M00. Scope: disposable but reproducible technical prototype using shared components/contracts, not production screens.

- Pin a compatible Flutter/Dart/Rust toolchain and license-reviewed binding strategy. Build desktop, Android, iOS and browser targets; cross-platform CI may provide unavailable host coverage.
- Run the same representative virtualized worksheet, CAD viewport and PDF measurement interactions in Flutter desktop and Flutter web. Include text input/IME, selection, clipboard, fonts, keyboard shortcuts, accessibility and print/export behavior.
- **(v3) Kernel comparative prototypes (§4):** within the ratified M01 timebox, prototype the candidate implementations per engine — a focused Dart implementation, an existing library where one exists, and a Rust port where profiling justifies — and score each on performance against ratified budgets on minimum hardware, correctness against shared fixtures, interoperability across execution targets, and maintenance/licensing cost. No fixed multiplier qualifies or disqualifies a candidate. Adopting zero Rust kernels remains an acceptable outcome.
- **(v3) DWG dependency spike (dedicated).** Evaluate offline DWG/DXF read (and write where required) on every target platform as its own line in the capability matrix, not a footnote alongside PDF/XLSX. The spike must (a) inventory the existing TypeScript DWG reader (`src/lib/dwg/`, including `dwg-native.ts`), which already handles older DWG generations — conversion is not entirely external — and evaluate extending it versus external converters per platform, and (b) record the version coverage and **GPLv3** licensing implications of the existing libredwg-based converter (out-of-process isolation or commercial alternatives as mitigations). Record gaps, costs and platform constraints.
- Prove native SQLite survives process termination; prove browser startup and data access work without native plugins or a local server.
- Evaluate PDF/DWG/XLSX dependencies against the capability matrix. Record gaps, costs and platform-specific constraints instead of selecting a package by name alone.
- **(v2) Execute the fallback matrix below** and record the outcome per row.

Exit: measured report and architecture decision accepting the stack, or a documented redesign before a broad rewrite. No production cutover if browser parity, native storage or cross-language semantics fail.

#### M01 fallback matrix (v3)

Decide these outcomes **now**, before prototyping, so a failed gate is a route adjustment rather than a crisis. Each row is executed only if its gate fails; every outcome is recorded in the M01 report and, where it changes architecture, in an ADR. **Two row types (v3):**

- **Implementation fallback (pre-committed):** an implementation choice inside the agreed scope — executes automatically when its gate fails.
- **Product-scope proposal (explicit decision required):** a change to the §1 product outcome (which platforms get which features). These are **not pre-authorized**: the row produces evidence and a written proposal, the §1 parity outcome stands, and the affected gate remains in force until the user accepts the scope change.

| Gate | If it fails | Outcome |
|---|---|---|
| Flutter web engineering-engine performance (worksheet/CAD/PDF on browser) | Browser never reaches ratified budgets | **Product-scope proposal (decision required).** Evidence-based proposal: retain the React web app for engineering surfaces and ship Flutter installed-apps-only; M06–M09 would proceed as native+server milestones with React web retained. Until decided, browser parity remains an M06–M09 exit requirement and the affected engines keep a browser target. |
| Flutter web field-ops performance (M04-class workflows) | Field workflows fail on browser | **Product-scope proposal (decision required).** Proposal: drop Flutter web; installed apps + React web only; sync client still required for installed apps. Until decided, the browser target stands. |
| Native performance on declared minimum device (after algorithm-level work) | Ratified budgets missed with profiling evidence | **Implementation fallback (pre-committed).** Enter the §4 comparative-prototype decision for that engine (Dart optimization, existing library, Rust port); if no candidate meets the budget, renegotiate budgets with a recorded decision — never silently lowered. |
| Offline DWG read/write adequacy or licensing | No acceptable dependency path | **Product-scope proposal (decision required).** Proposal: native CAD editing scopes to DXF plus the existing TypeScript DWG reader's coverage; DWG via documented conversion or viewing-only, recorded as an explicit product limitation. Until decided, DWG support remains scoped as inventoried in M00. |
| PDF rendering/measurement dependency coverage on a platform | A platform lacks an acceptable dependency | **Product-scope proposal (decision required).** Proposal: per-platform capability matrix with takeoff limited to supported platforms — no hidden degradation. Until decided, takeoff remains required on all §1 platforms. |
| Native SQLite durability proof on any target | Durability cannot be proven | **Implementation fallback (pre-committed).** Stop. Fix or replace the storage approach before any M03 work; no workaround claims. |
| Cross-language semantics (decimal/geometry/date) across FFI/Wasm/server | Parity fixtures disagree | **Implementation fallback (pre-committed).** That engine keeps a single authoritative implementation in its server language (no Rust adoption for it); clients access it through the decided binding/serving strategy (§4). |

### M02 — Central contracts and shared UX foundation

Dependencies: M01 accepted.

- Establish canonical operation/document schemas and generated TS/Dart/Rust bindings with generation-drift checks. Reuse existing schemas/registries where suitable; do not hand-maintain three equivalent enums or permission vocabularies.
- Implement central Flutter equivalents of `ConstructionTable`, `ActionBar`, `StatusBadge`, dialogs, query/error/empty/loading states, currency formatting and action coordination. Preserve design-system rule IDs and derive platform tokens from one canonical source.
- Keep financial formatting/calculation distinct. Port only presentation formatting to Dart; authoritative financial arithmetic stays centralized.
- Define local-save busy versus cloud-sync pending behavior centrally. A background upload must not hold the entire app inert. Amend the design-system action contract once if necessary; do not bypass it per page.
- Add shared route/command and feature-capability registries. Include responsive layouts, semantic accessibility and keyboard navigation.

Exit: native/web component contract tests and accessibility checks pass; no production feature cutover and no per-screen alternative primitives.

### M03 — Native identity, repositories and sync engine

Dependencies: M02.

- Add a versioned native-facing API adapter around existing domain services. Inventory and preserve all guards currently supplied by tRPC middleware when extracting services.
- Design native login/session rotation/revocation, system-browser login if selected, secure credential storage and device registration. Keep browser httpOnly-cookie/CSRF protections; do not weaken origin checks globally for native clients or embed secrets in binaries.
- Implement the local transaction/outbox contract, schema migration/recovery, account isolation, private-draft behavior and corruption/disk-full handling.
- Extend existing idempotency and event infrastructure with durable operation identity and an authorized commit-safe incremental feed. Migrate all writers for the pilot domain in the same release. **(v3)** Build the feed on the mechanism selected by the M00 spike (§5.3, M00), including its durable consumer checkpoints and duplicate-delivery recovery design; per-domain receipt retention is configurable, and financially effective commands retain durable receipts beyond the 30-day default with compaction rather than expiry-driven replay risk.
- Implement snapshot bootstrap, cursor persistence, tombstones, dependency handling, attachment staging/retry and foreground/background sync orchestration.
- Separate local persistence, server acceptance, attachment completion and independent backup states in the shared status model.
- **(v2, moved forward from M11) Wire observability now:** Sentry (or equivalent) for Dart, native and Rust panic surfaces; server-side sync API metrics; and a device sync-health surface exposing pending-operation count, oldest pending age, last-accepted cursor per scope, and rejection reasons. These are development dependencies of M04 evidence, not release polish.

Exit: real SQLite + disposable PostgreSQL tests prove no lost accepted operation, no duplicate business effect, no cross-tenant disclosure and safe recovery at each transaction/network failure boundary. No use of mocks as the sole durability evidence. **(v2)** Sync telemetry visible end-to-end.

### M04 — First vertical workflow: daily log and photo

Dependencies: M03.

- Use existing daily-report schemas, builders, permissions and side-effect services. Trace whether any side effect needs central transaction changes before calling it through the new adapter.
- Implement one complete shared Flutter native/web workflow: select project, create/edit log, attach photo, save locally on native, sync, view accepted data in the current web app and on a second device.
- Test simultaneous office edit, permission revocation, expired login, app termination, reboot, disk full, slow/absent network, lost acknowledgment and incomplete photo upload.
- Demonstrate local pending data is retained through rejected sync and that a new device can restore accepted records and registered photos.
- **(v2)** Capture real-device telemetry (sync latency, battery/background behavior, crash-free rate) as part of the evidence package; re-baseline the capacity bands against measured throughput.

Exit: device-recorded workflow evidence, automated fault tests, parity with current daily-log rules and user verification. This milestone proves the system architecture; it is not a complete platform release.

### M05 — Extend field workflows through the same engine

Dependencies: M04.

- Add attendance, petty cash, MRR/delivery submissions and field photos via the same repositories, typed commands and sync status components.
- Reuse `field-submission.ts` office review and existing site-expense/material resolvers. Confirmation and approval remain distinct where currently required; preserve original actor and edited payload audit history.
- Define duplicate attendance rules and field capture timestamps centrally. Do not trust device time for authority, posting sequence or approvals.
- Use native camera/files and OS scheduling adapters. Persist scheduling state; foreground recovery must work when background execution never ran.
- Plan explicit export/import or safe draining for existing browser drafts/queues before retiring field PWA code. Preserve their operation IDs; no blanket IndexedDB deletion.

Exit: each workflow passes the same crash/replay/permission contract suite and native/web outcome tests; unsynchronized work cannot disappear during migration.

### M06 — Worksheet/BoQ engine migration

Dependencies: M02, M03; M01 file/compute feasibility accepted. May be developed before M05 completes, but integrated rollout waits for the shared sync gate.

- Evolve the current workbook model, command semantics, structure transforms, names, formatting and formula registry. Define versioned migration of positional references into stable collaboration identities without changing displayed A1 behavior.
- Implement a dependency graph, dirty propagation, cycle/error handling and bounded/cancellable recalculation. Define volatile functions, random/time inputs and external-reference behavior so server/native/web results agree.
- Port calculation modules to the shared core only with differential fixtures and a verified server binding. Keep imported formulas/formatting and known unsupported features visible; no silent lossy export.
- Implement one virtualized Flutter grid consuming engine viewport/layout output; no widget per workbook cell and no recalculation triggered by scrolling.
- Add cell/structure operations, version checks, compensating undo, conflict review, workbook compaction/checkpoints and IPC/BoQ integration through existing financial services.
- Preserve XLSX compatibility through byte round-trip tests and independently checked representative files. Existing Excel gaps remain tracked work, not silently declared solved by a port.

Exit: agreed feature matrix, native/web/server calculation parity, concurrent edit/structure tests and 50k/100k-row workload evidence. Retire redundant production evaluators only after all consumers switch.

### M07 — CAD kernel, topology, rendering and plot

Dependencies: M02, M03 and M01 file/compute gate. Shares operation substrate with M06.

- Preserve the central command registry and input state machines: command line, aliases, numeric/relative input, cancel/repeat, selection, grips, snap, ortho, units, undo and layouts.
- Implement robust shared topology primitives: segment/curve intersections, connectivity, splitting/joining, offsets, polygon validity, holes and tolerance policy. Include large survey coordinates, near-coincident points and degeneracies.
- Add spatial indexing and invalidation; produce bounded visible geometry batches for the renderer. Benchmark text, hatches, blocks, dimensions, selection and snapping, not only simple lines.
- Preserve entity IDs across imports/edits where defined. Import fidelity, unsupported objects and DWG conversion requirements are explicit; never claim AutoCAD parity from command labels alone. **(v2)** Consume the M01 DWG spike outcome; the DWG product limitation, if any, ships documented.
- Implement model/paper space, viewports, scale, lineweights, fonts and vector PDF plot through one layout/plot engine and platform file/print adapters.
- Integrate entity/group operation revision checks and conflict resolution. Block topology-breaking partial group acceptance.

Exit: command/geometry/plot fixture parity, file compatibility matrix, bounded memory and CAD interaction benchmarks on native/web. Broader AutoCAD parity remains gated by the full command/format matrix, including any missing 3D or advanced features.

### M08 — PDF and BoQ-linked takeoff engine

Dependencies: M02, M03; M06 BoQ linking contract; M07 reusable geometry primitives as needed, not the entire CAD UI.

- Extend existing document sessions with renderer adapters, viewport tiling, bounded decoded-page cache, cancellation and explicit disposal. Never rasterize every page eagerly.
- Persist revision/page/crop/rotation/calibration provenance and vector measurement geometry. Cover area with holes, polyline length, perimeter, unit conversion and counts; reject invalid geometry.
- Establish a first-class takeoff-to-BoQ link using existing models where they fit. Quantity changes go through one domain integration path; no direct BoQ cell mutation from a drawing widget.
- Recalibration/revision changes mark affected measurements and downstream quantities for review. Prevent double counting repeated links or replayed measurements.
- Validate multi-page, rotated, mixed-size and scanned blueprints; vector overlays do not imply automatic extraction of all PDF geometry.

Exit: identical measurement results and linked quantities across native/web/server, preserved source provenance, conflict behavior and representative large-PDF performance.

### M09 — Scheduling, site progress and cash-flow engine

Dependencies: M03, M05, M06; portable core substrate from M01/M02.

- Evolve `cpm-engine.ts` semantics through shared fixtures before porting: calendars/holidays, inclusive dates, milestones, FS/SS/FF/SF, lag hours, constraints, actuals, retained logic, float and leveling floors.
- Treat calendars, data date, rates and progress as versioned calculation inputs. No ambient device timezone/holiday cache changes to authoritative results.
- Reuse scheduler progress/cost/approval services and preserve contractual BoQ versus RA cost separation.
- Implement one virtualized Gantt view and typed schedule operations. Offline schedules are local proposals until server acceptance; graph cycles/conflicting dependencies are surfaced.
- Preserve immutable baseline/version concepts and explain recalculation changes before applying regulated/approved schedule updates.

Exit: native/web/server schedule results agree, progress cannot post twice, cash-flow uses the correct rate source and large-graph edits remain responsive.

### M10 — Full feature parity and web migration

Dependencies: M04–M09 and the M00 inventory.

- Migrate remaining contractor workflows through shared components and existing server domain services. Track every inventory item; four engineering engines alone are not full application parity.
- Introduce one route at a time with one active writer contract per entity/document version. Do not duplicate authoritative business logic or silently downgrade old clients.
- Verify role-based visibility, imports/exports, print fidelity, file links, search, errors, keyboard behavior, accessibility, screen sizes and localization on both Flutter web and installed apps.
- Validate deep links and session transitions between remaining Next.js areas and Flutter web. Keep deployment paths, asset caching and rollback explicit.
- Remove superseded React UI only after accepted feature equivalence and rollback evidence. Preserve Next.js backend functionality until deliberately migrated; a frontend replacement is not permission to delete server routes.

Exit: every agreed inventory item has passing platform evidence or an explicitly accepted scope decision. Browser feature omissions cannot be hidden behind an installation prompt.

### M11 — Recovery, packaging and staged release

Dependencies: start backup/packaging groundwork after M01; final release requires M03–M10 evidence.

- Complete existing backup coverage and independent vault retrieval/restore work. Restore database plus registered original/served objects into an isolated environment and validate tenant isolation and references.
- Define and measure RPO/RTO, key escrow, retention, failed-backup alerts and operator procedures. A cloud-accepted record is not automatically evidence of an independent backup.
- Test fresh-device bootstrap, database migration interruption, application downgrade rejection, local corruption, revoked devices and expired change-feed cursors.
- Build/sign/notarize macOS Intel/ARM64 DMGs, Windows installers, Linux AppImage/deb and Android/iOS distribution artifacts on supported runners. Store signing material only in release infrastructure.
- Implement signed update verification, staged rollout, schema/protocol compatibility and a recovery path for failed upgrades. Rollback must not destroy pending commands or apply an old binary to an incompatible local schema.
- Test installation, upgrade, uninstall behavior and real-device background restrictions. Ship through an internal pilot, then controlled wider rollout with sync/performance/error observability.
- **(v2)** Confirm the observability stack from M03 covers release channels (staged-rollout dashboards, crash-free sessions per platform, sync-lag and rejected-command alerts) before pilot expansion.

Exit: measured recovery drill, validated platform packages, full parity evidence, monitoring and user-approved release. Do not publish or push merely because a build succeeded; preserve workspace requirements for user build verification before pushing.

## 7. Performance acceptance and measurement

The following are **proposed initial budgets**, not measured results or promises. M00/M01 must select hardware, freeze fixture details and ratify budgets before implementation is accepted. Do not loosen a failing budget without a recorded explanation and decision.

| Workload | Initial acceptance target |
|---|---|
| Native field save, excluding attachment byte copy | p95 committed local save at or below 50 ms on the declared minimum device |
| Warm local project navigation | p95 usable content at or below 250 ms; no network dependency |
| Supported 60 Hz engineering viewport | p95 frame time at or below 16.7 ms; report p99, missed frames and input latency too |
| Optional 120 Hz mode | p95 frame time at or below 8.3 ms on explicitly supported hardware; not a universal promise |
| Ordinary cell edit | p95 input response at or below 50 ms; dependent calculation runs separately with visible pending status if slow |
| BoQ | 50k and 100k rows, fixed columns/style density/formula graph; viewport work scales with visible cells, not total rows |
| CAD | 100k and 1m entities with declared mixes of blocks, text, hatches and curves; report render/snap/select separately |
| PDF | Declared 100+ page / 200 MB fixture, plus dense single pages; bounded decoding and cancellation, first-page and warm-page timings reported |
| CPM | 10k tasks / 50k dependencies with calendar and constraint variants; calculation latency reported separately from responsive interaction |
| Online collaboration | Proposed p95 accepted-change visibility within 2 seconds under declared RTT/load; mobile suspended state excluded |
| Stability | One-hour repeated editing/import/export/sync run with no unbounded memory or handle growth |

Record peak and steady memory including renderer, Wasm/FFI buffers and decoded documents; do not report only Dart heap. Set numeric per-device memory/startup/download budgets during M01. Run cold and warm cases in release/profile builds and disclose browser/cache/network conditions. Keep sanitized datasets and generation seeds versioned. Performance CI uses controlled runners; real-device release checks remain necessary.

## 8. Verification matrix

Every milestone selects applicable checks; do not run unrelated suites repeatedly. Full integration gates remain mandatory before release.

| Layer | Required evidence |
|---|---|
| Existing backend | Focused Vitest suites, type/lint/build gates, real PostgreSQL RLS and financial invariants; preserve `.github/workflows/ci.yml` coverage and backup checks |
| Portable core | Unit/property tests, operation-sequence differential tests, native/Wasm/server fixture equivalence, malformed-input fuzzing and cancellation/resource tests |
| SQLite | Real transaction rollback, interrupted migration, disk-full, process termination, account isolation and pending-command preservation tests |
| Sync | Duplicates, reordered responses, lost acknowledgments, late commits, expired dedup cache, expired cursor, partial bootstrap, tombstones, revoked scope, checkpoint-loss crash replay with duplicate delivery, and concurrent devices |
| Documents | Conflict/undo/structural-edit tests, checksummed import/export round trips, render/print comparison and independent expected measurements |
| UX | Shared workflow scenarios across installed apps and browsers; visual comparison plus semantics, keyboard, focus, text input and accessibility checks |
| **(v2) Observability** | Crash/panic reporting verified from Dart, native and Rust surfaces on real devices; device sync-health states render from live data; server sync metrics and alerts demonstrated against a staged rejection/retry scenario before M04 exits |
| Release | Signed package install/upgrade, real Android/iOS offline and foreground recovery, Intel/ARM64 coverage, isolated backup restoration |

Current commands to preserve include `npm run ci:verify`, `npm run test:integration`, `npx vitest run src/lib/worksheet`, and scoped existing CAD/document/CPM tests. Confirm dependencies and environment requirements before execution. Add `flutter analyze`, `flutter test`, appropriate Flutter integration builds, `cargo fmt --check`, `cargo clippy`, `cargo test` and browser binding tests only once those workspaces exist. Record skipped/unavailable checks explicitly; do not mark them passed.

## 9. Agent execution and handoff protocol

Use one active owner per milestone and one owner per shared contract. Roles may be performed sequentially by the same agent. This plan does not require spawning agents. If parallel work is separately authorized, independent kernel work may proceed after contracts are frozen; schema, sync protocol, central design tokens and shared bindings need coordinated single ownership.

Before implementing a task, fill this work packet:

```text
Task / milestone:
User-authorized scope:
Prerequisite evidence:
Existing central engine and entry points:
All affected consumers (including old web, jobs and imports):
Behavior / invariant being changed:
Contract / schema versions affected:
Files owned; unrelated dirty files excluded:
Implementation sequence:
Failure / conflict / cancellation behavior:
Native, web and server parity checks:
Migration / upgrade / rollback approach:
Focused tests and performance fixtures:
Exit gate:
```

During work:

1. Trace one operation from UI through persistence, transport, authorization and domain effects before changing it.
2. Extract only the boundary required for the current milestone. Do not generate entire module trees with placeholder implementations.
3. Add tests for meaningful semantics and failure modes; reuse fixture harnesses across engines. Do not treat an assertion that mirrors the implementation as proof of parity.
4. Wire all applicable consumers, search for bypasses, then remove the obsolete path when its retirement gate is met.
5. Inspect the final diff for accidental schema changes, duplicated business rules, weakened guards, unbounded work or silent fallback.
6. Update the milestone ledger with commands/results and unresolved issues. Stop at the named gate rather than claiming the whole platform complete.

At handoff, record:

```text
Completed behavior and changed files:
Contract decisions and their rationale:
Tests run, environment, exit codes and evidence paths:
Performance fixture/hardware/results:
Consumer sweep and old-path retirement status:
Data migration/rollback status:
Known failures, skipped checks and risks:
Exact next task and prerequisite:
```

Automatic rejection criteria for implementation review:

- New per-screen queue, formula, permission check, formatting helper or document model duplicates an existing engine.
- Saving is reported successful before durable commit, or storage failure is swallowed.
- Native endpoints bypass existing tRPC-derived policy/financial protections.
- Whole-document saves overwrite concurrent edits without revision checks.
- A browser view relies on a native-only plugin without an implemented web adapter.
- A new engine changes financial precision, scheduling dates or measurement coordinates without reviewed fixtures.
- Full AutoCAD/Excel parity, zero loss, 120 fps or complete backup is claimed without the specified evidence.
- Missing workflows are hidden, platform differences are undocumented, or unresolved failures are relabeled as complete.
- **(v3)** A product-scope fallback from the M01 matrix (a permanently separate React surface, a platform-gated feature, or a dropped browser target) is implemented without an explicit recorded user decision; the parity gate holds until that decision exists.
- **(v3)** A second implementation of an engine persists without a decision record classifying it as a single implementation, a governed temporary duplicate (owner, fixtures, removal gate), or an accepted exception (§4). A Rust kernel is likewise introduced without a comparative-prototype decision record.

## 10. Initial milestone ledger

| Milestone | State | Next evidence required |
|---|---|---|
| M00 | Not started | Complete consumer/capability inventory and baseline; **(v3)** change-feed mechanism decision record (including checkpoint/replay design); verified `contractor` repository with recorded repo identities; ratified capacity envelope and performance budgets; ADR-0010 |
| M01 | Blocked by M00 | Cross-platform prototype and performance decision; **(v3)** comparative-prototype scores per engine and DWG spike results; recorded fallback-matrix outcomes with any product-scope proposals escalated for explicit decision |
| M02 | Blocked by M01 | Shared contracts and component parity |
| M03 | Blocked by M02 | Native storage/auth/sync fault evidence; **(v2)** sync telemetry live end-to-end |
| M04 | Blocked by M03 | Daily log/photo vertical workflow; **(v2)** real-device telemetry and capacity re-baseline |
| M05 | Blocked by M04 | All field workflows using the same engines |
| M06 | Blocked by M02/M03 | Worksheet parity and incremental performance |
| M07 | Blocked by M02/M03 | CAD topology/command/render/plot evidence |
| M08 | Blocked by required M06/M07 contracts | Revision-aware takeoff and BoQ linking |
| M09 | Blocked by M03/M05/M06 | Schedule/progress/cash-flow parity |
| M10 | Blocked by M04–M09 | Complete cross-platform feature matrix |
| M11 | Release blocked by M03–M10 | Recovery, signed installers and rollout evidence |

**Standing constraint (v2):** every new server-side domain feature accepted from M03 onward must name, in its task packet, its change-feed integration and Flutter-parity path, or defer explicitly with a ledger entry.

Start implementation with **M00 only**, then M01. Do not start by rewriting screens or installing every proposed dependency. The immediate output should be an accurate inventory, a ratified capacity envelope and change-feed decision, and a measurable acceptance baseline that subsequent agents can execute against.

## 11. Platform references to revalidate when implementing

- [Flutter architecture and native interoperability](https://docs.flutter.dev/resources/architectural-overview)
- [Flutter web support](https://docs.flutter.dev/platform-integration/web)
- [Flutter web differences and concurrency limitations](https://docs.flutter.dev/platform-integration/web/faq)
- [Apple background execution strategies](https://developer.apple.com/documentation/backgroundtasks/choosing-background-strategies-for-your-app)
- [Android persistent application storage](https://developer.android.com/training/data-storage/app-specific)
- **(v2)** [Postgres logical decoding](https://www.postgresql.org/docs/16/logicaldecoding.html) — including crash-replay semantics (decoding can re-deliver changes after a restart; consumer checkpoints must be durable) — and Neon WAL/slot retention behavior, for the M00 change-feed spike
- **(v3)** libredwg version coverage and **GPLv3** license terms; the existing TypeScript DWG reader (`src/lib/dwg/`); commercial DWG SDK options — for the M01 DWG spike

Use pinned toolchain documentation and actual platform tests before relying on any capability. The architecture remains accountable to measured behavior and the central-engine rules above.
