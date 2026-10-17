#!/usr/bin/env python3
"""Audit a Construction Manager ZIP or checkout and source reachable from its pages.

Usage: python3 scripts/audit_frontend_archive.py SOURCE.zip-or-checkout [--coverage FILE.md] [--output FILE.json]
This index does not infer effective guards/offline policy.
"""
import argparse
import hashlib
import json
import re
import subprocess
import zipfile
from pathlib import Path, PurePosixPath

ROOT = "Construction-Manager-main/"
IMPORT = re.compile(r"(?:from\s*|import\s*)[\"']([^\"']+)[\"']")
HOOK = re.compile(r"trpc\.((?:[A-Za-z0-9_]+\.)*[A-Za-z0-9_]+)\.(useQuery|useMutation)\b")
DIALOG = re.compile(r"<([A-Z][A-Za-z0-9_]*Dialog)\b")


def resolve_local_import(source_name, import_name, existing):
    if import_name.startswith("@/"):
        base = "Construction-Manager-main/src/" + import_name[2:]
    elif import_name.startswith("."):
        base = str(PurePosixPath(source_name).parent / import_name)
    else:
        return None
    base = str(PurePosixPath(base))
    candidates = [base] if PurePosixPath(base).suffix else [
        base + ext for ext in (".tsx", ".ts", ".jsx", ".js")
    ] + [base + "/index" + ext for ext in (".tsx", ".ts", ".jsx", ".js")]
    return next((name for name in candidates if name in existing and "/src/" in name), None)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="source ZIP archive or checked-out repository")
    parser.add_argument("--output", type=Path)
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
                "reviewState": "component graph indexed; hook actions have IDs/source maps; control semantics, effective guards and policy call sites require review",
            })
        result = {
            "source": source_metadata,
            "counts": {
                "appRouterRegistrations": len(root_routers),
                "routerSourceFiles": len(routers),
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
            },
            "limitations": [
                "Archive comment is not proof that contents match a Git commit.",
                "Reachable-source scan follows static relative and @/ TS/TSX imports only.",
                "Procedure names do not establish effective permission or offline eligibility.",
                "Button callbacks, runtime navigation, dynamic imports and generated code require review.",
            ],
            "procedureSources": procedure_sources,
            "offlineModel": offline_model,
            "routes": route_actions,
        }
        output = json.dumps(result, indent=2, sort_keys=True) + "\n"
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(output)
        print(json.dumps({"source": result["source"], "counts": result["counts"], "output": str(args.output) if args.output else None}, indent=2))
    finally:
        if archive is not None:
            archive.close()


if __name__ == "__main__":
    main()
