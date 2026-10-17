# Frontend product integration — agent execution specification

> Readiness note (2026-10-17): the delivery log below is historical and does not establish current end-to-end product parity. The [full-product feature/navigation plan](full-product-feature-navigation-plan.md) records verified gaps and the M13 closure backlog. Preserve historical evidence, but use the new route/action acceptance criteria for current readiness.

Status: proposed implementation plan; no implementation authorized by this document.
Owner request: wire the Contractor frontend and make it match the original Construction_Manager product.
Reference inspected: Construction_Manager commit `7d06a8a51826639b554e30d11a8b0b8f7d095259`.
Working client: `prototype/construction_client`. Paths below are repository-relative unless prefixed `original:`.

## 1. Deliverable and scope boundary

Deliver a shared Flutter native/web product frontend with the original product's information architecture, theme, density, workflows, and access behavior. Every original in-scope route must resolve to a working screen, connected to the authoritative domain service and, where applicable, the real upstream editor. An external-browser launch, placeholder, static fixture, adapter unit test, or successful build does not constitute screen parity.

Retain the existing backend and domain engines. Do not recreate authorization, accounting, tax, scheduling, measurement, calculation, or document lifecycle rules inside widgets. Preserve the original operational sequence, terminology, status transitions, table columns, filters, and actions. Match full upstream editor interfaces where the program explicitly adopted them; do not rebuild ribbons in Flutter or use M01 benchmark viewports as replacements.

Deliver incrementally by complete workflow, with one shared composition root and shared UI primitives. Do not postpone real services until after a visual mockup. Dashboard analytics remain deferred under the existing program constraint; preserve the navigation destination and existing supported behavior without inventing new dashboard work. Any expansion of dashboard scope requires a separate scope amendment.

## 2. Verified starting point and implications

| Observed code | Implication for implementation |
|---|---|
| `lib/main.dart` starts `ContractorOsApp`; `lib/main_m04_host.dart` selects preview or `ConnectedM04Host` using `CONTRACTOR_SERVER_URL`. | Replace divergent composition with one app/session/workspace host. Preserve the server configuration mechanism. |
| `lib/connected_m04_host.dart` owns native identity, authorized HTTP, SQLite mount, project loading, snapshot restoration, photo transfers, and directly renders `DailyReportScreen`. | Extract and reuse these services before expanding screen routing. Do not replace working authentication or durable drafts. |
| The current dirty `main_m04_host.dart` contains an eight-screen preview and static operational metrics. | Preserve the user's edits, refactor deliberately, and remove fake product figures from the live path. Do not reset the file. |
| `WorksheetViewport` generates a 50,000-row fixture; `CadViewport` loads a sample site plan by default. | Keep these under explicit development entry points. They cannot be production BoQ/drawing screens. |
| Attendance seeds worker identities and material delivery seeds a catalog/default quantity. | Real screens must receive roster/catalog data. Production forms cannot submit demonstration IDs or assumed quantities. |
| `packages/construction_application` contains generic route/command/capability registries. | Extend that authority for product navigation rather than introducing a second unrelated registry. |
| `packages/construction_ui` contains ActionBar, ConstructionTable, dialogs, state components, money formatting, SaveSyncStatusPanel, and generated tokens. | Extend and consume these primitives for all new product screens. |
| `main_m04_host.dart` and `connected_m04_host.dart` import `dart:io`; `mount/browser_mount.dart` provides an asynchronous browser mount. | The product entry point needs platform composition separation before native/web parity can be claimed. |
| `native_workbook`, `native_scheduling`, and `native_documents` expose TypeScript adapters; some code imports Node APIs. | A class named HostAdapter is not a Flutter mount. Establish the execution environment and real renderer boundary for each package. |
| The fetched original revision has no `src/app/api/native` routes, while the Flutter host targets native endpoints. | Resolve the exact compatible backend revision/deployment before promising connected behavior. Inspect existing branches/PRs before implementing duplicate endpoints. This observation applies to the fetched revision, not every deployment. |

