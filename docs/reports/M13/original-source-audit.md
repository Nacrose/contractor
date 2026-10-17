# M13-T01 source and route audit

Status: **In progress**. The available source bundle is pinned for audit. Action behavior and deployed backend compatibility remain unverified; this report does not mark T01 complete.

## Source identity and confidence

- Bundle: `Construction-Manager-main.zip` (local path `/Users/aakashdhakal/Construction-Manager-main.zip`), SHA-256 `8b3cb347083cfe25d484724116f87d1ab3fec80d81a0206a73e4f9b55a2de23d`; ZIP comment declares source revision `7a5cccfd01484cc17b01e7c840fc0f35e87c1e58`.
- Earlier frontend artifacts declare `7d06a8a51826639b554e30d11a8b0b8f7d095259`, which differs from the ZIP comment. The ZIP has no `.git` object database, so the comment does not prove its contents match that commit. Locate the canonical checkout or verify the archive against a Git tree before finalizing parity scope.
- The bundle includes the original Next.js app and server source together. Its package declares Construction Manager 1.0.0, Next.js 16, React 19, tRPC v11 and Prisma 6. This is a source backend contract, not proof that any deployed backend/API/schema is compatible.

## Verified source counts

| Surface | Observed | Meaning |
|---|---:|---|
| App Router pages | 64 | 46 project routes and 18 organisation/public/admin paths |
| Router files | 34 | 32 root `appRouter` registrations; daily reports and RFIs are nested under `workflow` |
| Procedures | 341 | 323 recognized by the old scanner plus 18 `superAdminProcedure` methods it omitted |
| Direct and reachable procedure hooks | 223 page occurrences / 271 unique hooks through local TS/TSX imports | Component traversal is static; not all controls/lifecycles are captured |
| Pages with direct tRPC calls | 51 of 64 | Other pages may use child components, page props or static/utility behavior |
| Next.js API route handlers | 20 | Includes tRPC transport plus auth/admin/file/export routes |
| Direct dialog references | 47 route occurrences | Does not inventory dialog inputs, actions or nested children |

## Original sidebar destinations

The archive sidebar has one organisation/top-level list, one project list, and a separately gated admin list. Contractor’s three-level shell is a proposed mapping, not an original navigation structure. Source: `src/components/app-sidebar.tsx`.

**Organisation/top-level:**
- Dashboard → `/dashboard`
- Projects → `/projects`
- Team → `/team`
- Presets → `/presets`
- Activity → `/activity`
- Sync Status → `/sync`

**Project:**
- Overview → ``
- Planning Dashboard → `/planning-dashboard`
- Workflow → `/workflow/rfi`
- Communication → `/communication`
- Drawings → `/drawings`
- Submittals → `/submittals`
- Punch List → `/punch-list`
- Safety → `/safety`
- Quality → `/quality`
- Meetings → `/meetings`
- Look-Ahead → `/look-ahead`
- Planning → `/boq`
- Variation Orders → `/variations`
- Subcontractors → `/subcontractors`
- Materials → `/materials`
- Equipment → `/equipment`
- Correspondence → `/correspondence`
- Doc Center → `/document-center`
- Payments → `/payments`
- IPC Certificates → `/ipc`
- Tax Summary → `/tax-summary`
- Cash Flow → `/cash-flow`
- Budget vs Actual → `/budget-variance`
- HR / Staff → `/hr`

**Privileged admin:**
- Overview → `/admin`
- Organizations → `/admin/organizations`
- Users → `/admin/users`
- Trials → `/admin/trials`
- Audit Log → `/admin/audit`
- Data Browser → `/admin/data`
- Settings → `/admin/settings`
- Database → `/admin/database`

## Router and service ledger findings

