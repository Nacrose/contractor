# Drawings and planning source-action reconciliation

Status: **Core drawing, takeoff, scheduling, calendar and import source boundaries reviewed for WF-027–035. Full trigger-level mapping and runtime acceptance remain open.**

Source baseline: private `Nacrose/Construction_Manager` commit `7d06a8a51826639b554e30d11a8b0b8f7d095259`. Stable route IDs and candidate operations are in the [41-workflow crosswalk](../../frontend/original-workflow-source-crosswalk.json) and [canonical action index](../../frontend/original-action-component-index.json).

## Reviewed workflows

| Workflow | Routes and source behavior |
|---|---|
| WF-027 AutoCAD DXF / DWG Viewer | Drawing register and project drawings (`ROUTE-072`, `ROUTE-024`). Parser/rendering libraries live under `src/lib/dxf`, `src/lib/dwg` and `src/lib/cad`; the drawing register API manages drawing metadata and uploaded revisions. These route/service links do not establish which viewer features are active in each file type. |
| WF-028 Interactive CAD Command Engine | Drawing register/project drawings and PDF canvas (`ROUTE-072`, `ROUTE-024`, `ROUTE-107`). CAD command registry and entity operations are client/library code; document APIs handle drawing records and markups. Exact command availability and keyboard/control paths remain to be matched to trigger IDs. |
| WF-029 CAD Plotting & Vector Export | Drawing register/project drawings and PDF rendering (`ROUTE-072`, `ROUTE-024`, `ROUTE-108`). Plot and SVG export engines are library paths, while the route candidate set also includes drawing CRUD APIs; the crosswalk does not yet prove export controls call those services or that all advertised layout options work. |
| WF-030 PDF Blueprint Viewer & Calibration | Project drawings, PDF canvas and rendering (`ROUTE-024`, `ROUTE-107`, `ROUTE-108`). Measurement/calibration lives in the document engine and PDF canvas components. Drawing metadata mutations have `project.drawings.edit`; reads require `project.drawings.view`. |
| WF-031 Measurement Takeoff & BoQ Linking | Drawing progress, PDF canvas and BOQ (`ROUTE-097`, `ROUTE-107`, `ROUTE-012`). Drawing markups and BOQ are separate scopes. Linking a takeoff to an item must preserve the drawing markup record and require both applicable drawing and BOQ permissions where mutations cross those domains. |
| WF-032 Interactive Gantt Chart Timeline | Project schedule and planning overview (`ROUTE-028`, `ROUTE-038`). Gantt is assembled from task, dependency, calendar, import, version and analytics routers; it supports task create/update/move, dependency edits, progress and version operations. Most task mutations require `project.gantt.edit`. |
| WF-033 Critical Path Method (CPM) Engine | Same schedule and overview routes. The pure CPM engine computes early/late dates, total float and critical status; dependency edits reject self-links and cycles. Persisted recalculation is separate from pure calculation and must be traced to its route call path. |
| WF-034 Bikram Sambat (BS) & Working Calendar | Same schedule/overview routes. Nepal AD/BS conversion utilities coexist with immutable working-calendar snapshots (timezone, workdays, exceptions and hours/day). Calendar snapshots make schedule calculations deterministic; org calendar administration and project overrides use distinct grants. |
| WF-035 Primavera P6 & MS Project Schedule Import | Schedule route (`ROUTE-028`); `ROUTE-027` PDF designer is a broad crosswalk candidate and is not established as the import screen. `gantt-import.ts` parses MS Project XML and P6 XER, previews without database writes, and commits through a separate mutation. |

## Permission and transaction contracts

- Drawing reads require `project.drawings.view`; record changes require `project.drawings.edit`. Drawing deletion uses the document-delete grant. Drawing approval has its own `project.documents.approve` action. Creating an RFI from a drawing requires RFI edit authority as well as a project-owned drawing. Several mutations recheck permission inside the tenant transaction.
- BOQ and Gantt are separate permission domains. Linking/unlinking BOQ from a task checks both Gantt edit and BOQ edit in the transaction. Dependency and task changes require Gantt edit and protect version scope/cycle rules.
- Import preview and commit both require an editable schedule version and Gantt edit authority. XML input is capped at 5 MB, parsers reject empty task sets, and preview is read-only. Commit parses again and applies merge/replace, dependency rebuild, WBS recoding and CPM recalculation in one context-pinned transaction; resource assignment data is documented separately from that transaction and must be checked as its own consistency edge.
- The Nepal default calendar is Sunday–Friday working, Saturday off, 8 hours per day, with an explicit holiday snapshot. Project-specific exceptions override standard days. Approved baselines retain their calendar revision; edits create a newer snapshot. Do not recalculate an approved schedule against ambient current holidays without preserving its snapshot provenance.

## Mapping limits and Contractor implications

One drawing route serves several different viewer, markup, PDF and CAD features, while the action index primarily records tRPC operations. Pure client-side operations (zoom, snapping, commands, export, calibration and measurement) do not necessarily correspond to a server mutation. The Gantt page similarly exposes a large shared action set for CPM, calendar, progress, import and versioning. These are candidate service/route associations; full UI controls, file-format coverage, export fidelity, numerical fixtures and background recalculation paths remain to be verified.

Contractor should treat takeoff markups and BOQ quantity changes as separately permissioned records, preserve drawing revision provenance, and keep schedule calculation tied to a versioned calendar snapshot. Imports need a preview/commit boundary with all-or-nothing schedule changes and clear conflict behavior. The source contains tests listed by M00, but this review does not claim those tests were run.

M00 marks these workflows implemented. T01 still needs control-by-control trigger disposition and sample files/numerical acceptance; T04 still needs deployed-backend compatibility evidence.