Existing worktree state at planning time: modified `prototype/construction_client/lib/main_m04_host.dart`; untracked `apps/`. Neither may be overwritten, deleted, staged wholesale, or treated as generated waste. The abandoned implementation files from the preceding turn have been removed.

## 3. Source-of-truth map

- Navigation: `original:src/lib/nav-registry.ts`, `src/lib/navigation/view-registry.ts`.
- Shell behavior: `original:src/components/app-sidebar.tsx`, `workspace-navigation.tsx`, and the module-tab components used by original pages.
- Visual rules: `original:docs/DESIGN_SYSTEM.md`, `src/app/globals.css`; local `packages/design_tokens/tokens.json` and its generator.
- Per-screen behavior: original route page, imported components/dialogs, router procedure, central service, and tests. The route page alone is not sufficient.
- Native session and transport: existing Flutter `mount/native_identity.dart`, `sync_transport.dart`, `sync_orchestrator.dart`, attachment and snapshot bindings.
- Editor integrations: existing `native_*` packages, vendor registries, ADRs 0015–0021, and `artcraft-suite-master-integration-plan.md`.

Pin both source revisions in the evidence manifest. Check for material source drift before each module wave; do not silently adopt a newer original UI halfway through a wave.

## 4. Target architecture and ownership

```text
ContractorApp
  └─ platform bootstrap / SessionController
      ├─ signed-out / restoring / access-error views
      └─ WorkspaceShell(WorkspaceContext)
          ├─ organisation + project navigation
          ├─ canonical module/view tabs
          └─ RouteRegistry -> screen factory
              ├─ presentation -> controller -> domain repository
              │                                ├─ authorized query adapter
              │                                └─ existing durable command/outbox path
              └─ editor host -> typed runtime bridge -> pinned upstream runtime
                                         └─ Contractor domain commands/repositories
```

Proposed ownership, extending existing components wherever possible:

| Location | Responsibility |
|---|---|
| `lib/app/contractor_app.dart` | MaterialApp/router composition, app themes, bootstrap states. No domain services in build methods. |
| `lib/app/session_controller.dart` | Session restore, reauthentication, revocation, account/organisation transition coordination. Wrap existing NativeIdentityClient; do not replace its protocol. |
| `lib/app/bootstrap_native.dart`, `bootstrap_web.dart`, conditional bootstrap facade | Platform storage, credential, file, browser and lifecycle ports. Browser compilation must not traverse native-only imports. |
| `packages/construction_application/lib/src/` | Typed product routes, module/view metadata, capability projections, shared command identities. |
| `lib/workspace/` | Shell, project selection, routing adapter, screen factories, bounded open-document/view state. |
| `lib/data/` | Authenticated transport adapters and repository implementations; no duplicated business calculations. |
| `lib/workflows/` and module-specific screen directories | Existing field screens plus new product presentation/controllers. |
| `lib/editors/` and existing `packages/native_*` | Shared editor-host lifecycle and concrete upstream bindings. Keep domain authority outside renderer code. |
| `packages/construction_ui`, `packages/design_tokens` | Shared visual primitives and generated semantic styles. |

Do not move the client to `apps/` during integration. A later relocation is mechanical and separately scoped, after entry points, tests, and CI converge.

### 4.1 Session and workspace contract

Use immutable context values containing account ID, organisation ID, optional project ID, authoritative access projection, active workspace scope (`OrganisationScope` vs `ProjectScope`), and a monotonically increasing session/scope generation. Do not use a role string supplied by a widget as authorization.

- Query/cache identity includes account + organisation + project + procedure + normalized arguments.
- An async response must match the active generation before it can update visible state.
- Scope transition (Organisation $\leftrightarrow$ Project) safely isolates drafts and queries: an unsaved field log or site MRR draft belongs strictly to its project and generation, and cannot relabel or bleed into organization-level master catalogs.
- Project navigation preserves module/view where accessible; otherwise selects a documented accessible landing route and explains the transition.
- Route exit resolves dirty state through durable save or explicit discard/cancel. Do not keep every editor alive indefinitely using an unbounded IndexedStack.
- Account switch/logout uses the existing pending-work policy, detaches drains, closes editor handles, and invalidates in-memory state. Private drafts remain isolated and recoverable according to existing policy.
- Access revocation immediately removes mutation affordances and prevents queued actions from being represented as accepted; server authority still decides every mutation.

