# Original-product coverage seed — 2026-10-17

Current source audit: [M13 source reconciliation](../reports/M13/original-source-audit.md). The local source archive declares `7a5cccfd01484cc17b01e7c840fc0f35e87c1e58`; the earlier ledger declares `7d06a8a51826639b554e30d11a8b0b8f7d095259`. They remain unresolved until the canonical source is verified. Coverage statuses below remain unverified.

Current source audit: [M13 source reconciliation](../reports/M13/original-source-audit.md). The local archive declares `7a5cccfd01484cc17b01e7c840fc0f35e87c1e58`; the earlier route/service ledger declares `7d06a8a51826639b554e30d11a8b0b8f7d095259`. Their relationship is unverified; coverage rows remain unverified.

Companion to the [implementation plan](../plans/full-product-feature-navigation-plan.md) and [M13 register](../plans/milestones/M13-product-feature-navigation-closure.md).

These are proposed target destinations and task ownership, not verified implementation. All rows start **unverified**. The existing ledger supplies 64 routes; M00 supplies 41 workflows. T01 must reconcile their source revisions, inspect nested actions and mobile paths, add omissions and replace guessed service/offline bindings. Existing source status refers to the original product, never to Contractor.

## Route coverage

All rows also depend on T02–T05 routing/session/data/shell and T31–T32 acceptance/release. Source files are retained in `route-parity.json`; do not use its old keyword-derived destination labels as authority.

