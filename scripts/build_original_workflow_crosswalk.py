#!/usr/bin/env python3
"""Build the M00 workflow to canonical source/action crosswalk for M13-T01."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path("/private/tmp/m13-construction-manager-source")
MATRIX = ROOT / "docs/reports/M00/feature-matrix.json"
COVERAGE = ROOT / "docs/frontend/full-product-coverage.md"
INDEX = ROOT / "docs/frontend/original-action-component-index.json"
TRIGGERS = ROOT / "docs/frontend/original-interaction-trigger-candidates.jsonl"
OUTPUT = ROOT / "docs/frontend/original-workflow-source-crosswalk.json"

# These are route-to-workflow cross-references from the M00 workflow names and
# canonical page purposes. They are explicit review mappings, not proof that
# every source interaction in the page implements the full workflow.
WORKFLOW_ROUTES = {
    "WF-001": ["/m/log/report", "/projects/[id]/workflow/reports", "/projects/[id]/workflow/reports/[reportId]", "/projects/[id]/workflow/reports/[reportId]/edit"],
    "WF-002": ["/m/photos", "/projects/[id]/field-data", "/projects/[id]/drawings/progress"],
    "WF-003": ["/m/log/expense", "/m/simple/expense", "/projects/[id]/expenses"],
    "WF-004": ["/m/log/material", "/m/simple/material", "/projects/[id]/field-submissions", "/projects/[id]/materials"],
    "WF-005": ["/sync", "/m/sync", "/offline"],
    "WF-006": ["/projects/[id]/boq"],
    "WF-007": ["/projects/[id]/boq", "/projects/[id]/rate-library"],
    "WF-008": ["/rate-catalogs", "/projects/[id]/rate-library", "/projects/[id]/boq", "/admin/rate-catalogs"],
    # Snapshot controls are rendered by BoqVersionsTab on the Variation Orders
    # page; the planning revision route is Gantt-owned. IPC detail also reads
    # a snapshot diff for the selected baseline.
    "WF-009": ["/projects/[id]/variations", "/projects/[id]/ipc/[ipcId]"],
    "WF-010": ["/projects/[id]/ipc", "/projects/[id]/ipc/[ipcId]", "/projects/[id]/ipc/[ipcId]/worksheets"],
    "WF-011": ["/projects/[id]/ipc", "/projects/[id]/ipc/[ipcId]", "/projects/[id]/ipc/[ipcId]/worksheets"],
    "WF-012": ["/projects/[id]/ipc", "/projects/[id]/ipc/[ipcId]", "/projects/[id]/ipc/[ipcId]/worksheets"],
    "WF-013": ["/projects/[id]/tax-summary", "/finance", "/projects/[id]/accounting"],
    "WF-014": ["/projects/[id]/materials", "/projects/[id]/vendors"],
    "WF-015": ["/projects/[id]/materials", "/projects/[id]/vendors"],
    "WF-016": ["/inventory", "/projects/[id]/materials", "/projects/[id]/materials/stock-alerts"],
    "WF-017": ["/inventory", "/projects/[id]/materials"],
    "WF-018": ["/projects/[id]/equipment", "/projects/[id]/equipment/utilization"],
    "WF-019": ["/projects/[id]/equipment", "/projects/[id]/equipment/utilization"],
    "WF-020": ["/projects/[id]/equipment", "/projects/[id]/equipment/utilization"],
    "WF-021": ["/team", "/hr-organization", "/projects/[id]/hr", "/projects/[id]/hr/team", "/projects/[id]/hr/hierarchy"],
    "WF-022": ["/projects/[id]/hr", "/projects/[id]/hr/team", "/m/log"],
    "WF-023": ["/projects/[id]/hr", "/projects/[id]/hr/team", "/projects/[id]/expenses"],
    "WF-024": ["/projects/[id]/accounting", "/projects/[id]/payments", "/finance"],
    "WF-025": ["/finance", "/projects/[id]/accounting"],
    "WF-026": ["/finance", "/projects/[id]/accounting"],
    "WF-027": ["/drawings", "/projects/[id]/drawings"],
    "WF-028": ["/drawings", "/projects/[id]/drawings", "/projects/[id]/pdf-canvas"],
    "WF-029": ["/drawings", "/projects/[id]/drawings", "/projects/[id]/pdf-canvas/render"],
    "WF-030": ["/projects/[id]/drawings", "/projects/[id]/pdf-canvas", "/projects/[id]/pdf-canvas/render"],
    "WF-031": ["/projects/[id]/drawings/progress", "/projects/[id]/pdf-canvas", "/projects/[id]/boq"],
    "WF-032": ["/projects/[id]/gantt", "/projects/[id]/planning-dashboard"],
    "WF-033": ["/projects/[id]/gantt", "/projects/[id]/planning-dashboard"],
    "WF-034": ["/projects/[id]/gantt", "/projects/[id]/planning-dashboard"],
    "WF-035": ["/projects/[id]/gantt", "/projects/[id]/gantt/[versionId]/pdf-designer"],
    "WF-036": ["/projects/[id]/ipc/[ipcId]/worksheets", "/worksheet-lab", "/projects/[id]/boq"],
    "WF-037": ["/projects/[id]/ipc/[ipcId]/worksheets", "/worksheet-lab", "/projects/[id]/boq"],
    "WF-038": ["/finance", "/projects/[id]/accounting"],
    "WF-039": ["/projects/[id]/rfis", "/projects/[id]/submittals", "/projects/[id]/workflow/rfi"],
    "WF-040": ["/my-access", "/projects/[id]/workflow/program/my-tasks", "/m/tasks"],
    "WF-041": ["/dashboard", "/projects/[id]/dashboard", "/projects/[id]/planning-dashboard"],
}

SERVICE_HINTS = {
    "WF-001": ["dailyReport", "fieldSubmission"], "WF-002": ["fieldPhotos", "fieldSubmission"],
    "WF-003": ["fieldSubmission", "expense", "pettyCash"], "WF-004": ["fieldSubmission", "material", "partner"],
    "WF-005": ["project.list", "notification.list", "dailyReport.listReports", "fieldSubmission", "punchList", "chat", "partner.subcontractorOptions"],
    "WF-006": ["boq."], "WF-007": ["rate", "norm", "boq."], "WF-008": ["rate", "marketRate", "profile"],
    "WF-009": ["boqVersion", "boq."], "WF-010": ["ipc."], "WF-011": ["ipc."], "WF-012": ["ipc.", "price", "adjust"],
    "WF-013": ["tax", "vat", "finance."], "WF-014": ["requisition", "purchaseOrder", "material."],
    "WF-015": ["purchaseOrder"], "WF-016": ["material."], "WF-017": ["material.transfer", "transfer"],
    "WF-018": ["equipment."], "WF-019": ["equipment.", "fuel"], "WF-020": ["equipment."],
    "WF-021": ["hr.", "staffRole", "workforce", "person"], "WF-022": ["attendance", "leave", "fieldSubmission"],
    "WF-023": ["payroll", "attendance", "finance."], "WF-024": ["finance.", "projectOps.payment"],
    "WF-025": ["guarantee", "finance."], "WF-026": ["fiscal", "finance."],
    "WF-027": ["document.", "drawing"], "WF-028": ["drawing", "pdf"], "WF-029": ["drawing", "pdf", "export"],
    "WF-030": ["drawing", "pdf"], "WF-031": ["boq.", "drawing", "takeoff"],
    "WF-032": ["gantt."], "WF-033": ["gantt."], "WF-034": ["gantt."], "WF-035": ["gantt."],
    "WF-036": ["boq.", "ipc."], "WF-037": ["boq.", "ipc."], "WF-038": ["finance.", "partner."],
    "WF-039": ["rfi.", "submittal"], "WF-040": ["responsibility", "delegation", "project."],
    "WF-041": ["dashboard.", "finance.", "gantt."],
}

USER_DECISIONS = {
    "WF-010": "Contractor creates each IPC and a separate workbook; full GridCraft edits it; Contractor consumes only a validated Summary of Payment.",
    "WF-011": "Deduction and advance-recovery calculations stay in GridCraft workbook sheets; app ingestion is limited to the validated Summary of Payment.",
    "WF-012": "Price-adjustment summary/calculation stay in GridCraft; preserve M00 partial source status and ingest only Summary of Payment.",
    "WF-036": "Workbook editing uses the full GridCraft app; Contractor does not embed a separate editable worksheet surface for IPCs.",
    "WF-037": "Excel-compatible round-trip is qualified through the separate GridCraft workbook; preserve original data and fail closed on unproven round-trip fidelity.",
}
FIELD_WORKFLOWS = {"WF-001", "WF-002", "WF-003", "WF-004", "WF-005"}
COMMERCIAL_WORKFLOWS = {"WF-006", "WF-007", "WF-008", "WF-009"}
TAX_MATERIALS_WORKFLOWS = {"WF-013", "WF-014", "WF-015", "WF-016", "WF-017"}
EQUIPMENT_WORKFLOWS = {"WF-018", "WF-019", "WF-020"}
WORKFORCE_FINANCE_WORKFLOWS = {"WF-021", "WF-022", "WF-023", "WF-024", "WF-025", "WF-026"}
DRAWING_PLANNING_WORKFLOWS = {"WF-027", "WF-028", "WF-029", "WF-030", "WF-031", "WF-032", "WF-033", "WF-034", "WF-035"}
UI_HOOK = re.compile(r"trpc\.((?:[A-Za-z0-9_]+\.)*[A-Za-z0-9_]+)\.(?:useQuery|useMutation)\b")


def main():
    source_matrix = json.loads(MATRIX.read_text())
    source_workflows = {item["workflow"]: item for item in source_matrix["workflows"]}
    index = json.loads(INDEX.read_text())
    trigger_records = [json.loads(line) for line in TRIGGERS.read_text().splitlines()]
    triggers_by_route = {}
    for trigger in trigger_records:
        triggers_by_route.setdefault(trigger["routeId"], []).append(trigger)
    routes_by_path = {route["originalRoute"]: route for route in index["routes"]}
    reachable_ui_files = {route["routeSource"] for route in index["routes"]}
    for route in index["routes"]:
        for action in route["reachableProcedureCandidates"]:
            reachable_ui_files.update(action.get("uiSourceFiles", []))
    reachable_ui_files.update(trigger["sourceFile"] for trigger in trigger_records)
    unreferenced_ui = []
    for component in sorted((SOURCE / "src").rglob("*.tsx")):
        relative = str(component.relative_to(SOURCE))
        if relative in reachable_ui_files:
            continue
        source_text = component.read_text(errors="ignore")
        hooks = sorted(set(UI_HOOK.findall(source_text)))
        if hooks:
            unreferenced_ui.append({"sourceFile": relative, "hooks": hooks})
    coverage = COVERAGE.read_text()
    route_rows = {
        path: {"routeId": route_id, "destination": destination.strip(), "packet": packet.strip(), "status": status.strip()}
        for route_id, path, destination, packet, status in re.findall(
            r"\|\s*`(ROUTE-\d+)`\s*\|\s*`([^`]+)`\s*\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|",
            coverage,
        )
    }
    workflow_rows = re.findall(
        r"\|\s*`(WF-\d+)`\s*\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|",
        coverage,
    )
    packet_by_id = {workflow_id: packet.strip() for workflow_id, _, _, packet, _ in workflow_rows}
    result = []
    for workflow_id, path_list in WORKFLOW_ROUTES.items():
        # The M00 matrix currently has stable order but no WF IDs. Match on
        # coverage title, which is checked below for uniqueness/presence.
        coverage_row = next((row for row in workflow_rows if row[0] == workflow_id), None)
        if not coverage_row:
            raise SystemExit(f"missing workflow coverage row: {workflow_id}")
        title = coverage_row[1].strip()
        original = source_workflows.get(title)
        if not original:
            raise SystemExit(f"M00 title not found in source matrix: {title}")
        route_records = []
        hook_actions = []
        trigger_actions = []
        for route_path in path_list:
            route_ref = route_rows.get(route_path)
            if route_ref:
                route_records.append({**route_ref, "sourcePage": routes_by_path.get(route_path, {}).get("routeSource")})
            indexed_route = routes_by_path.get(route_path)
            if not indexed_route:
                continue
            hints = SERVICE_HINTS[workflow_id]
            for action in indexed_route["reachableProcedureCandidates"]:
                procedure = action["candidateDefinition"]
                if any(hint.casefold() in procedure.casefold() for hint in hints):
                    hook_actions.append(action)
            for action in triggers_by_route.get(indexed_route["routeId"], []):
                linked = action.get("candidateMutationHooks", [])
                if any(any(hint.casefold() in hook.casefold() for hint in hints) for hook in linked):
                    trigger_actions.append(action)
        unique_actions = {action["actionId"]: action for action in hook_actions}
        ipc_reviewed_actions = sorted(
            action["actionId"]
            for route_path in path_list
            if (indexed_route := routes_by_path.get(route_path))
            for action in indexed_route["reachableProcedureCandidates"]
            if action["candidateDefinition"].startswith(("ipc.", "worksheet."))
        ) if workflow_id in USER_DECISIONS else []
        engine_files = sorted(set(re.findall(r"(?:src|tests)/[A-Za-z0-9_./-]+\.(?:ts|tsx|js|jsx)", original.get("engine", ""))))
        test_files = sorted(set(re.findall(r"(?:src|tests)/[A-Za-z0-9_./-]+\.(?:ts|tsx|js|jsx)", original.get("tests", ""))))
        service_hints = SERVICE_HINTS[workflow_id]
        outbox_actions = [
            action for action in index["offlineModel"]["fieldOutboxWrites"]
            if any(hint.casefold() in action["procedure"].casefold() for hint in service_hints)
        ]
        if workflow_id == "WF-005":
            outbox_actions = index["offlineModel"]["fieldOutboxWrites"]
        linked_source_files = {route["sourcePage"] for route in route_records if route.get("sourcePage")}
        for action in unique_actions.values():
            linked_source_files.update(action.get("uiSourceFiles", []))
            if action.get("serverSource"):
                linked_source_files.add(action["serverSource"]["sourceFile"])
        service_hints = SERVICE_HINTS[workflow_id]
        orphaned_ui = [
            component for component in unreferenced_ui
            if any(
                any(hint.casefold() in hook.casefold() for hint in service_hints)
                for hook in component["hooks"]
            )
        ]
        result.append({
            "workflowId": workflow_id,
            "name": title,
            "domain": original.get("domain"),
            "description": original.get("description"),
            "originalStatus": original.get("status"),
            "parityType": original.get("parityType"),
            "platforms": original.get("platforms"),
            "sourceEngineFiles": [{"path": item, "presentInCanonicalCommit": (SOURCE / item).is_file()} for item in engine_files],
            "sourceTestFiles": [{"path": item, "presentInCanonicalCommit": (SOURCE / item).is_file()} for item in test_files],
            "declaredSourceFilesNotLinkedFromMappedRoutes": sorted(
                item for item in engine_files
                if (SOURCE / item).is_file() and item not in linked_source_files
            ),
            "unreferencedUiComponentsWithRelatedHooks": orphaned_ui,
            "m13Packet": packet_by_id[workflow_id],
            "canonicalRoutes": route_records,
            "sourceActionIds": sorted(unique_actions),
            "sourceOperations": sorted({action["hook"] for action in unique_actions.values()}),
            "outboxActionIds": [action["actionId"] for action in outbox_actions],
            "outboxOperations": [action["procedure"] for action in outbox_actions],
            "offlineReadPaths": index["offlineModel"]["persistedReadQueryPaths"] if workflow_id == "WF-005" else [],
            "triggerActionIdsWithMutationCandidates": sorted({action["actionId"] for action in trigger_actions}),
            "serverSourceFiles": sorted({action["serverSource"]["sourceFile"] for action in unique_actions.values() if action.get("serverSource")}),
            "permissionReviewState": "candidate guards are in the source action index; effective permissions require T01 review",
            "offlinePolicies": sorted({action["offlinePolicy"] for action in unique_actions.values()}),
            "userDirectedDisposition": USER_DECISIONS.get(workflow_id),
            "sourceReviewedActionIds": ipc_reviewed_actions,
            "sourceReviewState": (
                "IPC/worksheet procedure permissions and user-directed disposition reviewed; route trigger paths and GridCraft runtime remain unverified"
                if workflow_id in USER_DECISIONS else
                "field capture, office review gates and outbox/offline policy reviewed; detailed form controls and full module lifecycle remain unverified"
                if workflow_id in FIELD_WORKFLOWS else
                "core BOQ/rate/snapshot routes and permission contracts reviewed; detailed controls, full catalog lifecycle and runtime remain unverified"
                if workflow_id in COMMERCIAL_WORKFLOWS else
                "tax, procurement, stock and transfer server permissions/transitions reviewed; UI paths and transaction acceptance remain unverified"
                if workflow_id in TAX_MATERIALS_WORKFLOWS else
                "equipment router composition, selected UI entry points, permission and transaction boundaries reviewed; full control mapping and runtime remain unverified"
                if workflow_id in EQUIPMENT_WORKFLOWS else
                "workforce, accounting, payroll and fiscal-lock source boundaries reviewed; full control mapping and runtime remain unverified"
                if workflow_id in WORKFORCE_FINANCE_WORKFLOWS else
                "drawing, takeoff, scheduling, calendar and import source boundaries reviewed; full trigger mapping and runtime remain unverified"
                if workflow_id in DRAWING_PLANNING_WORKFLOWS else
                "candidate crosswalk only; source action semantics require review"
            ),
            "sourceReviewReference": (
                "docs/reports/M13/ipc-source-action-reconciliation.md"
                if workflow_id in USER_DECISIONS else
                "docs/reports/M13/field-and-sync-source-action-reconciliation.md"
                if workflow_id in FIELD_WORKFLOWS else
                "docs/reports/M13/commercial-source-action-reconciliation.md"
                if workflow_id in COMMERCIAL_WORKFLOWS else
                "docs/reports/M13/tax-procurement-inventory-source-action-reconciliation.md"
                if workflow_id in TAX_MATERIALS_WORKFLOWS else
                "docs/reports/M13/equipment-source-action-reconciliation.md"
                if workflow_id in EQUIPMENT_WORKFLOWS else
                "docs/reports/M13/workforce-and-finance-source-action-reconciliation.md"
                if workflow_id in WORKFORCE_FINANCE_WORKFLOWS else
                "docs/reports/M13/drawings-and-planning-source-action-reconciliation.md"
                if workflow_id in DRAWING_PLANNING_WORKFLOWS else None
            ),
            "reviewState": "M00-to-route/service crosswalk candidate; not parity or runtime acceptance evidence",
        })
    OUTPUT.write_text(json.dumps({
        "sourceCommit": index["source"]["commit"],
        "sourceMatrix": "docs/reports/M00/feature-matrix.json",
        "workflowCount": len(result),
        "limitations": [
            "Route and service links are explicit review candidates; shared route services can serve more than one workflow.",
            "M00 engine/test entries are compared for file existence only; existence does not prove execution or current behavior.",
            "A present M00 engine file absent from mapped route/action source links may be a server lifecycle, orphaned UI module or incomplete route mapping; it is retained for review.",
            "Unreferenced UI components with matching service hooks are candidates only; they may be intentionally dormant, legacy or omitted from the route graph.",
            "User-directed IPC/GridCraft dispositions supersede only the listed source editing/import outcomes.",
        ],
        "workflows": result,
    }, indent=2, sort_keys=True) + "\n")
    print(f"wrote {OUTPUT} with {len(result)} workflow crosswalk rows")


if __name__ == "__main__":
    main()