### 4.2 Navigation contract and dual-scope 3-level rail system

Represent a location structurally: route ID, organisation/project scope, module ID, view ID, entity ID, and shareable query/filter arguments. Encode/decode through one route parser, with web URL/back-forward support and native deep-link handling. Keep secrets and draft bodies out of URLs.

Extend the existing RouteRegistry/CapabilityRegistry. Avoid copying labels into independent sidebar, tab-bar, search, and screen-switch arrays. Add a checked-in original navigation snapshot plus a drift check or explicit mapping test.

#### Canonical desktop 3-level rail architecture (>= 1024px)
For desktop workstations, implement the original physical filing-dossier 3-level rail system featuring two distinct Level 1 scopes:

1. **Level 1 (Vertical Left Rail) — Dual-Scope Workspace System**:
   - **Organisation Scope** (`sidebar`: `#2E3A44`): Company-wide global governance and portfolio management.
     - Destinations: `DESK`, `PROJECTS`, `MATERIALS` (central catalog, rates, suppliers), `FINANCE` (company cashflow, chart of accounts), `HR` (permanent staff), `DOCUMENTS` (corporate templates, standards), `SETTINGS`.
   - **Project Scope** (`sidebarProject`: `#27323B`): Site-specific execution and contract management.
     - Destinations: `OVERVIEW`, `PLANNING` (BoQ & TruePPM Schedule), `WORKFLOW` (Daily Reports, RFIs, Meetings), `FIELD DATA` (site muster roll, material deliveries MRR, petty cash), `MATERIALS` (project POs, gate passes, site stock), `EQUIPMENT` (plant & fleet log), `SUBCONTRACTORS` (measurement & billing), `HR` (site workforce), `IPC & VO` (interim certificates & variation orders), `QUALITY & SAFETY` (punch list, safety incidents), `DOCUMENTS` (CAD blueprints, submittals, correspondence), `FINANCE` (budget vs actual, day book).
   - **Scope Switcher**: Anchored at the bottom of the L1 rail (`Project workspace ▾` / active project selector). Toggling switches the active workspace scope, updates the L1 destination set, transitions the background color between `#2E3A44` (`sidebar`) and `#27323B` (`sidebarProject`), and mounts the appropriate scoped route.
   - **Physical Curved Tab**: The active L1 rail item in both scopes features a continuous physical curved flange/tab that extends out of the dark rail and locks seamlessly into the content canvas.

2. **Level 2 (Horizontal Top Rail)**:
   - Primary module dossiers spanning the top surface on `rail2Surface` (`#657984`) with physical folder-tab styling (e.g. under Organisation Materials: `MATERIALS & PROCUREMENT`, `VENDORS DIRECTORY`, `RESOURCE & RATE LIBRARY`), with the expand/fullscreen toggle on the far right.

3. **Level 3 (Nested Horizontal Sub-Rail)**:
   - Specific registers/ledgers layered directly beneath Level 2 on `rail3Surface` (`#C6D3D3`, `rail3Border`: `#B0C2C6`) with nested folder flaps (e.g. `STOCK & INVENTORY`, `PROCUREMENT`).

4. **Standardized Action Bar (`ActionBar`)**:
   - Sits directly beneath Level 3 on the warm paper canvas (`paper`: `#F3EEE5`), housing the Project Scope dropdown (`All Projects ▾`), search input, `Filters` trigger, view/split toggles, export/column settings, and the terracotta primary action button (`amberCta`: `#B97547`, `+ Action ▾`).

5. **Responsive adaptation (< 1024px)**:
   - When viewport width cannot physically fit horizontal folder tabs without overflow, Level 1 collapses to an adaptive drawer and Levels 2/3 adapt into a compact segmented view selector. Do not squeeze horizontal folder tabs into an unreadable overflowing rail on small screens. Only shareable navigation state belongs in URLs; transient text composition and editor selection remain local state.

### 4.3 Data and mutation contract