- `_app.ts` registers 32 top-level routers. `workflow` composes `dailyReport` and `rfi`; those two files explain the 34 router source files.
- `admin.ts` declares 18 procedures through a `superAdminProcedure` wrapper. The old generator omitted this wrapper type, so every admin operation is absent from `service-bindings.json`. This is a real inventory gap.
- The old generator invents Dart repository paths from router names and sets `supportsOffline` from method-name prefixes. Neither is source evidence. Replace with verified adapter paths or `unknown`; determine offline policy per operation from the client durability path and server lifecycle.
- A top-level procedure name does not establish effective permission: wrappers, role checks and handler-level project membership assertions must be reviewed.
- The M00 matrix includes 41 workflows; two are marked partial. Their source status is separate from Contractor status, and both remain in parity coverage.

## Route-by-route direct-source index

The [route component index](../../frontend/original-action-component-index.json) traverses static local imports for all 64 pages and records 271 reachable procedure hooks plus reachable dialog components. It gives reviewers a component-level source index; it does not claim to capture all controls, permission checks, offline policy or lifecycle behavior. The table below shows direct page references only.

| Route | Source page | Direct procedure hooks | Dialog components |
|---|---|---|---|
| `/activity` | `src/app/(app)/activity/page.tsx` | — | — |
| `/admin/audit` | `src/app/(app)/admin/audit/page.tsx` | `admin.auditLog (Query)` | — |
| `/admin/data` | `src/app/(app)/admin/data/page.tsx` | `admin.browseTable (Query)`, `admin.listTables (Query)` | — |
| `/admin/database` | `src/app/(app)/admin/database/page.tsx` | — | — |
| `/admin/organizations` | `src/app/(app)/admin/organizations/page.tsx` | `admin.createOrganization (Mutation)`, `admin.deleteOrganization (Mutation)`, `admin.extendTrial (Mutation)`, `admin.listOrganizations (Query)`, `admin.updateOrganization (Mutation)` | `AlertDialog`, `CreateOrgDialog`, `DeleteDialog`, `EditOrgDialog`, `ExtendTrialDialog`, `SuspendDialog` |
| `/admin` | `src/app/(app)/admin/page.tsx` | `admin.overview (Query)` | — |
| `/admin/settings` | `src/app/(app)/admin/settings/page.tsx` | `admin.listFeatureFlags (Query)`, `admin.upsertFeatureFlag (Mutation)` | — |
| `/admin/trials` | `src/app/(app)/admin/trials/page.tsx` | `admin.extendTrial (Mutation)`, `admin.listTrials (Query)` | — |
| `/admin/users` | `src/app/(app)/admin/users/page.tsx` | `admin.activateUser (Mutation)`, `admin.deactivateUser (Mutation)`, `admin.deleteUser (Mutation)`, `admin.listUsers (Query)`, `admin.resetUserPassword (Mutation)` | `ActivateDialog`, `AlertDialog`, `DeactivateDialog`, `DeleteDialog`, `ResetPasswordDialog` |
| `/dashboard` | `src/app/(app)/dashboard/page.tsx` | — | — |
| `/presets` | `src/app/(app)/presets/page.tsx` | `globalPreset.addIngredient (Mutation)`, `globalPreset.create (Mutation)`, `globalPreset.delete (Mutation)`, `globalPreset.deleteIngredient (Mutation)`, `globalPreset.get (Query)`, `globalPreset.list (Query)`, `globalPreset.update (Mutation)`, `globalPreset.updateIngredient (Mutation)` | — |
| `/projects/[id]/boq` | `src/app/(app)/projects/[id]/boq/page.tsx` | `boq.create (Mutation)`, `boq.delete (Mutation)`, `boq.list (Query)`, `boq.update (Mutation)`, `project.get (Query)`, `project.lockBoq (Mutation)` | `AddBoqItemDialog`, `AlertDialog` |
| `/projects/[id]/boq/pdf-designer` | `src/app/(app)/projects/[id]/boq/pdf-designer/page.tsx` | `boq.list (Query)`, `project.get (Query)` | — |
| `/projects/[id]/budget-variance` | `src/app/(app)/projects/[id]/budget-variance/page.tsx` | `finance.budgetVariance (Query)` | — |
| `/projects/[id]/cash-flow` | `src/app/(app)/projects/[id]/cash-flow/page.tsx` | `finance.cashFlow (Query)` | — |
| `/projects/[id]/communication` | `src/app/(app)/projects/[id]/communication/page.tsx` | `chat.createChannel (Mutation)`, `chat.getMessages (Query)`, `chat.listChannels (Query)`, `chat.markRead (Mutation)`, `chat.sendMessage (Mutation)` | `CreateChannelDialog` |
| `/projects/[id]/correspondence` | `src/app/(app)/projects/[id]/correspondence/page.tsx` | `correspondence.create (Mutation)`, `correspondence.get (Query)`, `correspondence.list (Query)`, `correspondence.stats (Query)`, `correspondence.updateReply (Mutation)` | `LetterDetailDialog`, `LogLetterDialog` |
| `/projects/[id]/daily-program` | `src/app/(app)/projects/[id]/daily-program/page.tsx` | — | — |
| `/projects/[id]/daily-reports/[reportId]` | `src/app/(app)/projects/[id]/daily-reports/[reportId]/page.tsx` | — | — |
| `/projects/[id]/daily-reports` | `src/app/(app)/projects/[id]/daily-reports/page.tsx` | — | — |
| `/projects/[id]/dashboard` | `src/app/(app)/projects/[id]/dashboard/page.tsx` | `project.get (Query)` | — |
| `/projects/[id]/document-center` | `src/app/(app)/projects/[id]/document-center/page.tsx` | `approvedDocument.list (Query)`, `correspondence.list (Query)`, `document.listDrawings (Query)`, `ipc.list (Query)`, `submittal.list (Query)`, `workflow.dailyReport.listReports (Query)`, `workflow.rfi.list (Query)` | — |
| `/projects/[id]/documents` | `src/app/(app)/projects/[id]/documents/page.tsx` | `document.createDocument (Mutation)`, `document.listDocuments (Query)`, `project.get (Query)` | `AddDocDialog` |
| `/projects/[id]/drawings` | `src/app/(app)/projects/[id]/drawings/page.tsx` | `document.addRevision (Mutation)`, `document.approveDrawing (Mutation)`, `document.createDrawing (Mutation)`, `document.createRfiFromDrawing (Mutation)`, `document.getDrawing (Query)`, `document.getRevisionFile (Query)`, `document.listDrawings (Query)`, `gantt.list (Query)` | `AddRevisionDialog`, `ApproveDrawingDialog`, `CreateRfiFromDrawingDialog`, `UploadDrawingDialog` |
| `/projects/[id]/equipment` | `src/app/(app)/projects/[id]/equipment/page.tsx` | `equipment.create (Mutation)`, `equipment.createLog (Mutation)`, `equipment.createMaintenance (Mutation)`, `equipment.getEfficiencyStats (Query)`, `equipment.list (Query)`, `equipment.listLogs (Query)`, `equipment.listMaintenance (Query)`, `equipment.resolveMaintenance (Mutation)`, `equipment.updateStatus (Mutation)`, `project.get (Query)` | `AddEquipDialog`, `AddLogDialog`, `AddMaintDialog`, `ResolveMaintDialog` |
| `/projects/[id]/forms` | `src/app/(app)/projects/[id]/forms/page.tsx` | `boq.list (Query)`, `ipc.list (Query)`, `material.getRequirements (Query)` | — |
| `/projects/[id]/gantt/[versionId]/pdf-designer` | `src/app/(app)/projects/[id]/gantt/[versionId]/pdf-designer/page.tsx` | `gantt.list (Query)`, `gantt.listVersions (Query)`, `project.get (Query)` | — |
| `/projects/[id]/gantt` | `src/app/(app)/projects/[id]/gantt/page.tsx` | — | — |
| `/projects/[id]/hr` | `src/app/(app)/projects/[id]/hr/page.tsx` | `hr.create (Mutation)`, `hr.list (Query)`, `project.get (Query)` | `AddStaffDialog` |
| `/projects/[id]/ipc/[ipcId]` | `src/app/(app)/projects/[id]/ipc/[ipcId]/page.tsx` | `boqVersion.diff (Query)`, `ipc.listItems (Query)`, `ipc.loadBoq (Mutation)`, `ipc.updateItem (Mutation)`, `partner.getSubcontractor (Query)`, `project.get (Query)` | — |
| `/projects/[id]/ipc/[ipcId]/pdf-designer` | `src/app/(app)/projects/[id]/ipc/[ipcId]/pdf-designer/page.tsx` | `ipc.listItems (Query)`, `project.get (Query)` | — |
| `/projects/[id]/ipc` | `src/app/(app)/projects/[id]/ipc/page.tsx` | `ipc.create (Mutation)`, `ipc.list (Query)`, `partner.listSubcontractors (Query)`, `project.get (Query)` | `AddIpcDialog` |
| `/projects/[id]/look-ahead` | `src/app/(app)/projects/[id]/look-ahead/page.tsx` | `execution.autoGenerateProgram (Mutation)`, `execution.materialRequirements (Query)`, `execution.resourceConflicts (Query)`, `workflow.dailyReport.getApprovedDailyProgramByDate (Query)` | — |
| `/projects/[id]/materials` | `src/app/(app)/projects/[id]/materials/page.tsx` | `material.create (Mutation)`, `material.createGateEntry (Mutation)`, `material.createTransaction (Mutation)`, `material.delete (Mutation)`, `material.getRequirements (Query)`, `material.list (Query)`, `material.listGateEntries (Query)`, `material.listTransactions (Query)`, `partner.createSupplier (Mutation)`, `partner.listSubcontractors (Query)`, `project.get (Query)`, `purchaseOrder.create (Mutation)`, `purchaseOrder.updateStatus (Mutation)` | `AddGateEntryDialog`, `AddMaterialDialog`, `AddSupplierDialog`, `AlertDialog`, `CreatePODialog`, `LogTransactionDialog` |
| `/projects/[id]/meetings` | `src/app/(app)/projects/[id]/meetings/page.tsx` | `projectOps.meeting.addActionItem (Mutation)`, `projectOps.meeting.create (Mutation)`, `projectOps.meeting.get (Query)`, `projectOps.meeting.list (Query)`, `projectOps.meeting.update (Mutation)`, `projectOps.meeting.updateActionItem (Mutation)` | `MeetingDetailDialog` |
| `/projects/[id]` | `src/app/(app)/projects/[id]/page.tsx` | `project.get (Query)`, `workflow.rfi.list (Query)` | — |
| `/projects/[id]/payments` | `src/app/(app)/projects/[id]/payments/page.tsx` | `projectOps.payment.agingReport (Query)`, `projectOps.payment.create (Mutation)`, `projectOps.payment.list (Query)`, `projectOps.payment.releaseRetention (Mutation)`, `projectOps.payment.retentionSummary (Query)`, `projectOps.payment.stats (Query)` | — |
| `/projects/[id]/planning-dashboard` | `src/app/(app)/projects/[id]/planning-dashboard/page.tsx` | `boq.list (Query)`, `gantt.getEVM (Query)`, `gantt.getVariance (Query)`, `gantt.listVersions (Query)`, `project.get (Query)`, `staffRole.list (Query)` | — |
| `/projects/[id]/planning/revision/[versionId]` | `src/app/(app)/projects/[id]/planning/revision/[versionId]/page.tsx` | `gantt.getRevisionDocument (Query)` | — |
| `/projects/[id]/punch-list` | `src/app/(app)/projects/[id]/punch-list/page.tsx` | `punchList.create (Mutation)`, `punchList.list (Query)`, `punchList.stats (Query)`, `punchList.updateStatus (Mutation)` | `CreatePunchDialog` |
| `/projects/[id]/quality` | `src/app/(app)/projects/[id]/quality/page.tsx` | `projectOps.quality.complete (Mutation)`, `projectOps.quality.create (Mutation)`, `projectOps.quality.list (Query)`, `projectOps.quality.stats (Query)` | — |
| `/projects/[id]/rfis` | `src/app/(app)/projects/[id]/rfis/page.tsx` | — | — |
| `/projects/[id]/safety` | `src/app/(app)/projects/[id]/safety/page.tsx` | `projectOps.safety.create (Mutation)`, `projectOps.safety.list (Query)`, `projectOps.safety.stats (Query)`, `projectOps.safety.updateStatus (Mutation)` | — |
| `/projects/[id]/subcontractors` | `src/app/(app)/projects/[id]/subcontractors/page.tsx` | `material.updateTransaction (Mutation)`, `partner.createSubcontractor (Mutation)`, `partner.getSubcontractor (Query)`, `partner.getSubcontractorWorks (Query)`, `partner.listSubcontractors (Query)`, `project.get (Query)` | `AddSubcontractorDialog`, `AlertDialog` |
| `/projects/[id]/submittals` | `src/app/(app)/projects/[id]/submittals/page.tsx` | `submittal.create (Mutation)`, `submittal.list (Query)`, `submittal.review (Mutation)`, `submittal.stats (Query)`, `submittal.submit (Mutation)` | `CreateSubmittalDialog`, `ReviewDialog` |
| `/projects/[id]/tax-summary` | `src/app/(app)/projects/[id]/tax-summary/page.tsx` | `ipc.taxSummary (Query)`, `material.taxSummary (Query)`, `project.get (Query)` | — |
| `/projects/[id]/variations/[voId]` | `src/app/(app)/projects/[id]/variations/[voId]/page.tsx` | `boq.list (Query)`, `variationOrder.get (Query)`, `variationOrder.update (Mutation)`, `variationOrder.updateStatus (Mutation)` | — |
| `/projects/[id]/variations` | `src/app/(app)/projects/[id]/variations/page.tsx` | `variationOrder.create (Mutation)`, `variationOrder.list (Query)` | — |
| `/projects/[id]/workflow/program` | `src/app/(app)/projects/[id]/workflow/program/page.tsx` | `boq.list (Query)`, `project.get (Query)`, `workflow.dailyReport.addBacklogToProgram (Mutation)`, `workflow.dailyReport.approveProgram (Mutation)`, `workflow.dailyReport.createProgram (Mutation)`, `workflow.dailyReport.deleteProgram (Mutation)`, `workflow.dailyReport.listAvailableRfis (Query)`, `workflow.dailyReport.listBacklog (Query)`, `workflow.dailyReport.listBacklogTasks (Query)`, `workflow.dailyReport.listPendingCancellations (Query)`, `workflow.dailyReport.listPrograms (Query)`, `workflow.dailyReport.requestCancellation (Mutation)`, `workflow.dailyReport.resyncProgram (Mutation)`, `workflow.dailyReport.reviewCancellation (Mutation)`, `workflow.dailyReport.updateProgram (Mutation)` | `AddProgramDialog` |
| `/projects/[id]/workflow/reports/[reportId]/edit` | `src/app/(app)/projects/[id]/workflow/reports/[reportId]/edit/page.tsx` | `project.get (Query)`, `workflow.dailyReport.getProgramResources (Query)`, `workflow.dailyReport.getReport (Query)`, `workflow.dailyReport.updateReport (Mutation)` | `ShareReportDialog` |
| `/projects/[id]/workflow/reports/[reportId]` | `src/app/(app)/projects/[id]/workflow/reports/[reportId]/page.tsx` | `boq.list (Query)`, `material.list (Query)`, `project.get (Query)`, `workflow.dailyReport.deleteReport (Mutation)`, `workflow.dailyReport.getReport (Query)`, `workflow.dailyReport.updateReport (Mutation)`, `workflow.dailyReport.updateTaskExecution (Mutation)` | `AlertDialog`, `ShareReportDialog` |
| `/projects/[id]/workflow/reports/[reportId]/pdf-designer` | `src/app/(app)/projects/[id]/workflow/reports/[reportId]/pdf-designer/page.tsx` | `project.get (Query)`, `workflow.dailyReport.getReport (Query)` | — |
| `/projects/[id]/workflow/reports/[reportId]/pdf-render` | `src/app/(app)/projects/[id]/workflow/reports/[reportId]/pdf-render/page.tsx` | `workflow.dailyReport.getReport (Query)` | — |
| `/projects/[id]/workflow/reports/[reportId]/print` | `src/app/(app)/projects/[id]/workflow/reports/[reportId]/print/page.tsx` | `project.get (Query)`, `workflow.dailyReport.getReport (Query)` | — |
| `/projects/[id]/workflow/reports` | `src/app/(app)/projects/[id]/workflow/reports/page.tsx` | `project.get (Query)`, `workflow.dailyReport.createReport (Mutation)`, `workflow.dailyReport.listReports (Query)` | — |
| `/projects/[id]/workflow/rfi/[rfiId]/pdf-designer` | `src/app/(app)/projects/[id]/workflow/rfi/[rfiId]/pdf-designer/page.tsx` | `project.get (Query)`, `workflow.rfi.get (Query)` | — |
| `/projects/[id]/workflow/rfi` | `src/app/(app)/projects/[id]/workflow/rfi/page.tsx` | `project.get (Query)`, `workflow.rfi.bulkCreate (Mutation)`, `workflow.rfi.delete (Mutation)`, `workflow.rfi.list (Query)`, `workflow.rfi.update (Mutation)` | `AlertDialog`, `CreateRfiDialog`, `ViewRfiDialog` |
| `/projects` | `src/app/(app)/projects/page.tsx` | `project.create (Mutation)`, `project.list (Query)` | `CreateProjectDialog` |
| `/sync` | `src/app/(app)/sync/page.tsx` | — | — |
| `/team` | `src/app/(app)/team/page.tsx` | `project.createOrgUser (Mutation)`, `project.listOrgUsers (Query)`, `project.removeOrgUser (Mutation)`, `project.resetOrgUserPassword (Mutation)`, `project.updateOrgUserRole (Mutation)` | — |
| `/login` | `src/app/login/page.tsx` | — | — |
| `/offline` | `src/app/offline/page.tsx` | — | — |
| `/` | `src/app/page.tsx` | — | — |
| `/signup` | `src/app/signup/page.tsx` | — | — |

