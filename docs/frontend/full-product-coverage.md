# Original-product coverage seed — 2026-10-17

Current source audit: [M13 source reconciliation](../reports/M13/original-source-audit.md), with a [64-route reachable-component/procedure index](original-action-component-index.json). The local archive declares `7a5cccfd01484cc17b01e7c840fc0f35e87c1e58`; the earlier ledger declares `7d06a8a51826639b554e30d11a8b0b8f7d095259`. Their relationship remains unverified, so all coverage statuses stay unverified.

Companion to the [implementation plan](../plans/full-product-feature-navigation-plan.md) and [M13 register](../plans/milestones/M13-product-feature-navigation-closure.md).

These are proposed target destinations and task ownership, not verified implementation. All rows start **unverified**. The existing ledger supplies 64 routes; M00 supplies 41 workflows. T01 must reconcile their source revisions, inspect nested actions and mobile paths, add omissions and replace guessed service/offline bindings. Existing source status refers to the original product, never to Contractor.

## Route coverage

All rows also depend on T02–T05 routing/session/data/shell and T31–T32 acceptance/release. Source files are retained in `route-parity.json`; do not use its old keyword-derived destination labels as authority.

| ID | Original route | Proposed destination | M13 packet(s) | Status |
|---|---|---|---|
| `ROUTE-001` | `/activity` | Desk / Activity | T06 | Unverified |
| `ROUTE-002` | `/admin/audit` | Privileged Admin / audit | T29 | Unverified |
| `ROUTE-003` | `/admin/data` | Privileged Admin / data | T29 | Unverified |
| `ROUTE-004` | `/admin/database` | Privileged Admin / database | T29 | Unverified |
| `ROUTE-005` | `/admin/organizations` | Privileged Admin / organizations | T29 | Unverified |
| `ROUTE-006` | `/admin` | Privileged Admin / Overview | T29 | Unverified |
| `ROUTE-007` | `/admin/settings` | Privileged Admin / settings | T29 | Unverified |
| `ROUTE-008` | `/admin/trials` | Privileged Admin / trials | T29 | Unverified |
| `ROUTE-009` | `/admin/users` | Privileged Admin / users | T29 | Unverified |
| `ROUTE-010` | `/dashboard` | Desk / Existing dashboard | T30 | Unverified |
| `ROUTE-011` | `/presets` | Materials / Presets and rate library | T09 | Unverified |
| `ROUTE-012` | `/projects/[id]/boq` | BOQ, VO & IPC / BOQ | T10 | Unverified |
| `ROUTE-013` | `/projects/[id]/boq/pdf-designer` | BOQ / PDF designer | T10 | Unverified |
| `ROUTE-014` | `/projects/[id]/budget-variance` | Finance / Budget variance | T25 | Unverified |
| `ROUTE-015` | `/projects/[id]/cash-flow` | Finance / Cash flow | T25 | Unverified |
| `ROUTE-016` | `/projects/[id]/communication` | Workflow / Communication | T18 | Unverified |
| `ROUTE-017` | `/projects/[id]/correspondence` | Documents / Correspondence | T28 | Unverified |
| `ROUTE-018` | `/projects/[id]/daily-program` | Workflow / Daily program | T18 | Unverified |
| `ROUTE-019` | `/projects/[id]/daily-reports/[reportId]` | Workflow / Report detail alias | T07 | Unverified |
| `ROUTE-020` | `/projects/[id]/daily-reports` | Workflow / Daily reports alias | T07 | Unverified |
| `ROUTE-021` | `/projects/[id]/dashboard` | Overview / Existing dashboard | T30 | Unverified |
| `ROUTE-022` | `/projects/[id]/document-center` | Documents / Document center | T28 | Unverified |
| `ROUTE-023` | `/projects/[id]/documents` | Documents / Register | T28 | Unverified |
| `ROUTE-024` | `/projects/[id]/drawings` | Documents / Drawings | T27 | Unverified |
| `ROUTE-025` | `/projects/[id]/equipment` | Equipment / Fleet and production | T21 | Unverified |
| `ROUTE-026` | `/projects/[id]/forms` | Documents / Forms | T28 | Unverified |
| `ROUTE-027` | `/projects/[id]/gantt/[versionId]/pdf-designer` | Planning / Schedule PDF designer | T17 | Unverified |
| `ROUTE-028` | `/projects/[id]/gantt` | Planning / Schedule | T17 | Unverified |
| `ROUTE-029` | `/projects/[id]/hr` | HR / Workforce | T08/T23 | Unverified |
| `ROUTE-030` | `/projects/[id]/ipc/[ipcId]` | BOQ, VO & IPC / IPC detail, view only | T16 | Unverified |
| `ROUTE-031` | `/projects/[id]/ipc/[ipcId]/pdf-designer` | IPC / Report layout/export, payment data read only | T16/T28 | Unverified |
| `ROUTE-032` | `/projects/[id]/ipc` | BOQ, VO & IPC / IPC register | T13/T16 | Unverified |
| `ROUTE-033` | `/projects/[id]/look-ahead` | Planning / Look-ahead | T17 | Unverified |
| `ROUTE-034` | `/projects/[id]/materials` | Materials / Procurement and stock | T19/T20 | Unverified |
| `ROUTE-035` | `/projects/[id]/meetings` | Workflow / Meetings | T18 | Unverified |
| `ROUTE-036` | `/projects/[id]` | Overview / Project details | T06 | Unverified |
| `ROUTE-037` | `/projects/[id]/payments` | Finance / Payments | T24 | Unverified |
| `ROUTE-038` | `/projects/[id]/planning-dashboard` | Planning / Overview | T30 | Unverified |
| `ROUTE-039` | `/projects/[id]/planning/revision/[versionId]` | Planning / Revision | T17 | Unverified |
| `ROUTE-040` | `/projects/[id]/punch-list` | Quality & Safety / Punch list | T26 | Unverified |
| `ROUTE-041` | `/projects/[id]/quality` | Quality & Safety / Quality | T26 | Unverified |
| `ROUTE-042` | `/projects/[id]/rfis` | Workflow / RFI alias | T18 | Unverified |
| `ROUTE-043` | `/projects/[id]/safety` | Quality & Safety / Safety | T26 | Unverified |
| `ROUTE-044` | `/projects/[id]/subcontractors` | Subcontractors / Contracts and billing | T22 | Unverified |
| `ROUTE-045` | `/projects/[id]/submittals` | Documents / Submittals | T28 | Unverified |
| `ROUTE-046` | `/projects/[id]/tax-summary` | Finance / Tax summary | T25 | Unverified |
| `ROUTE-047` | `/projects/[id]/variations/[voId]` | BOQ, VO & IPC / VO detail | T12 | Unverified |
| `ROUTE-048` | `/projects/[id]/variations` | BOQ, VO & IPC / VO register | T12 | Unverified |
| `ROUTE-049` | `/projects/[id]/workflow/program` | Workflow / Daily program | T18 | Unverified |
| `ROUTE-050` | `/projects/[id]/workflow/reports/[reportId]/edit` | Workflow / Report edit | T07 | Unverified |
| `ROUTE-051` | `/projects/[id]/workflow/reports/[reportId]` | Workflow / Report detail | T07 | Unverified |
| `ROUTE-052` | `/projects/[id]/workflow/reports/[reportId]/pdf-designer` | Workflow / Report PDF designer | T07/T28 | Unverified |
| `ROUTE-053` | `/projects/[id]/workflow/reports/[reportId]/pdf-render` | Workflow / Report render | T07/T28 | Unverified |
| `ROUTE-054` | `/projects/[id]/workflow/reports/[reportId]/print` | Workflow / Report print | T07/T28 | Unverified |
| `ROUTE-055` | `/projects/[id]/workflow/reports` | Workflow / Daily reports | T07 | Unverified |
| `ROUTE-056` | `/projects/[id]/workflow/rfi/[rfiId]/pdf-designer` | Workflow / RFI PDF designer | T18/T28 | Unverified |
| `ROUTE-057` | `/projects/[id]/workflow/rfi` | Workflow / RFIs | T18 | Unverified |
| `ROUTE-058` | `/projects` | Projects / Portfolio | T06 | Unverified |
| `ROUTE-059` | `/sync` | Utility / Sync Status | T04/T29 | Unverified |
| `ROUTE-060` | `/team` | HR / Team | T08 | Unverified |
| `ROUTE-061` | `/login` | Authentication / Login | T03/T29 | Unverified |
| `ROUTE-062` | `/offline` | Utility / Offline | T04/T29 | Unverified |
| `ROUTE-063` | `/` | Entry / Session-aware redirect | T03/T05 | Unverified |
| `ROUTE-064` | `/signup` | Authentication / Signup | T29 | Unverified |