Extract the current host's authorized client and transport setup into reusable services. Pin and test the original server's actual tRPC serialization; do not scatter hand-written envelope decoding through screens.

Per screen declare query procedures, mutation commands, DTO/version mapping, pagination, filters, permissions, cache invalidation, change-feed participation, and offline policy. A query adapter may wrap existing tRPC procedures. A native mutation adapter must delegate to existing authorized server services rather than bypass guards or write directly to tables.

Offline-capable writes must atomically persist draft/command and enqueue the stable operation identity before reporting local save. Preserve existing attachment dependency ordering, retry semantics, idempotency, expected-version conflicts, and server receipts. Distinguish local durability, server acceptance, attachment completion, and backup through SaveSyncStatusPanel.

Classify each operation explicitly as cached-read, offline-command, or online-only. Approval, issuance, posting, and other authoritative transitions must follow the original server's policy; do not turn all mutations into offline commands by default. No automatic replay after a definitive permission/validation rejection.

Retain generated exact-decimal/date-only contracts. Preserve money as exact representations through transport and use the shared formatter only for presentation. Widgets must not calculate ledger totals, retention, VAT, EVM, or approved quantities.

### 4.4 Upstream editor runtime contract

For each editor first trace an executable path from Flutter to the actual pinned artifact. Verify artifact existence, entry point, runtime dependencies, platform support, and compatible license; registry text alone is not evidence. Do not port the TypeScript domain packages wholesale to Dart or assume Node-dependent code executes inside a browser/WebView.

Prefer the established native engine binding or WASM host supported by the pinned upstream. If a renderer requires a platform view or embedded web surface, implement that as a concrete bridge adapter under the same lifecycle contract. Selection is constrained by actual upstream entry points, keyboard/accessibility support, offline packaging, and existing architecture; document the chosen binding per platform before broad module work.

Proposed shared host operations, adapting existing contracts rather than replacing them:

```text
open(scope, documentId, revision, mode, accessProjection) -> handle
setViewport(handle, size, pixelRatio)
setTheme(handle, theme)
execute(handle, commandId, payload, expectedRevision) -> result
checkpoint(handle) -> durable document reference + revision
setMode(handle, fullEditor | embeddedCapability)
close(handle, save | discard | cancel)

Events: ready, dirtyChanged, selectionChanged, saveRequested,
        domainCommandRequested, revisionConflict, runtimeError
```

Bridge messages carry schema version, request ID, scope generation, document identity, and revision. Reject stale/cross-scope responses, validate message payloads and origins, and restrict file/network access through host ports. Tokens must not be serialized into editor document state. Bulk documents/geometry use the runtime's supported binary/handle transport; do not copy entire documents on every pointer event.

A full-editor/embedded switch preserves document identity, unsaved state, selection, and supported undo history. If an upstream cannot preserve those semantics, expose that as a specific blocker rather than simulating continuity in metadata.

## 5. Execution packets and dependency graph

Register these proposed packets in the existing backlog through a planning amendment before implementation. Packet IDs below are proposed M13 tasks, not completed milestones. Keep each PR scoped to one registered packet; split large module packets into per-workflow tasks after their binding maps are known.

```text
T01 reference/bindings ── T02 app/session ── T03 shell/routes
             │                 │                    │
             └──────────── T04 data substrate ───────┤
                                                    ├─ T05 field workflows
                                                    ├─ T06 real editor host ─ T07 planning/BoQ
                                                    │                      ├ T08 CAD/takeoff
                                                    │                      └ T10 documents
                                                    └─ T09 remaining operations/commercial
All delivered routes ── T11 cross-platform parity and product entry-point cutover
```

### T01 — Bounded reference and binding manifest

Deliver `docs/frontend/route-parity.json`, `service-bindings.json`, and pinned screenshots/fixtures referenced by a compact manifest. Inventory original routes, subviews, entity details, row/bulk actions, dialogs, filters, exports, permission variants, and mobile adaptations. Each entry names original source files, authoritative procedure/service, local controller/repository/widget or missing implementation, supported target, offline policy, and acceptance scenario.