| Original route | Proposed destination | M13 packet(s) | Status |
|---|---|---|---|
| `/activity` | Desk / Activity | T06 | Unverified |
| `/admin/audit` | Privileged Admin / audit | T29 | Unverified |
| `/admin/data` | Privileged Admin / data | T29 | Unverified |
| `/admin/database` | Privileged Admin / database | T29 | Unverified |
| `/admin/organizations` | Privileged Admin / organizations | T29 | Unverified |
| `/admin` | Privileged Admin / Overview | T29 | Unverified |
| `/admin/settings` | Privileged Admin / settings | T29 | Unverified |
| `/admin/trials` | Privileged Admin / trials | T29 | Unverified |
| `/admin/users` | Privileged Admin / users | T29 | Unverified |
| `/dashboard` | Desk / Existing dashboard | T30 | Unverified |
| `/presets` | Materials / Presets and rate library | T09 | Unverified |
| `/projects/[id]/boq` | BOQ, VO & IPC / BOQ | T10 | Unverified |
| `/projects/[id]/boq/pdf-designer` | BOQ / PDF designer | T10 | Unverified |
| `/projects/[id]/budget-variance` | Finance / Budget variance | T25 | Unverified |
| `/projects/[id]/cash-flow` | Finance / Cash flow | T25 | Unverified |
| `/projects/[id]/communication` | Workflow / Communication | T18 | Unverified |
| `/projects/[id]/correspondence` | Documents / Correspondence | T28 | Unverified |
| `/projects/[id]/daily-program` | Workflow / Daily program | T18 | Unverified |
| `/projects/[id]/daily-reports/[reportId]` | Workflow / Report detail alias | T07 | Unverified |
| `/projects/[id]/daily-reports` | Workflow / Daily reports alias | T07 | Unverified |
| `/projects/[id]/dashboard` | Overview / Existing dashboard | T30 | Unverified |
| `/projects/[id]/document-center` | Documents / Document center | T28 | Unverified |
| `/projects/[id]/documents` | Documents / Register | T28 | Unverified |
| `/projects/[id]/drawings` | Documents / Drawings | T27 | Unverified |
| `/projects/[id]/equipment` | Equipment / Fleet and production | T21 | Unverified |
| `/projects/[id]/forms` | Documents / Forms | T28 | Unverified |
| `/projects/[id]/gantt/[versionId]/pdf-designer` | Planning / Schedule PDF designer | T17 | Unverified |
| `/projects/[id]/gantt` | Planning / Schedule | T17 | Unverified |
| `/projects/[id]/hr` | HR / Workforce | T08/T23 | Unverified |
| `/projects/[id]/ipc/[ipcId]` | BOQ, VO & IPC / IPC detail, view only | T16 | Unverified |
| `/projects/[id]/ipc/[ipcId]/pdf-designer` | IPC / Report layout/export, payment data read only | T16/T28 | Unverified |
| `/projects/[id]/ipc` | BOQ, VO & IPC / IPC register | T13/T16 | Unverified |
| `/projects/[id]/look-ahead` | Planning / Look-ahead | T17 | Unverified |
| `/projects/[id]/materials` | Materials / Procurement and stock | T19/T20 | Unverified |
| `/projects/[id]/meetings` | Workflow / Meetings | T18 | Unverified |
| `/projects/[id]` | Overview / Project details | T06 | Unverified |
| `/projects/[id]/payments` | Finance / Payments | T24 | Unverified |
| `/projects/[id]/planning-dashboard` | Planning / Overview | T30 | Unverified |
| `/projects/[id]/planning/revision/[versionId]` | Planning / Revision | T17 | Unverified |
| `/projects/[id]/punch-list` | Quality & Safety / Punch list | T26 | Unverified |
| `/projects/[id]/quality` | Quality & Safety / Quality | T26 | Unverified |
| `/projects/[id]/rfis` | Workflow / RFI alias | T18 | Unverified |
| `/projects/[id]/safety` | Quality & Safety / Safety | T26 | Unverified |
| `/projects/[id]/subcontractors` | Subcontractors / Contracts and billing | T22 | Unverified |
| `/projects/[id]/submittals` | Documents / Submittals | T28 | Unverified |
| `/projects/[id]/tax-summary` | Finance / Tax summary | T25 | Unverified |
| `/projects/[id]/variations/[voId]` | BOQ, VO & IPC / VO detail | T12 | Unverified |
| `/projects/[id]/variations` | BOQ, VO & IPC / VO register | T12 | Unverified |
| `/projects/[id]/workflow/program` | Workflow / Daily program | T18 | Unverified |
| `/projects/[id]/workflow/reports/[reportId]/edit` | Workflow / Report edit | T07 | Unverified |
| `/projects/[id]/workflow/reports/[reportId]` | Workflow / Report detail | T07 | Unverified |
| `/projects/[id]/workflow/reports/[reportId]/pdf-designer` | Workflow / Report PDF designer | T07/T28 | Unverified |
| `/projects/[id]/workflow/reports/[reportId]/pdf-render` | Workflow / Report render | T07/T28 | Unverified |
| `/projects/[id]/workflow/reports/[reportId]/print` | Workflow / Report print | T07/T28 | Unverified |
| `/projects/[id]/workflow/reports` | Workflow / Daily reports | T07 | Unverified |
| `/projects/[id]/workflow/rfi/[rfiId]/pdf-designer` | Workflow / RFI PDF designer | T18/T28 | Unverified |
| `/projects/[id]/workflow/rfi` | Workflow / RFIs | T18 | Unverified |
| `/projects` | Projects / Portfolio | T06 | Unverified |
| `/sync` | Utility / Sync Status | T04/T29 | Unverified |
| `/team` | HR / Team | T08 | Unverified |
| `/login` | Authentication / Login | T03/T29 | Unverified |
| `/offline` | Utility / Offline | T04/T29 | Unverified |
| `/` | Entry / Session-aware redirect | T03/T05 | Unverified |
| `/signup` | Authentication / Signup | T29 | Unverified |

The IPC PDF-designer route retains the original export/layout outcome without becoming an amount editor. If the full GridCraft print workflow replaces it, record that user-directed replacement and test its route/return/export behavior. Auth/admin/print aliases are retained even when not visible as ordinary L1 items.

## Workflow coverage