The IPC PDF-designer route retains the original export/layout outcome without becoming an amount editor. If the full GridCraft print workflow replaces it, record that user-directed replacement and test its route/return/export behavior. Auth/admin/print aliases are retained even when not visible as ordinary L1 items.

## Workflow coverage

| ID | Original workflow | Original status | M13 packet(s) | Contractor status |
|---|---|---|---|
| `WF-001` | Daily Site Log & Diary | implemented | T07 | Unverified |
| `WF-002` | Field Photo Snap & Geotagging | implemented | T07 | Unverified |
| `WF-003` | Site Petty Cash & Expense Logging | implemented | T07 | Unverified |
| `WF-004` | Direct Site Material Delivery | implemented | T07/T20 | Unverified |
| `WF-005` | Field Offline Query Persistence & Sync | implemented | T04 | Unverified |
| `WF-006` | BoQ Item Hierarchy & Quantities | implemented | T10 | Unverified |
| `WF-007` | Government Rate Analysis (DoR/DUDBC Norms) | implemented | T11 | Unverified |
| `WF-008` | Rate Profiles & Market Rate Revisions | implemented | T09/T11 | Unverified |
| `WF-009` | BoQ Versioning & Change Comparison | implemented | T10 | Unverified |
| `WF-010` | Interim Payment Certificate (IPC) Preparation | implemented | T13/T15/T16 | Unverified |
| `WF-011` | Contract Deductions & Advance Recovery | implemented | T13/T15/T16 | Unverified |
| `WF-012` | Price Escalation Billing (FIDIC / Standard Formula) | partial | T14/T15/T16 | Unverified |
| `WF-013` | VAT Register & Tax Invoicing | implemented | T25 | Unverified |
| `WF-014` | Site Purchase Requisitions & Approval | implemented | T19 | Unverified |
| `WF-015` | Purchase Orders (PO) Generation & Tracking | implemented | T19 | Unverified |
| `WF-016` | Warehouse Inventory & Stock Ledgers | implemented | T20 | Unverified |
| `WF-017` | Inter-Site Material Transfers | implemented | T20 | Unverified |
| `WF-018` | Fleet Registry & Rental Contracts | implemented | T21 | Unverified |
| `WF-019` | Daily Fuel Dispensing & Dip-Reading Reconciliation | implemented | T21 | Unverified |
| `WF-020` | Spot-Hire Equipment Work Orders | implemented | T21 | Unverified |
| `WF-021` | Person-Grain Identity & Employment Contracts | implemented | T08 | Unverified |
| `WF-022` | Staff Attendance & Leave Management | implemented | T07/T23 | Unverified |
| `WF-023` | Payroll Calculation & Person Allocations (ADR-0007) | implemented | T07/T23 | Unverified |
| `WF-024` | Day Book (Bahi Khata) & Project Ledgers | implemented | T24 | Unverified |
| `WF-025` | Bank Guarantee Expiration & Release | implemented | T25 | Unverified |
| `WF-026` | Fiscal Year Boundary Locks (ADR-0001) | implemented | T25 | Unverified |
| `WF-027` | AutoCAD DXF / DWG Viewer | implemented | T27 | Unverified |
| `WF-028` | Interactive CAD Command Engine | implemented | T27 | Unverified |
| `WF-029` | CAD Plotting & Vector Export | implemented | T27 | Unverified |
| `WF-030` | PDF Blueprint Viewer & Calibration | implemented | T27 | Unverified |
| `WF-031` | Measurement Takeoff & BoQ Linking | implemented | T27 | Unverified |
| `WF-032` | Interactive Gantt Chart Timeline | implemented | T17 | Unverified |
| `WF-033` | Critical Path Method (CPM) Engine | implemented | T17 | Unverified |
| `WF-034` | Bikram Sambat (BS) & Working Calendar | implemented | T17 | Unverified |
| `WF-035` | Primavera P6 & MS Project Schedule Import | implemented | T17 | Unverified |
| `WF-036` | Excel-Compatible Virtual Grid Spreadsheet | implemented | T10/T14 | Unverified |
| `WF-037` | Excel (.xlsx) Round-Trip Import / Export | implemented | T10/T14 | Unverified |
| `WF-038` | Joint Venture (JV) Partner Agreements & Profit Sharing | implemented | T25 | Unverified |
| `WF-039` | RFI & Submittal Workflow Lifecycles | implemented | T18/T28 | Unverified |
| `WF-040` | Responsibility Handover & Delegation Rules | implemented | T08/T18 | Unverified |
| `WF-041` | Analytical Dashboard & Management KPIs | partial | T30 | Unverified |

## Gaps requiring expansion in T01

The route and workflow inventories do not enumerate every nested tab, dialog, button, permission, background-job effect or import/export consumer. Expand each row into action records before its implementation packet starts. In particular inspect organisation settings, mobile capture, notifications, staffing, fiscal controls, JV, trials and maintenance tools even where no dedicated page route exists.

Required action fields: stable ID; source revision/file/component; original route/tab; trigger and permitted state; input/output; service/command and lifecycle; capability; offline policy; target controller; dependencies; error/cancel behavior; evidence per platform; status/blocker; replacement decision where applicable.

Navigation-only aliases share action records but keep separate link/history tests. Source-partial workflows retain their limits. Unresolved references remain in the denominator as unverified rather than being removed to improve completion percentages.