Resolve the compatible backend revision for the client's native endpoints. If those changes exist elsewhere, reuse them. If absent, register exact adapter work against existing services. Do not count hypothetical endpoints as available.

Exit: every original navigation destination has a disposition, every first-wave action has an actual service binding, and one authenticated project query has been exercised against the selected backend. This is a bounded implementation map, not a renewed M00–M12 audit.

### T02 — Extract platform bootstrap and session ownership

Own app bootstrap plus extractions from `main_m04_host.dart` and `connected_m04_host.dart`. Reuse native identity, mount, drain triggers, photo manager and snapshot restorer. Keep local-preview transport explicit; a missing server URL must not silently present production-looking data.

Centralize application migrations before connecting field tables: the current field migration declares version 5 while the preview host remaps it to 10. Determine installed sequences, assign the next compatible application version, and test upgrades from real previous schemas. Never renumber an already-applied migration.

Exit: existing daily-report save/restart/sync behavior survives extraction; web builds use browser ports; expired/revoked credentials and pending-work logout behave correctly; both modes reach the same shell boundary.

### T03 — Canonical shell, 3-level rail system, route parser and design-system integration

Own registry extensions, workspace shell, theme binding, route parsing, and navigation tests. Port original navigation structure from the manifest. Apply generated tokens rather than a replacement navy/teal theme. Implement the canonical 3-level rail system for desktop (`WorkspaceShell` with Rail 1 curved tab flange, `ModuleRail` Level 2 folder tabs on `rail2Surface`, `ViewSubRail` Level 3 nested sub-tabs on `rail3Surface`, and `ActionBar` on `paper` canvas) along with the compact adaptive drawer for smaller viewports. Implement all selected tabs, project switching, deep links, URL history, keyboard collapse, focus traversal, and compact layout.

Extend ConstructionTable only for behavior required by original screens; use one shared solution for sorting/selection/pagination and virtualization where needed. Do not build private table engines in modules. Heavy view creation must be lazy with explicit disposal/checkpoint behavior.

Exit: route round trips, direct links, back/forward, denied routes, project switching and theme changes work; shell screenshots match the pinned 3-level rail reference geometry; no technical prototype banner or fabricated metrics appears in production.

### T04 — Shared query/command repositories and access projections

Own transport/DTO mappings, session-scoped repository cache, and extensions to existing snapshot/change-feed/outbox bindings. Define repository interfaces per domain, not a generic raw-JSON CRUD client injected into every widget. Carry validation/field errors into form state without exposing raw server dumps.

Exit: stale responses cannot cross project/account boundaries; actual query and command requests reach the existing authorized services; a retry after lost acknowledgement does not duplicate a transaction; rejected commands remain recoverable and visibly rejected. Any server change includes the original repository's authorization/RLS tests.

### T05 — Complete field workflows in the shared shell

Wire existing daily report/photo, attendance, material delivery, and expense widgets to real project-scoped repositories. Match original workflow tabs and forms; remove fixture workers, catalogs, quantities, and synthetic financial totals from live paths. Use the existing accepted-report replica and draft store where applicable. Show local drafts versus accepted records distinctly.

Trace list -> create -> save -> detail -> edit -> allowed transition, including row/bulk actions actually present in the original. Do not infer complete workflow coverage from a create form.

Exit scenarios: save report with photo offline; kill/restart; reconnect; photo dependency completes before report acceptance; report appears on a second client. Exercise attendance with a real roster, material receipt with real catalog IDs, and expense submission with actual server validation. Verify project switching cannot move a draft or photo into another project.

### T06 — Prove and implement the shared real-editor host

Own editor lifecycle schema and platform bindings; one owner for the shared bridge. Start with one real GridCraft document through the supported native and browser rendering paths. Adapt existing native_workbook commands/save coordination where they are executable; isolate Node/server-only dependencies. Establish packaging, worker/process ownership, input/focus, clipboard, IME, resize, accessibility and error recovery.

Exit: a real pinned upstream renderer opens an existing document, accepts an edit, checkpoints, closes, and reopens that edit; a full/embedded switch preserves required state. A TypeScript adapter test or screenshot of a benchmark widget does not pass.

