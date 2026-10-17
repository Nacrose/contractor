#!/usr/bin/env python3
"""Audit a Construction Manager ZIP or checkout and source reachable from its pages.

Usage: python3 scripts/audit_frontend_archive.py SOURCE.zip-or-checkout [--coverage FILE.md] [--output FILE.json]
This index records static candidates and source policy evidence; it does not prove
effective guards, event call paths, or deployed/runtime offline behavior.
"""
import argparse
import hashlib
import json
import posixpath
import re
import subprocess
import zipfile
from pathlib import Path, PurePosixPath

ROOT = "Construction-Manager-main/"
IMPORT = re.compile(r"(?:from\s*|import\s*(?:\(\s*)?)[\"']([^\"']+)[\"']")
HOOK = re.compile(r"trpc\.((?:[A-Za-z0-9_]+\.)*[A-Za-z0-9_]+)\.(useQuery|useMutation)\b")
DIALOG = re.compile(r"<([A-Z][A-Za-z0-9_]*Dialog)\b")
JSX_TAG = re.compile(r"<([A-Za-z][A-Za-z0-9_.:-]*)\b")
JSX_EVENT = re.compile(r"\bon([A-Z][A-Za-z0-9_]*)\s*=")


def find_brace_end(text, start):
    """Return the matching brace while skipping quoted strings and comments."""
    depth = 0
    quote = None
    escaped = False
    line_comment = False
    block_comment = False
    i = start
    while i < len(text):
        char = text[i]
        following = text[i + 1] if i + 1 < len(text) else ""
        if line_comment:
            if char == "\n":
                line_comment = False
        elif block_comment:
            if char == "*" and following == "/":
                block_comment = False
                i += 1
        elif quote:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = None
        elif char in "'\"`":
            quote = char
        elif char == "/" and following == "/":
            line_comment = True
            i += 1
        elif char == "/" and following == "*":
            block_comment = True
            i += 1
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return i + 1
        i += 1
    return len(text)


def is_top_level_jsx_attribute(tag_source, position):
    """Ignore event-looking text in JSX expressions nested in another prop."""
    depth = 0
    quote = None
    escaped = False
    for char in tag_source[:position]:
        if quote:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = None
        elif char in "'\"`":
            quote = char
        elif char == "{":
            depth += 1
        elif char == "}":
            depth = max(0, depth - 1)
    return depth == 0


