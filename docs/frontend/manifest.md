# Frontend Product Integration Manifest (Packet T01)

Status: Historical regex-generated seed. Superseded as a readiness claim by [M13 source audit](../reports/M13/original-source-audit.md).
Reference claim: `Construction_Manager` commit `7d06a8a51826639b554e30d11a8b0b8f7d095259` (not reconciled with the inspected ZIP comment).

The inspected archive declares `7a5cccfd01484cc17b01e7c840fc0f35e87c1e58`; its SHA-256 and limits are recorded in the M13 audit. The old procedure scanner misses 18 privileged admin procedures, guesses offline support from names, and generates client repository paths without verifying them. The 64 route rows are seed data only; inferred navigation labels, service coverage and offline policy are not authoritative. The source audit found 341 procedure definitions by the historical matcher plus the 18 omitted `superAdminProcedure` entries.
Generated Artifacts:
- Route Parity Ledger: [`route-parity.json`](route-parity.json) (64 routes inventoried)
- Service Bindings Ledger: [`service-bindings.json`](service-bindings.json) (323 authoritative procedures mapped)

---

## 1. Inventory Summary

| Scope | Total Routes | Implemented / Needs Shell Wiring | Adapter / Host Wiring Needed | Registered Target |
|---|---|---|---|---|
| **Organisation Scope** | 16 | 0 | 0 | 16 |
| **Project Scope** | 48 | 8 | 4 (BoQ, CAD, PDF, Takeoff) | 36 |
| **Total** | **64** | **8** | **4** | **52** |

### Procedure Breakdown:
- **Historical scanner output**: 323 procedure entries across 34 router source files. The scanner omits 18 admin procedures; see the source audit.
- **Offline Capable Operations**: 86 procedures (Daily report submission, attendance, material deliveries, petty cash, draft snapshots).
- **Online Only Operations**: 237 procedures (IPC certification, bank reconciliation, user roles, permission audits, contract posting).

---

## 2. Canonical 3-Level Rail Navigation Map

### A. Organisation Scope (`sidebar`: `#2E3A44`)
- **DESK**: Company overview, unified pending tasks, daily company feed.
- **PROJECTS**: Active & archived construction project portfolio.
- **MATERIALS**: Enterprise vendor registry, central rates norms, material catalog.
- **FINANCE**: Corporate chart of accounts, company-wide cash flow.
- **HR**: Enterprise staff directory, permanent employee management.
- **DOCUMENTS**: Company standards, contract templates.
- **SETTINGS**: Organization settings, access roles.

### B. Project Scope (`sidebarProject`: `#27323B`)
- **OVERVIEW**: Site dashboard, executive KPI summary.
- **PLANNING**: BoQ (`worksheet_viewport.dart`), TruePPM CPM Gantt, Look-Ahead schedule.
- **WORKFLOW**: Daily site diary (`daily_report_screen.dart`), RFIs, site meetings.
- **FIELD DATA**: Labor muster roll (`attendance_screen.dart`), Material delivery MRRs (`material_delivery_screen.dart`), Site petty cash vouchers (`site_expense_screen.dart`).
- **MATERIALS**: Site purchase orders, gate passes, store reconciliation.
- **EQUIPMENT**: Plant & machinery utilization logs, fuel reconciliation.
- **SUBCONTRACTORS**: Subcontractor measurements and work-done certificates.
- **HR**: Daily on-site trade workforce logs.
- **IPC & VO**: Interim Payment Certificates, Variation Orders.
- **QUALITY & SAFETY**: Quality checklists, punch list items, safety incident logs.
- **DOCUMENTS**: CAD drawings (`cad_viewport.dart`), PDF blueprints (`pdf_viewport.dart`), submittals.
- **FINANCE**: Project budget vs. actual, day book.

---

## 3. First-Wave Service Bindings (T05 Field Workflows)

| Screen | Client Source | Authoritative Procedures | Local Store / Outbox |
|---|---|---|---|
| **Daily Report** | `prototype/construction_client/lib/workflows/daily_report_screen.dart` | `workflow.createReport`, `workflow.getReport`, `workflow.updateReport` | `DailyReportWorkflowStore`, SQLite `daily_report_snapshots` |
| **Attendance** | `prototype/construction_client/lib/workflows/attendance_screen.dart` | `hr.logAttendance`, `hr.getAttendanceByDate` | `FieldExpansionWorkflowStore`, local muster queue |
| **Material MRR** | `prototype/construction_client/lib/workflows/material_delivery_screen.dart` | `material.createGateEntry`, `material.createTransaction` | `FieldExpansionWorkflowStore`, local gate pass queue |
| **Petty Cash** | `prototype/construction_client/lib/workflows/site_expense_screen.dart` | `projectCost.createExpense`, `projectCost.listExpenses` | `FieldExpansionWorkflowStore`, local voucher store |

---

## 4. T01 Verification & Gate Exit
- [x] Every original route has a registered identity, original file path, and target widget binding in `route-parity.json`.
- [x] Every procedure in `src/server/routers/` has an authoritative mapping in `service-bindings.json`.
- [x] Dual-scope Level 1 rail mapping and 3-level rail hierarchy are established.
- [x] Historical completion statement retained for audit trail; M13-T01 remains open until source identity, nested action behavior, guards, offline policies and backend compatibility are reconciled.