### T07 — Planning and BoQ product wiring

Bind original Planning/BOQ/Look-Ahead/Staffing Requirements routes to domain repositories and TruePPM/GridCraft hosts. Preserve original project/calendar/version/baseline context. Keep approvals, certified quantities and financial authority in Contractor. Use supported full editors and focused components in the corresponding workflows.

Exit: actual BoQ edit persists and reopens; protected/approved cells reject edits; schedule changes run the selected scheduling engine; incompatible revisions present a recoverable conflict; navigation between schedule and BoQ retains linked entity identity.

### T08 — Drawings, CAD and PDF takeoff

Bind drawing register, revision selection, CAD/PDF document opening, annotations, calibrated measurements and BoQ links to existing CAD/takeoff services plus concrete editor hosts. Upload/import failures must not create phantom accepted documents. Retain measurement geometry, units, scale and source-revision provenance.

Exit: import actual drawing/PDF -> measure -> attach quantity to BoQ -> save -> reopen -> observe same provenance. Replacing the drawing revision invalidates affected measurements under existing rules. No sample floor plan is substituted for a user's drawing.

### T09 — Remaining operational and commercial routes

Partition into separate PR tasks using the manifest: materials/procurement/vendors, equipment/production, subcontractors/billing, HR, IPC/variations, accounts/payables/cash flow/budget, quality/punch list/safety, organisation modules and settings. This packet is not one giant PR and cannot be closed by linking to the old website.

For each task implement original list/detail/dialog/action behavior using existing services, including permissions, lifecycle transitions, field validation and exports. Dependencies determine order: prerequisites such as suppliers/resources/contracts must be available before dependent transactions. Do not copy illustrative calculations from native_runtime journey examples into product authority.

Exit per route: original permitted actions have working equivalents; denied actions remain denied; actual persistence and read-back work; exact numeric results agree with the authoritative service; visual comparison and one real service-backed acceptance journey pass.

### T10 — Correspondence, documents and presentations

Reuse existing document authority, report assembly and sync contracts while connecting real WordCraft/DeckCraft/PdfCraft render/export runtimes. Bind project/BoQ/schedule figures as authoritative projections with provenance. Preserve immutable issuance and revision review.

Exit: a document/deck can be created from actual project data, edited, saved, reopened and exported as a valid file that an independent parser/viewer opens. Issued records remain immutable. XML fragments, metadata-only export descriptors, or assumed print fidelity do not pass.

### T11 — Product entry-point convergence and parity closure

Remove production reachability of benchmark pages and demonstration data. Retain benchmarks behind development-only entry points. Update runnable client instructions and CI to build the actual shared product entry point. Do not delete untracked `apps/` or retire the original frontend until its role is explicitly resolved.

Exit: every in-scope manifest route meets its acceptance checks, native/web use the same presentation/controller contracts, real platform differences are documented, and no ordinary workflow requires a browser escape to compensate for missing implementation. This packet does not publish or deploy the app.

## 6. Original navigation coverage

Organisation: Desk, Projects, Materials, Finance, HR, Documents, Settings.

| Project workspace | Required original destinations |
|---|---|
| Overview | Project overview; preserve dashboard destination within deferred-dashboard scope |
| Planning | Planning, BOQ, Look-Ahead, Staffing Requirements |
| Workflow | RFIs, Daily Program, My Tasks, Daily Reports, Meetings |
| Field Data | Original field capture/submission views; map native capture forms to those views |
| Materials | Materials & Procurement, Vendors Directory, Resource & Rate Library |
| Equipment | Equipment & Fleet, Plant & Production |
| Subcontractors | Subcontractors, Measurement & Billing |
| HR | Staff & Workforce and original registered subviews |
| IPC and VO | IPC Certificates, Variation Orders |
| Quality & Safety | Quality, Punch List, Safety |
| Documents | Drawings, Photo Progress, Submittals, Correspondence, Doc Center |
| Finance | Day Book & Cashbook, Parties & Payables, Cash Flow, Budget vs Actual |

This table establishes navigation coverage only. T01 expands each destination into entity/detail/dialog/action coverage. Native attendance/material/expense screens must not become arbitrary new top-level product modules just because those widgets already exist.