| Original workflow | Original status | M13 packet(s) | Contractor status |
|---|---|---|---|
| Daily Site Log & Diary | implemented | T07 | Unverified |
| Field Photo Snap & Geotagging | implemented | T07 | Unverified |
| Site Petty Cash & Expense Logging | implemented | T07 | Unverified |
| Direct Site Material Delivery | implemented | T07/T20 | Unverified |
| Field Offline Query Persistence & Sync | implemented | T04 | Unverified |
| BoQ Item Hierarchy & Quantities | implemented | T10 | Unverified |
| Government Rate Analysis (DoR/DUDBC Norms) | implemented | T11 | Unverified |
| Rate Profiles & Market Rate Revisions | implemented | T09/T11 | Unverified |
| BoQ Versioning & Change Comparison | implemented | T10 | Unverified |
| Interim Payment Certificate (IPC) Preparation | implemented | T13/T15/T16 | Unverified |
| Contract Deductions & Advance Recovery | implemented | T13/T15/T16 | Unverified |
| Price Escalation Billing (FIDIC / Standard Formula) | partial | T14/T15/T16 | Unverified |
| VAT Register & Tax Invoicing | implemented | T25 | Unverified |
| Site Purchase Requisitions & Approval | implemented | T19 | Unverified |
| Purchase Orders (PO) Generation & Tracking | implemented | T19 | Unverified |
| Warehouse Inventory & Stock Ledgers | implemented | T20 | Unverified |
| Inter-Site Material Transfers | implemented | T20 | Unverified |
| Fleet Registry & Rental Contracts | implemented | T21 | Unverified |
| Daily Fuel Dispensing & Dip-Reading Reconciliation | implemented | T21 | Unverified |
| Spot-Hire Equipment Work Orders | implemented | T21 | Unverified |
| Person-Grain Identity & Employment Contracts | implemented | T08 | Unverified |
| Staff Attendance & Leave Management | implemented | T07/T23 | Unverified |
| Payroll Calculation & Person Allocations (ADR-0007) | implemented | T07/T23 | Unverified |
| Day Book (Bahi Khata) & Project Ledgers | implemented | T24 | Unverified |
| Bank Guarantee Expiration & Release | implemented | T25 | Unverified |
| Fiscal Year Boundary Locks (ADR-0001) | implemented | T25 | Unverified |
| AutoCAD DXF / DWG Viewer | implemented | T27 | Unverified |
| Interactive CAD Command Engine | implemented | T27 | Unverified |
| CAD Plotting & Vector Export | implemented | T27 | Unverified |
| PDF Blueprint Viewer & Calibration | implemented | T27 | Unverified |
| Measurement Takeoff & BoQ Linking | implemented | T27 | Unverified |
| Interactive Gantt Chart Timeline | implemented | T17 | Unverified |
| Critical Path Method (CPM) Engine | implemented | T17 | Unverified |
| Bikram Sambat (BS) & Working Calendar | implemented | T17 | Unverified |
| Primavera P6 & MS Project Schedule Import | implemented | T17 | Unverified |
| Excel-Compatible Virtual Grid Spreadsheet | implemented | T10/T14 | Unverified |
| Excel (.xlsx) Round-Trip Import / Export | implemented | T10/T14 | Unverified |
| Joint Venture (JV) Partner Agreements & Profit Sharing | implemented | T25 | Unverified |
| RFI & Submittal Workflow Lifecycles | implemented | T18/T28 | Unverified |
| Responsibility Handover & Delegation Rules | implemented | T08/T18 | Unverified |
| Analytical Dashboard & Management KPIs | partial | T30 | Unverified |

## Gaps requiring expansion in T01

The route and workflow inventories do not enumerate every nested tab, dialog, button, permission, background-job effect or import/export consumer. Expand each row into action records before its implementation packet starts. In particular inspect organisation settings, mobile capture, notifications, staffing, fiscal controls, JV, trials and maintenance tools even where no dedicated page route exists.

Required action fields: stable ID; source revision/file/component; original route/tab; trigger and permitted state; input/output; service/command and lifecycle; capability; offline policy; target controller; dependencies; error/cancel behavior; evidence per platform; status/blocker; replacement decision where applicable.

Navigation-only aliases share action records but keep separate link/history tests. Source-partial workflows retain their limits. Unresolved references remain in the denominator as unverified rather than being removed to improve completion percentages.