The coverage appendix assigns stable `ROUTE-001`–`ROUTE-064` and `WF-001`–`WF-041` IDs. The route component index is generated by `scripts/audit_frontend_archive.py` and records its input archive hash.

## Work required before T01 can close

1. Resolve the intended original revision and verify the bundle against its Git tree, or obtain the canonical checkout. Compare route, sidebar, workflow and backend inventories at that revision.
2. Resolve the M00-versus-archive mobile-surface discrepancy. Verify the target/deployed backend version, schema and API compatibility. If deployment evidence is outside this task, record it as an explicit prerequisite for T04.
3. Traverse page imports through dialogs, tables, hooks and child routes. Inventory every action, input/validation, lifecycle transition, permission, export/print, error and cancellation. The table above is only a direct-page index.
4. Map every operation to its actual root/nested procedure and effective server guard. Verify offline eligibility from the durable client command/outbox behavior; do not infer it from names.
5. Reconcile the 41 workflows with pages, mobile journeys, background jobs and cross-module consumers; add omitted actions and preserve source partial/deferred status.
6. Give each verified action a stable coverage ID, owner, source, service, permission, offline policy, scenario and platform evidence. Keep unresolved rows unverified.

## Evidence

- Route/sidebar counts were inspected in the ZIP with Python `zipfile`; exact bundle hash and archive comment appear above. The counts are recorded so the source scan can be independently repeated from the same archive.
- Compared archive pages/router source with `docs/frontend/route-parity.json`, `service-bindings.json`, `manifest.md` and `docs/reports/M00/feature-matrix.json`. These artifacts are not a verified common source snapshot.
- No original Git checkout was found in the inspected DSH session path. GitHub API access failed in this environment, so remote branches and open PRs could not be checked.
