# Original-product coverage seed — 2026-10-17

Current source audit: [M13 source reconciliation](../reports/M13/original-source-audit.md), with a [110-route canonical component/procedure/API index](original-action-component-index.json), a [41-workflow crosswalk](original-workflow-source-crosswalk.json), and a [UI trigger-candidate sidecar](original-interaction-trigger-candidates.jsonl). The supplied archive has 64 distinct URL paths and is not a copy of canonical commit `7d06a8a51826639b554e30d11a8b0b8f7d095259`; its ZIP comment claims a nonexistent commit. The coverage retains all 110 canonical routes, nine disputed archive-only candidates, and one invalid duplicate-root seed row excluded from the route denominator. All real route/workflow implementation statuses stay unverified.

Companion to the [implementation plan](../plans/full-product-feature-navigation-plan.md) and [M13 register](../plans/milestones/M13-product-feature-navigation-closure.md).

These are proposed target destinations and task ownership, not verified implementation. All real route rows remain unverified; nine archive-only paths are explicitly retained as disputed candidates. The archive has 64 distinct URL paths; after stripping Next.js route groups, 55 paths are shared, the canonical checkout adds 55 paths, and the archive contributes nine paths absent from the canonical checkout. M00 supplies 41 workflows, each cross-referenced to canonical routes, service candidates and the original platform/status record. T01 still requires action, permission and lifecycle review plus backend deployment compatibility. Existing source status refers to the original product, never to Contractor.

## Route coverage

All rows also depend on T02–T05 routing/session/data/shell and T31–T32 acceptance/release. Source files are retained in `route-parity.json`; do not use its old keyword-derived destination labels as authority.

| ID | Original route | Proposed destination | M13 packet(s) | Status |
|---|---|---|---|
| `ROUTE-001` | `/activity` | Desk / Activity | T06 | Unverified |
| `ROUTE-002` | `/admin/audit` | Privileged Admin / audit | T29 | Unverified |
| `ROUTE-003` | `/admin/data` | Privileged Admin / data | T29 | Archive-only snapshot; unverified |
| `ROUTE-004` | `/admin/database` | Privileged Admin / database | T29 | Unverified |
| `ROUTE-005` | `/admin/organizations` | Privileged Admin / organizations | T29 | Unverified |
| `ROUTE-006` | `/admin` | Privileged Admin / Overview | T29 | Unverified |
| `ROUTE-007` | `/admin/settings` | Privileged Admin / settings | T29 | Unverified |
| `ROUTE-008` | `/admin/trials` | Privileged Admin / trials | T29 | Unverified |
| `ROUTE-009` | `/admin/users` | Privileged Admin / users | T29 | Unverified |
| `ROUTE-010` | `/dashboard` | Desk / Existing dashboard | T30 | Unverified |
| `ROUTE-011` | `/presets` | Materials / Presets and rate library | T09 | Unverified |
| `ROUTE-012` | `/projects/[id]/boq` | BOQ, VO & IPC / BOQ | T10 | Unverified |
| `ROUTE-013` | `/projects/[id]/boq/pdf-designer` | BOQ / PDF designer | T10 | Archive-only snapshot; unverified |
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
| `ROUTE-027` | `/projects/[id]/gantt/[versionId]/pdf-designer` | Planning / Schedule PDF designer | T17 | Archive-only snapshot; unverified |
| `ROUTE-028` | `/projects/[id]/gantt` | Planning / Schedule | T17 | Unverified |
| `ROUTE-029` | `/projects/[id]/hr` | HR / Workforce | T08/T23 | Unverified |
| `ROUTE-030` | `/projects/[id]/ipc/[ipcId]` | BOQ, VO & IPC / IPC detail, view only | T16 | Unverified |
| `ROUTE-031` | `/projects/[id]/ipc/[ipcId]/pdf-designer` | IPC / Report layout/export, payment data read only | T16/T28 | Archive-only snapshot; unverified |
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
| `ROUTE-052` | `/projects/[id]/workflow/reports/[reportId]/pdf-designer` | Workflow / Report PDF designer | T07/T28 | Archive-only snapshot; unverified |
| `ROUTE-053` | `/projects/[id]/workflow/reports/[reportId]/pdf-render` | Workflow / Report render | T07/T28 | Archive-only snapshot; unverified |
| `ROUTE-054` | `/projects/[id]/workflow/reports/[reportId]/print` | Workflow / Report print | T07/T28 | Archive-only snapshot; unverified |
| `ROUTE-055` | `/projects/[id]/workflow/reports` | Workflow / Daily reports | T07 | Unverified |
| `ROUTE-056` | `/projects/[id]/workflow/rfi/[rfiId]/pdf-designer` | Workflow / RFI PDF designer | T18/T28 | Archive-only snapshot; unverified |
| `ROUTE-057` | `/projects/[id]/workflow/rfi` | Workflow / RFIs | T18 | Unverified |
| `ROUTE-058` | `/projects` | Projects / Portfolio | T06 | Unverified |
| `ROUTE-059` | `/sync` | Utility / Sync Status | T04/T29 | Unverified |
| `ROUTE-060` | `/team` | HR / Team | T08 | Archive-only snapshot; unverified |
| `ROUTE-061` | `/login` | Authentication / Login | T03/T29 | Unverified |
| `ROUTE-062` | `/offline` | Utility / Offline | T04/T29 | Unverified |
| `ROUTE-063` | `/` | Entry / Session-aware redirect | T03/T05 | Unverified |
| `ROUTE-064` | `/signup` | Authentication / Signup | T29 | Unverified |