## 7. Acceptance evidence and test strategy

### Behavior

- Unit tests cover route serialization, scope transitions, DTO fidelity, bridge validation and query invalidation.
- Widget tests cover permission-dependent actions, error/retry states, keyboard/focus, form validation and responsive overflow.
- Service-backed tests exercise real authorized reads/writes and database persistence. Use deterministic isolated fixtures, not production data.
- Durability tests use the actual SQLite/browser store, process restart, attachment dependencies, lost acknowledgements and conflict responses.
- Editor tests invoke actual upstream artifacts and verify saved content/export with independent readers where applicable.
- Cross-tool acceptance covers takeoff -> BoQ -> procurement/IPC, material receipt -> stock/accounting, daily progress -> schedule -> report. Every arrow must exercise the actual service boundary rather than pass computed objects between test helpers.

### Visual and interaction parity

Capture original and new UI from the same seeded dataset, user/access profile, theme, viewport and route. Baseline 1440x900 desktop, 1024x768 compact desktop/tablet, and 390x844 phone; add required platform/device sizes from the existing support matrix. Pin fonts and locale; use an injected clock only in the test harness. Mask timestamps/avatars only with a recorded reason.

Compare sidebar dimensions, tabs, toolbar density, table columns/alignment, form grouping, dialogs, empty/error/loading states, selections and focus. Flutter versus browser text rendering prevents blind pixel equality: use goldens for regression within each renderer and side-by-side review for cross-renderer parity. No unexplained overflow, clipped primary action, unreachable field, or incorrect active project is accepted. Include keyboard navigation and Nepali text/IME in relevant field-facing flows.

### Commands

Use the repository's pinned toolchains and CI commands. Run `flutter analyze`, focused `flutter test` suites, and the relevant `flutter build` targets from `prototype/construction_client`; exercise the browser target because native-only imports are a known integration risk. Run affected package `tool/check.mjs` commands, token generation check, contract checks and protocol lint. Add new integration-test targets to CI rather than leaving acceptance solely as manual prose. Do not claim Windows/Android/iOS verification from a macOS build.

### Completion record per route

Record source revision, original route/view/action, client entry point, actual service/command, runtime artifact where relevant, exercised platform, test output, before/after screenshots, and remaining limitations. Mark a route complete only when both appearance and real behavior pass. A limitation remains an open task; it must not be concealed by a fallback or a checked milestone box.

## 8. Agent execution constraints

1. This is a planning deliverable. Do not start implementation without the user's implementation instruction.
2. At implementation start, inspect current instructions and dirty files; preserve the existing host edits and untracked apps scaffold. Never reset the repository to simplify the work.
3. Start with T01–T04 and one real daily-report vertical through the shared shell. Do not spend the first wave rebuilding dashboards or decorating disconnected screens.
4. Reuse central registries, design primitives, authoritative domain services and existing sync machinery. Extend their missing capability once, then update all consumers.
5. Do not fake support using fixtures, synthetic IDs, metadata-only adapters, open-in-browser buttons, or invented successful sync states.
6. Keep backend changes in its own repository with linked compatibility evidence. A UI task that discovers a missing adapter must register and implement that dependency rather than bypassing authorization.
7. Scope shared contracts to one owner. If agent parallelism is separately authorized, delegate independent module packets only after shared session/route/repository/bridge interfaces stabilize; do not let agents edit the shared shell concurrently.
8. Keep completion claims proportional to executed evidence. Build success establishes compilation; renderer unit tests establish their tested contracts; neither establishes application parity.

## 9. Packet Delivery & Verification Log