def interactive_triggers(source, source_name, route_id, owner_task, mutation_bindings):
    """Index JSX event attributes as candidates; do not infer runtime semantics."""
    records = []
    handler_bodies = {}
    handler_patterns = (
        re.compile(r"\bfunction\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::[^{}]+)?\{"),
        re.compile(r"\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*\{"),
    )
    for pattern in handler_patterns:
        for definition in pattern.finditer(source):
            body_start = definition.end() - 1
            handler_bodies[definition.group(1)] = source[body_start:find_brace_end(source, body_start)]
    cursor = 0
    while True:
        start_match = JSX_TAG.search(source, cursor)
        if not start_match:
            break
        tag = start_match.group(1)
        i = start_match.end()
        brace_depth = 0
        quote = None
        escaped = False
        while i < len(source):
            char = source[i]
            if quote:
                if escaped:
                    escaped = False
                elif char == "\\":
                    escaped = True
                elif char == quote:
                    quote = None
            elif char in "'\"`":
                quote = char
            elif char == "{":
                brace_depth += 1
            elif char == "}":
                brace_depth = max(0, brace_depth - 1)
            elif char == ">" and brace_depth == 0:
                break
            i += 1
        if i >= len(source):
            break
        tag_source = source[start_match.start():i + 1]
        for event_match in JSX_EVENT.finditer(tag_source):
            if not is_top_level_jsx_attribute(tag_source, event_match.start()):
                continue
            value_start = event_match.end()
            while value_start < len(tag_source) and tag_source[value_start].isspace():
                value_start += 1
            if value_start >= len(tag_source):
                continue
            if tag_source[value_start] == "{":
                value_end = find_brace_end(tag_source, value_start)
            elif tag_source[value_start] in "'\"`":
                delim = tag_source[value_start]
                value_end = value_start + 1
                escaped_value = False
                while value_end < len(tag_source):
                    current = tag_source[value_end]
                    if escaped_value:
                        escaped_value = False
                    elif current == "\\":
                        escaped_value = True
                    elif current == delim:
                        value_end += 1
                        break
                    value_end += 1
            else:
                value_end = value_start
                while value_end < len(tag_source) and not tag_source[value_end].isspace():
                    value_end += 1
            expression = tag_source[value_start:value_end].strip()
            referenced_names = set(re.findall(r"\b[A-Za-z_$][\w$]*\b", expression))
            mutation_candidates = {
                hook for variable, hook in mutation_bindings.items()
                if re.search(rf"\b{re.escape(variable)}\b", expression)
            }
            traced_handler_names = referenced_names & handler_bodies.keys()
            for handler_name in traced_handler_names:
                handler_body = handler_bodies[handler_name]
                mutation_candidates.update(
                    hook for variable, hook in mutation_bindings.items()
                    if re.search(rf"\b{re.escape(variable)}\b", handler_body)
                )
            mutation_candidates = sorted(mutation_candidates)
            line = source.count("\n", 0, start_match.start()) + 1
            column = start_match.start() - source.rfind("\n", 0, start_match.start())
            normalized = re.sub(r"\s+", " ", expression)
            action_id = "TRIGGER-" + hashlib.sha256(
                f"{route_id}|{source_name}|{line}|{column}|{event_match.start()}|{tag}|{event_match.group(1)}|{normalized}".encode()
            ).hexdigest()[:12].upper()
            records.append({
                "actionId": action_id,
                "ownerTask": owner_task,
                "ownerReviewState": "proposed coverage-packet owner; trigger semantics require review",
                "sourceFile": source_name,
                "line": line,
                "column": column,
                "element": tag,
                "event": "on" + event_match.group(1),
                "handlerExpression": normalized[:500],
                "candidateMutationHooks": mutation_candidates,
                "mutationLinkReviewState": (
                    "handler source references mutation binding; call path requires review"
                    if traced_handler_names and mutation_candidates
                    else "same-expression candidate only; not a proven call path"
                ),
            })
        # Continue at the opening tag name so JSX nested in prop expressions is
        # scanned separately, with its own top-level event attributes.
        cursor = start_match.end()
    return records