The IPC PDF-designer route retains the original export/layout outcome without becoming an amount editor. If the full GridCraft print workflow replaces it, record that user-directed replacement and test its route/return/export behavior. Auth/admin/print aliases are retained even when not visible as ordinary L1 items.

Canonical-commit routes missing from the supplied archive are listed below. Their proposed destination and M13 owner are assigned from route identity and source-module evidence; action-level ownership and behavior still require review.
| `INVALID-ROUTE-SEED-001` | `//` | Invalid duplicate-root normalization from the earlier seed; excluded from source-route denominator | T01 | Excluded after source comparison |
| `ROUTE-066` | `/activate-account` | Authentication / Account activation | T03/T29 | Unverified |
| `ROUTE-067` | `/admin/holidays` | Privileged Admin / Holidays | T29 | Unverified |
| `ROUTE-068` | `/admin/login` | Privileged Admin / Sign in | T03/T29 | Unverified |
| `ROUTE-069` | `/admin/material-catalog` | Materials / Privileged material catalog | T09/T29 | Unverified |
| `ROUTE-070` | `/admin/rate-catalogs` | Materials / Privileged rate catalogs | T09/T29 | Unverified |
| `ROUTE-071` | `/correspondence` | Documents / Correspondence | T28 | Unverified |
| `ROUTE-072` | `/drawings` | Documents / Drawing register | T27 | Unverified |
| `ROUTE-073` | `/field-submissions` | Field Data / Submission review inbox | T07 | Unverified |
| `ROUTE-074` | `/finance` | Finance / Organisation finance overview | T24/T25 | Unverified |
| `ROUTE-075` | `/hr-organization` | HR / Organisation people directory | T08 | Unverified |
| `ROUTE-076` | `/inventory` | Materials / Inventory | T20 | Unverified |
| `ROUTE-077` | `/m` | Field Data / Mobile field home | T07 | Unverified |
| `ROUTE-078` | `/m/chat` | Workflow / Mobile chat channels | T18 | Unverified |
| `ROUTE-079` | `/m/chat/[channelId]` | Workflow / Mobile chat detail | T18 | Unverified |
| `ROUTE-080` | `/m/log` | Field Data / Mobile capture menu | T07 | Unverified |
| `ROUTE-081` | `/m/log/expense` | Field Data / Expense capture | T07 | Unverified |
| `ROUTE-082` | `/m/log/material` | Field Data / Material capture | T07 | Unverified |
| `ROUTE-083` | `/m/log/report` | Field Data / Daily report capture | T07 | Unverified |
| `ROUTE-084` | `/m/more` | Field Data / Mobile navigation | T07 | Unverified |
| `ROUTE-085` | `/m/notifications` | Desk / Mobile notifications | T06/T18 | Unverified |
| `ROUTE-086` | `/m/photos` | Field Data / Photo capture | T07 | Unverified |
| `ROUTE-087` | `/m/simple/expense` | Field Data / Simple expense capture alias | T07 | Unverified |
| `ROUTE-088` | `/m/simple/labour` | Field Data / Simple labour capture alias | T07/T23 | Unverified |
| `ROUTE-089` | `/m/simple/material` | Field Data / Simple material capture alias | T07/T20 | Unverified |
| `ROUTE-090` | `/m/sites` | Projects / Mobile project selection | T06 | Unverified |
| `ROUTE-091` | `/m/sync` | Utility / Mobile sync status | T04 | Unverified |
| `ROUTE-092` | `/m/tasks` | Quality & Safety / Mobile punch list | T26 | Unverified |
| `ROUTE-093` | `/m/tasks/new` | Quality & Safety / Mobile punch item capture | T26 | Unverified |
| `ROUTE-094` | `/materials` | Materials / Organisation catalog | T09 | Unverified |
| `ROUTE-095` | `/my-access` | Authentication / Access request status | T03/T29 | Unverified |
| `ROUTE-096` | `/projects/[id]/accounting` | Finance / Project accounting | T24 | Unverified |
| `ROUTE-097` | `/projects/[id]/drawings/progress` | Documents / Drawing progress | T27 | Unverified |
| `ROUTE-098` | `/projects/[id]/equipment/utilization` | Equipment / Utilization | T21 | Unverified |
| `ROUTE-099` | `/projects/[id]/expenses` | Field Data / Project expenses | T07/T24 | Unverified |
| `ROUTE-100` | `/projects/[id]/field-data` | Field Data / Project field records | T07 | Unverified |
| `ROUTE-101` | `/projects/[id]/field-submissions` | Field Data / Submission review inbox | T07 | Unverified |
| `ROUTE-102` | `/projects/[id]/hr/hierarchy` | HR / Workforce hierarchy | T08 | Unverified |
| `ROUTE-103` | `/projects/[id]/hr/team` | HR / Project team | T08 | Unverified |
| `ROUTE-104` | `/projects/[id]/ipc/[ipcId]/worksheets` | BOQ, VO & IPC / Open this IPC workbook in full GridCraft | T13/T16 | Unverified |
| `ROUTE-105` | `/projects/[id]/material-library` | Materials / Project material library | T09 | Unverified |
| `ROUTE-106` | `/projects/[id]/materials/stock-alerts` | Materials / Stock alerts | T20 | Unverified |
| `ROUTE-107` | `/projects/[id]/pdf-canvas` | Documents / Project PDF canvas | T27/T28 | Unverified |
| `ROUTE-108` | `/projects/[id]/pdf-canvas/render` | Documents / Project PDF rendering | T27/T28 | Unverified |
| `ROUTE-109` | `/projects/[id]/planning/roles` | Planning / Schedule roles | T17 | Unverified |
| `ROUTE-110` | `/projects/[id]/production` | Planning / Project production tracking | T17 | Unverified |
| `ROUTE-111` | `/projects/[id]/rate-library` | BOQ, VO & IPC / Rate library | T11 | Unverified |
| `ROUTE-112` | `/projects/[id]/subcontractors/billing` | Subcontractors / Billing | T22 | Unverified |
| `ROUTE-113` | `/projects/[id]/vendors` | Materials / Project vendors | T09 | Unverified |
| `ROUTE-114` | `/projects/[id]/vendors/performance` | Materials / Vendor performance | T09/T19 | Unverified |
| `ROUTE-115` | `/projects/[id]/workflow/program/my-tasks` | Workflow / My tasks | T18 | Unverified |
| `ROUTE-116` | `/projects/new` | Projects / Create project | T06 | Unverified |
| `ROUTE-117` | `/rate-catalogs` | Materials / Rate catalogs | T09/T11 | Unverified |
| `ROUTE-118` | `/settings` | Settings / Organisation settings | T29 | Unverified |
| `ROUTE-119` | `/vendors` | Materials / Organisation vendors | T09 | Unverified |
| `ROUTE-120` | `/worksheet-lab` | BOQ, VO & IPC / Worksheet capability laboratory | T10/T14 | Unverified |


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