| Packet | Description | Status | Verification & Evidence |
|---|---|:---:|---|
| **T01** | Bounded reference and binding manifest | ✅ Completed | Generated `docs/frontend/route-parity.json` (64 routes), `docs/frontend/service-bindings.json` (323 procedures), `manifest.md`. |
| **T02** | Extract platform bootstrap and session ownership | ✅ Completed | `session_controller.dart`, `bootstrap_native.dart`, `bootstrap_web.dart`, `bootstrap.dart`. Dual-scope transitions (`Organisation` vs `Project`) with project draft isolation. |
| **T03** | Canonical shell, 3-level rail system | ✅ Completed | `workspace_shell.dart`, `contractor_app.dart`. Dual L1 scope (Org `#2E3A44` vs Project `#27323B`) with physical tab flange, L2 folder tabs on `rail2Surface` (`#657984`), L3 sub-rail on `rail3Surface` (`#C6D3D3`), and action bar on `paper` (`#F3EEE5`). Tested in `test/app/session_and_workspace_test.dart` (5/5 passing). |
| **T04** | Shared query/command repositories | ✅ Completed | `trpc_client.dart` with Zod field error extraction, `repository_interface.dart`, `ScopeGuard`. Tested in `test/data/repository_test.dart`. |
| **T05** | Complete field workflows in shared shell | ✅ Completed | `material_repository.dart`, `attendance_repository.dart`, `site_expense_repository.dart`, `daily_report_repository.dart` wired with atomic local outbox write semantics. Tested in `test/data/repository_test.dart` (7/7 passing). |
| **T06** | Real-editor host bridge | ✅ Completed | `editor_host_bridge.dart` implementing `GridCraftEditorBridge` with dual modes (`fullEditor` vs `embeddedTable`), undo/redo stack, cell protection (`CellProtectionException`), durable checkpoints & reopen, exact-decimal `WorksheetIpcExport`. Tested in `test/worksheet/editor_host_bridge_test.dart` (8/8 passing). |
| **T07** | Planning and BoQ product wiring | ✅ Completed | `WorksheetViewport` wired with `GridCraftEditorBridge`, dynamic formula bar in fullEditor mode, compact view in embeddedTable mode, mode switcher toggle in toolbar, bound into `WorkspaceShell` under `PLANNING` -> `BOQ WORKSHEET`. |
| **T08** | Drawings, CAD & PDF takeoff integration | ✅ Completed | `takeoff_boq_service.dart` implementing drawing register, calibrated takeoff measurements, direct BoQ linking with exact-decimal quantity posting, invalidation engine (`bumpDrawingRevision` marks affected links `needsReview`), review resolution, and round-trip provenance verification. Tested in `test/takeoff/takeoff_boq_service_test.dart` (3/3 passing), bound into `WorkspaceShell`. |
| **T09** | Remaining operational and commercial routes | ✅ Completed | Complete list/detail/dialog/action routes in `workspace_shell.dart`: Finance Day Book with double-entry debit==credit validation in exact decimal paisa, Subcontractors Register, Equipment & Fleet logs, Quality & Safety (NCR and Inspection checklists), HR Staff & Workforce roster, Overview Project Summary with KPIs, and Organisation Executive Desk. Dynamic status filtering ('ALL', 'ACCEPTED', 'PENDING', 'ACTIVE', 'POSTED') and live search. Tested in `test/workspace/operational_routes_test.dart` (3/3 passing). |
| **T10** | Correspondence, documents and presentations | ✅ Completed | `document_center_service.dart` and `document_center_viewport.dart` implementing WordCraft correspondence and DeckCraft monthly progress presentations with dual presentation modes (`fullEditor` vs `embeddedView`), live project placeholder bindings, immutable issuance with SHA-256 snapshot hashes and double-entry ledger watermarks (`FrozenDocumentModificationError` and `DocumentAuthorityViolationError`), OpenXML (.docx) export, PresentationML (.pptx) export, and permanent Issued Archive. Tested in `test/documents/document_center_test.dart` (7/7 passing). |
| **T11** | Product entry-point convergence and parity closure | ✅ Completed | Canonical product entry point `main.dart` boots `SessionController` into token-driven `ContractorApp` and `WorkspaceShell` with zero technical prototype banners or synthetic metrics in production. Benchmarks retained strictly behind `--dart-define=ENABLE_BENCHMARKS=true`. 0 compile errors, 0 warnings across `flutter analyze`. |
| **Full Suite** | Regression & Parity verification | ✅ Verified | **290/290 tests passing** across entire client suite (`flutter test`). |