def resolve_local_import(source_name, import_name, existing):
    if import_name.startswith("@/"):
        base = "Construction-Manager-main/src/" + import_name[2:]
    elif import_name.startswith("."):
        base = str(PurePosixPath(source_name).parent / import_name)
    else:
        return None
    # PurePosixPath preserves `..`; normalize it before resolving against the
    # source inventory or parent-relative barrels and their children vanish.
    base = posixpath.normpath(str(PurePosixPath(base)))
    candidates = [base] if PurePosixPath(base).suffix else [
        base + ext for ext in (".tsx", ".ts", ".jsx", ".js")
    ] + [base + "/index" + ext for ext in (".tsx", ".ts", ".jsx", ".js")]
    return next((name for name in candidates if name in existing and "/src/" in name), None)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="source ZIP archive or checked-out repository")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--trigger-output", type=Path, help="JSONL file for route-scoped UI trigger candidates")
    parser.add_argument("--coverage", type=Path, help="coverage markdown used to assign stable route IDs")
    args = parser.parse_args()
    is_archive = args.source.is_file()
    archive = zipfile.ZipFile(args.source) if is_archive else None
    if is_archive:
        raw = args.source.read_bytes()
        files = set(archive.namelist())
        read_source = archive.read
        source_metadata = {
            "kind": "zip-archive",
            "archive": args.source.name,
            "sha256": hashlib.sha256(raw).hexdigest(),
            "zipCommentRevisionClaim": archive.comment.decode(errors="replace"),
        }
    else:
        root = args.source.resolve()
        files = {
            ROOT + str(path.relative_to(root))
            for path in root.rglob("*")
            if path.is_file() and ".git" not in path.parts
        }
        read_source = lambda name: (root / name.removeprefix(ROOT)).read_bytes()
        result = subprocess.run(
            ["git", "-C", str(root), "rev-parse", "HEAD"],
            check=True,
            capture_output=True,
            text=True,
        )
        remote = subprocess.run(
            ["git", "-C", str(root), "remote", "get-url", "origin"],
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
        repository_name = remote.rstrip("/").removesuffix(".git").replace(":", "/").split("/")[-1]
        source_metadata = {
            "kind": "git-checkout",
            "repository": repository_name,
            "commit": result.stdout.strip(),
        }
    try:
        pages = sorted(
            name for name in files
            if name.startswith(ROOT + "src/app/") and name.endswith("/page.tsx")
        )
        routers = sorted(
            name for name in files
            if name.startswith(ROOT + "src/server/routers/")
            and name.endswith(".ts") and not name.endswith("/_app.ts")
            and "/__tests__/" not in name
        )
        api_route_files = sorted(
            name for name in files
            if name.startswith(ROOT + "src/app/api/")
            and name.endswith("/route.ts")
            and ".test." not in name
        )
        api_routes = []
        method_pattern = re.compile(
            r"export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b"
            r"|export\s*\{([^}]+)\}", re.S
        )
        api_security_markers = (
            "getCurrentUser", "withTenantRoute", "withOrganizationRoute", "requireAuth",
            "Authorization", "CRON_SECRET", "assertSameOrigin", "protectedProcedure",
            "assertProject", "requireProject", "checkPermission", "verifySession",
        )
        for name in api_route_files:
            src = read_source(name).decode(errors="ignore")
            methods = set()
            for match in method_pattern.finditer(src):
                if match.group(1):
                    methods.add(match.group(1))
                if match.group(2):
                    methods.update(re.findall(r"\bas\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b", match.group(2)))
            api_path = "/api/" + name.removeprefix(ROOT + "src/app/api/").removesuffix("/route.ts")
            api_routes.append({
                "path": api_path,
                "methods": sorted(methods),
                "sourceFile": name.removeprefix(ROOT),
                "securityMarkerCandidates": [marker for marker in api_security_markers if marker in src],
                "reviewState": "handler and security marker indexed; effective authentication/authorization requires review",
            })
        scheduled_workflows = []
        for workflow_name in (".github/workflows/cron.yml", ".github/workflows/backup.yml"):
            source_name = ROOT + workflow_name
            if source_name not in files:
                continue
            workflow_source = read_source(source_name).decode(errors="ignore")
            scheduled_workflows.append({
                "sourceFile": workflow_name,
                "cronExpressions": re.findall(r"\bcron:\s*[\"']([^\"']+)[\"']", workflow_source),
                "apiEndpoints": sorted(set(re.findall(r"\$SITE_URL(/api/[A-Za-z0-9_./${}\[\]-]+)", workflow_source))),
                "scriptReferences": sorted(set(re.findall(r"(?:bash|sh|node)\s+([\w./-]+\.mjs?)", workflow_source))),
                "reviewState": "scheduler source indexed; deployed secrets, schedule activation and last-run status are unverified",
            })
        app = read_source(ROOT + "src/server/routers/_app.ts").decode()
        root_routers = re.findall(r"^\s*(\w+):\s*\w+Router,", app, re.M)
        old_pattern = re.compile(
            r"^\s*([a-zA-Z0-9_]+):\s*(?:publicProcedure|protectedProcedure|"
            r"projectProcedure|adminProcedure|procedure|orgProcedure)", re.M
        )
        procedure_binding = re.compile(
            r"^\s*([A-Za-z0-9_]+):\s*((?:[A-Za-z0-9_]+Procedure|proc\.[A-Za-z0-9_]+))\b",
            re.M,
        )
        definitions = set()
        procedure_candidates = set()
        for name in routers:
            src = read_source(name).decode(errors="ignore")
            basename = name.rsplit("/", 1)[-1][:-3]
            router = basename.split("-")[0] + "".join(x.capitalize() for x in basename.split("-")[1:])
            definitions.update((router, proc) for proc in old_pattern.findall(src))
            procedure_candidates.update((router, match.group(1)) for match in procedure_binding.finditer(src))
        admin = read_source(ROOT + "src/server/routers/admin.ts").decode()
        admin_omitted = re.findall(r"^\s*([\w]+):\s*superAdminProcedure\b", admin, re.M)
        procedure_sources = {}
        top_level_router_names = set(root_routers)
        for name in routers:
            src = read_source(name).decode(errors="ignore")
            base = name.rsplit("/", 1)[-1][:-3]
            router = base.split("-")[0] + "".join(x.capitalize() for x in base.split("-")[1:])
            aliases = {router}
            aliases.update(
                root_name for root_name in top_level_router_names
                if router.startswith(root_name) and router != root_name
            )
            if base.startswith("daily-report-"):
                aliases.add("dailyReport")
            if base.startswith("daily-program-"):
                aliases.add("dailyProgram")
            for match in procedure_binding.finditer(src):
                next_prop = procedure_binding.search(src[match.end():])
                end = match.end() + next_prop.start() if next_prop else min(len(src), match.end() + 1500)
                body = src[match.end():end]
                kind = "mutation" if re.search(r"\.mutation\s*\(", body) else "query" if re.search(r"\.query\s*\(", body) else "unclassified"
                guard_calls = sorted(set(re.findall(
                    r"\b(?:assert|require)[A-Za-z0-9_]*(?:Permission|Access|Role|Capability)[A-Za-z0-9_]*\s*\(",
                    body,
                )))
                permission_keys = sorted(set(re.findall(
                    r"[\"']((?:project|organization|org|user|admin)\.[A-Za-z0-9_.-]+)[\"']",
                    body,
                )))
                source = {
                    "sourceFile": name.removeprefix(ROOT),
                    "declaredProcedureWrapper": match.group(2),
                    "handlerKind": kind,
                    "permissionGuardCandidates": guard_calls,
                    "permissionKeyCandidates": permission_keys,
                    "permissionReviewState": "candidate source evidence; effective policy requires review",
                    "offlinePolicy": "unreviewed",
                }
                for alias in aliases:
                    procedure_sources[f"{alias}.{match.group(1)}"] = source
        query_persist_text = read_source(ROOT + "src/lib/field-query-persist.ts").decode(errors="ignore")
        query_block = re.search(
            r"PERSISTED_QUERY_PATHS[^=]*=\s*\[(.*?)\];", query_persist_text, re.S
        )
        persisted_query_paths = sorted(set(
            re.findall(r"[\"']([^\"']+)[\"']", query_block.group(1))
        )) if query_block else []
        field_draft_text = read_source(ROOT + "src/lib/field-entry-builders.ts").decode(errors="ignore")
        draft_type_match = re.search(r"export type FieldDraftType\s*=([\s\S]*?);", field_draft_text)
        draft_types = set(re.findall(r"[\"']([^\"']+)[\"']", draft_type_match.group(1))) if draft_type_match else set()
        send_builder = field_draft_text[field_draft_text.find("export function buildSendPayload("):]
        type_branches = list(re.finditer(r'if\s*\(type\s*===\s*[\"\']([^\"\']+)[\"\']\)', send_builder))
        field_draft_endpoints = []
        for i, branch in enumerate(type_branches):
            end = type_branches[i + 1].start() if i + 1 < len(type_branches) else len(send_builder)
            endpoint_match = re.search(r'endpoint\s*:\s*[\"\']([^\"\']+)[\"\']', send_builder[branch.end():end])
            if endpoint_match:
                field_draft_endpoints.append({"procedure": endpoint_match.group(1), "draftType": branch.group(1)})
        if type_branches:
            builder_endpoints = re.findall(r'endpoint\s*:\s*[\"\']([^\"\']+)[\"\']', send_builder)
            known_types = {entry["draftType"] for entry in field_draft_endpoints}
            if builder_endpoints:
                field_draft_endpoints.extend(
                    {"procedure": builder_endpoints[-1], "draftType": draft_type}
                    for draft_type in sorted(draft_types - known_types)
                )
        outbox_write_sources = {}
        for source_name in sorted(files):
            if not source_name.startswith(ROOT + "src/") or not source_name.endswith((".ts", ".tsx")):
                continue
            source_text = read_source(source_name).decode(errors="ignore")
            for call in re.finditer(r"\benqueueFieldWrite\s*\(", source_text):
                snippet = source_text[call.end():call.end() + 1000]
                endpoint_match = re.search(r'\bendpoint\s*:\s*[\"\']([^\"\']+)[\"\']', snippet)
                if endpoint_match:
                    outbox_write_sources.setdefault(endpoint_match.group(1), set()).add(source_name.removeprefix(ROOT))
        for entry in field_draft_endpoints:
            outbox_write_sources.setdefault(entry["procedure"], set()).add("src/lib/field-drafts.ts")
            outbox_write_sources[entry["procedure"]].add("src/lib/field-entry-builders.ts")
        outbox_writes = [
            {
                "actionId": "ACTION-OUTBOX-" + hashlib.sha256(
                    f"{endpoint}|{'|'.join(sorted(source_names))}".encode()
                ).hexdigest()[:10].upper(),
                "procedure": endpoint,
                "sourceFiles": sorted(source_names),
                "draftTypes": sorted({item["draftType"] for item in field_draft_endpoints if item["procedure"] == endpoint}),
            }
            for endpoint, source_names in sorted(outbox_write_sources.items())
        ]
        offline_model = {
            "officeMutationPolicy": "online-only; shared offlineFetch delegates to native fetch",
            "legacyOfflineQueuePolicy": "inspect-and-discard only; queued legacy mutations are never replayed",
            "persistedReadQueryPaths": persisted_query_paths,
            "fieldOutboxWrites": outbox_writes,
            "fieldOutboxReplayPolicy": "clientUuid idempotency; network, server and auth faults retry; 4xx responses park as failed",
            "fieldOutboxStoragePolicy": "best-effort IndexedDB write; storage errors are swallowed by dbPut",
            "evidenceSourceFiles": [
                "src/lib/offline-fetch.ts",
                "src/lib/offline-queue.ts",
                "src/lib/field-outbox.ts",
                "src/lib/field-query-persist.ts",
                "src/lib/field-drafts.ts",
                "src/lib/field-entry-builders.ts",
            ],
            "reviewState": "source policy indexed; per-screen call behavior and compatibility require review",
        }
        route_actions = []
        all_trigger_candidates = []
        route_ids = {}
        route_tasks = {}
        next_route_id = 1
        if args.coverage:
            coverage_text = args.coverage.read_text()
            route_ids = {
                path: route_id
                for route_id, path in re.findall(
                    r"\|\s*`(ROUTE-\d+)`\s*\|\s*`([^`]+)`", coverage_text
                )
            }
            route_tasks = {
                path: planned_task
                for _, path, _, planned_task in re.findall(
                    r"\|\s*`(ROUTE-\d+)`\s*\|\s*`([^`]+)`\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|",
                    coverage_text,
                )
            }
            route_tasks = {path: task.strip() for path, task in route_tasks.items()}
            next_route_id = max(
                (int(route_id.removeprefix("ROUTE-")) for route_id in route_ids.values()),
                default=0,
            ) + 1
        all_hooks, total_hooks, direct_dialogs = set(), 0, 0
        for page in pages:
            route_path = page.removeprefix(ROOT + "src/app/")
            route_path = "/" if route_path == "page.tsx" else route_path.removesuffix("/page.tsx")
            route_path = re.sub(r"/\([^)]*\)", "", "/" + route_path)
            route_path = re.sub(r"^/\([^)]*\)/", "/", route_path)
            if route_path == "/":
                pass
            elif route_path.endswith("/"):
                route_path = route_path[:-1]
            route_id = route_ids.get(route_path)
            if route_id is None:
                route_id = f"ROUTE-{next_route_id:03d}"
                next_route_id += 1
            pending, visited, hooks, dialogs = [page], set(), set(), set()
            hook_sources = {}
            trigger_candidates = []
            while pending:
                current = pending.pop()
                if current in visited:
                    continue
                visited.add(current)
                try:
                    src = read_source(current).decode(errors="ignore")
                except (KeyError, FileNotFoundError):
                    continue
                for path, method in HOOK.findall(src):
                    hook = f"{path} [{method.removeprefix('use')}]"
                    hooks.add(hook)
                    hook_sources.setdefault(hook, set()).add(current.removeprefix(ROOT))
                mutation_bindings = {
                    variable: f"{path} [Mutation]"
                    for variable, path in re.findall(
                        r"\b(?:const|let)\s+(\w+)\s*=\s*trpc\.((?:[A-Za-z0-9_]+\.)*[A-Za-z0-9_]+)\.useMutation\b",
                        src,
                    )
                }
                trigger_candidates.extend(interactive_triggers(
                    src,
                    current.removeprefix(ROOT),
                    route_id,
                    route_tasks.get(route_path, "unassigned"),
                    mutation_bindings,
                ))
                dialogs.update(DIALOG.findall(src))
                for imported in IMPORT.findall(src):
                    target = resolve_local_import(current, imported, files)
                    if target:
                        pending.append(target)
            direct = read_source(page).decode(errors="ignore")
            direct_hooks = [f"{path} [{method.removeprefix('use')}]" for path, method in HOOK.findall(direct)]
            direct_dialog_names = sorted(set(DIALOG.findall(direct)))
            all_hooks.update(hooks)
            total_hooks += len(direct_hooks)
            direct_dialogs += len(direct_dialog_names)
            all_trigger_candidates.extend({
                "routeId": route_id,
                "originalRoute": route_path,
                **candidate,
            } for candidate in trigger_candidates)
            mapped_hooks = []
            for hook in sorted(hooks):
                qualified = hook.rsplit(" [", 1)[0]
                pieces = qualified.split(".")
                service_key = f"{pieces[1]}.{pieces[-1]}" if pieces[0] == "workflow" and len(pieces) >= 3 else f"{pieces[0]}.{pieces[-1]}"
                definition = procedure_sources.get(service_key)
                kind = hook.rsplit(" [", 1)[1].removesuffix("]") if " [" in hook else "unclassified"
                if kind == "Query":
                    offline_policy = "durable-offline-read-whitelist" if qualified in persisted_query_paths else "not-durably-persisted-offline"
                elif kind == "Mutation":
                    offline_policy = "online-only-hook; durable field outbox actions are inventoried separately"
                else:
                    offline_policy = "unclassified"
                mapped_hooks.append({
                    "actionId": "ACTION-" + hashlib.sha256(
                        f"{route_id}|{hook}|{'|'.join(sorted(hook_sources.get(hook, set())))}".encode()
                    ).hexdigest()[:12].upper(),
                    "ownerTask": route_tasks.get(route_path, "unassigned"),
                    "ownerReviewState": "proposed coverage-packet owner; requires action-level assignment",
                    "hook": hook,
                    "candidateDefinition": service_key,
                    "uiSourceFiles": sorted(hook_sources.get(hook, set())),
                    "serverSource": definition,
                    "offlinePolicy": offline_policy,
                })
            route_actions.append({
                "routeId": route_id,
                "originalRoute": route_path,
                "plannedTask": route_tasks.get(route_path, "unassigned"),
                "ownerReviewState": "proposed route-to-task mapping; requires source-action review",
                "routeSource": page.removeprefix(ROOT),
                "reachableSourceFileCount": len(visited),
                "directPageProcedureHooks": sorted(set(direct_hooks)),
                "reachableProcedureHooks": sorted(hooks),
                "reachableProcedureCandidates": mapped_hooks,
                "directDialogComponents": direct_dialog_names,
                "reachableDialogComponents": sorted(dialogs),
                "interactiveTriggerCandidateCount": len(trigger_candidates),
                "reviewState": "component graph and event-handler candidates indexed; trigger-to-action semantics, effective guards and lifecycle require review",
            })
        layout_specs = [
            ("LAYOUT-ROOT", "src/app/layout.tsx", "T05"),
            ("LAYOUT-APP", "src/app/(app)/layout.tsx", "T05/T06"),
            ("LAYOUT-ADMIN", "src/app/(app)/admin/layout.tsx", "T29"),
            ("LAYOUT-PROJECT", "src/app/(app)/projects/[id]/layout.tsx", "T05/T06"),
            ("LAYOUT-WORKFLOW", "src/app/(app)/projects/[id]/workflow/layout.tsx", "T05/T18"),
            ("LAYOUT-LOGIN", "src/app/login/layout.tsx", "T03/T29"),
            ("LAYOUT-MOBILE", "src/app/m/layout.tsx", "T07"),
        ]
        shared_shells = []
        for layout_id, relative_layout, owner_task in layout_specs:
            source_name = ROOT + relative_layout
            if source_name not in files:
                continue
            pending, visited, hooks, dialogs, hook_sources = [source_name], set(), set(), set(), {}
            layout_triggers = []
            while pending:
                current = pending.pop()
                if current in visited:
                    continue
                visited.add(current)
                src = read_source(current).decode(errors="ignore")
                for path, method in HOOK.findall(src):
                    hook = f"{path} [{method.removeprefix('use')}]"
                    hooks.add(hook)
                    hook_sources.setdefault(hook, set()).add(current.removeprefix(ROOT))
                mutation_bindings = {
                    variable: f"{path} [Mutation]"
                    for variable, path in re.findall(
                        r"\b(?:const|let)\s+(\w+)\s*=\s*trpc\.((?:[A-Za-z0-9_]+\.)*[A-Za-z0-9_]+)\.useMutation\b",
                        src,
                    )
                }
                layout_triggers.extend(interactive_triggers(
                    src, current.removeprefix(ROOT), layout_id, owner_task, mutation_bindings
                ))
                dialogs.update(DIALOG.findall(src))
                for imported in IMPORT.findall(src):
                    target = resolve_local_import(current, imported, files)
                    if target:
                        pending.append(target)
            layout_hooks = []
            for hook in sorted(hooks):
                qualified = hook.rsplit(" [", 1)[0]
                pieces = qualified.split(".")
                service_key = f"{pieces[1]}.{pieces[-1]}" if pieces[0] == "workflow" and len(pieces) >= 3 else f"{pieces[0]}.{pieces[-1]}"
                definition = procedure_sources.get(service_key)
                kind = hook.rsplit(" [", 1)[1].removesuffix("]") if " [" in hook else "unclassified"
                offline_policy = (
                    "durable-offline-read-whitelist" if qualified in persisted_query_paths else "not-durably-persisted-offline"
                ) if kind == "Query" else (
                    "online-only-hook; durable field outbox actions are inventoried separately"
                    if kind == "Mutation" else "unclassified"
                )
                layout_hooks.append({
                    "actionId": "ACTION-SHELL-" + hashlib.sha256(
                        f"{layout_id}|{hook}|{'|'.join(sorted(hook_sources.get(hook, set())))}".encode()
                    ).hexdigest()[:12].upper(),
                    "ownerTask": owner_task,
                    "hook": hook,
                    "candidateDefinition": service_key,
                    "uiSourceFiles": sorted(hook_sources.get(hook, set())),
                    "serverSource": definition,
                    "offlinePolicy": offline_policy,
                    "reviewState": "shared-layout action candidate; effective permission and call behavior require review",
                })
            for candidate in layout_triggers:
                all_trigger_candidates.append({
                    "routeId": layout_id,
                    "originalRoute": "shared-layout:" + relative_layout,
                    "scopeType": "shared-layout",
                    **candidate,
                })
            shared_shells.append({
                "layoutId": layout_id,
                "sourceLayout": relative_layout,
                "ownerTask": owner_task,
                "reachableSourceFileCount": len(visited),
                "sourceFiles": sorted(path.removeprefix(ROOT) for path in visited),
                "reachableProcedureHooks": sorted(hooks),
                "reachableProcedureCandidates": layout_hooks,
                "triggerCandidateCount": len(layout_triggers),
                "directDialogComponents": sorted(dialogs),
                "reviewState": "shared layout source indexed separately from page routes; interaction behavior requires review",
            })
        trigger_output = args.trigger_output or (
            args.output.with_name("original-interaction-trigger-candidates.jsonl") if args.output else None
        )
        outbox_endpoints = {entry["procedure"] for entry in outbox_writes}
        for trigger in all_trigger_candidates:
            service_candidates = []
            for candidate_hook in trigger.get("candidateMutationHooks", []):
                qualified = candidate_hook.rsplit(" [", 1)[0]
                pieces = qualified.split(".")
                service_key = f"{pieces[1]}.{pieces[-1]}" if pieces[0] == "workflow" and len(pieces) >= 3 else f"{pieces[0]}.{pieces[-1]}"
                definition = procedure_sources.get(service_key)
                service_candidates.append({
                    "procedure": qualified,
                    "sourceFile": definition.get("sourceFile") if definition else None,
                    "declaredProcedureWrapper": definition.get("declaredProcedureWrapper") if definition else None,
                    "permissionGuardCandidates": definition.get("permissionGuardCandidates", []) if definition else [],
                    "permissionKeyCandidates": definition.get("permissionKeyCandidates", []) if definition else [],
                    "permissionReviewState": "candidate source evidence; effective policy requires review",
                    "offlinePolicyCandidate": (
                        "durable-field-outbox-action"
                        if qualified in outbox_endpoints
                        else "online-only mutation unless an inspected outbox path overrides this hook"
                    ),
                })
            trigger["serviceCandidates"] = service_candidates
            trigger["serviceReviewState"] = (
                "same-file mutation binding candidate; runtime call path requires review"
                if service_candidates
                else "no same-file mutation binding found; action may be local, indirect or unresolved"
            )
            trigger["permissionReviewState"] = (
                "candidate guards attached to linked procedure; effective policy requires review"
                if service_candidates
                else "no linked procedure; permission applicability requires review"
            )
            trigger["offlinePolicyCandidate"] = (
                "durable-field-outbox-action"
                if any(item["offlinePolicyCandidate"] == "durable-field-outbox-action" for item in service_candidates)
                else "online-only mutation candidate"
                if service_candidates
                else "local-or-unlinked; offline eligibility requires review"
            )
        result = {
            "source": source_metadata,
            "counts": {
                "appRouterRegistrations": len(root_routers),
                "routerSourceFiles": len(routers),
                "apiRouteHandlers": len(api_routes),
                "sharedLayoutRoots": len(shared_shells),
                "pageRoutes": len(pages),
                "projectPageRoutes": sum("/projects/[id]/" in p for p in pages),
                "otherPageRoutes": sum("/projects/[id]/" not in p for p in pages),
                "proceduresMatchedByHistoricalPattern": len(definitions),
                "superAdminProceduresOmittedByHistoricalPattern": len(admin_omitted),
                "procedureDefinitionsByThesePatterns": len(definitions) + len(admin_omitted),
                "procedureDefinitionCandidatesIncludingDomainWrappers": len(procedure_candidates),
                "directProcedureHooks": total_hooks,
                "uniqueReachableProcedureHooks": len(all_hooks),
                "directDialogComponentReferences": direct_dialogs,
                "interactiveTriggerCandidates": len(all_trigger_candidates),
                "sharedLayoutHookActions": sum(len(shell["reachableProcedureCandidates"]) for shell in shared_shells),
                "sharedLayoutTriggerCandidates": sum(shell["triggerCandidateCount"] for shell in shared_shells),
                "triggersWithMutationCandidates": sum(bool(item["serviceCandidates"]) for item in all_trigger_candidates),
                "triggersWithPermissionMarkers": sum(any(item["permissionGuardCandidates"] or item["permissionKeyCandidates"] for item in trigger["serviceCandidates"]) for trigger in all_trigger_candidates),
                "triggersLinkedToFieldOutbox": sum(trigger["offlinePolicyCandidate"] == "durable-field-outbox-action" for trigger in all_trigger_candidates),
            },
            "interactionTriggerInventory": {
                "format": "JSON Lines; one route-scoped JSX event-handler candidate per line",
                "file": trigger_output.name if trigger_output else None,
                "count": len(all_trigger_candidates),
                "reviewState": "static trigger candidates; event call paths require review",
            },
            "limitations": [
                "Archive comment is not proof that contents match a Git commit.",
                "Reachable-source scan follows static and literal dynamic relative/@/ TS/TSX imports; computed import targets are not resolved.",
                "Procedure names do not establish effective permission or offline eligibility.",
                "Literal dynamic imports are followed; computed imports, callback call paths, runtime navigation and generated code require review.",
            ],
            "procedureSources": procedure_sources,
            "apiSurface": api_routes,
            "scheduledWorkflows": scheduled_workflows,
            "sharedShells": shared_shells,
            "offlineModel": offline_model,
            "routes": route_actions,
        }
        output = json.dumps(result, indent=2, sort_keys=True) + "\n"
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(output)
        if trigger_output:
            trigger_output.parent.mkdir(parents=True, exist_ok=True)
            with trigger_output.open("w") as handle:
                for candidate in all_trigger_candidates:
                    handle.write(json.dumps(candidate, sort_keys=True, separators=(",", ":")) + "\n")
        print(json.dumps({"source": result["source"], "counts": result["counts"], "output": str(args.output) if args.output else None}, indent=2))
    finally:
        if archive is not None:
            archive.close()


if __name__ == "__main__":
    main()
