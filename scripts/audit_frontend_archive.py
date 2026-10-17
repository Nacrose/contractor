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
        route_actions = []
        route_ids = {}
        next_route_id = 1
        if args.coverage:
            coverage_text = args.coverage.read_text()
            route_ids = {
                path: route_id
                for route_id, path in re.findall(
                    r"\|\s*`(ROUTE-\d+)`\s*\|\s*`([^`]+)`", coverage_text
                )
            }
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
            while pending:
                current = pending.pop()
                if current in visited:
                    continue
                visited.add(current)
                try:
                    src = read_source(current).decode(errors="ignore")
                except (KeyError, FileNotFoundError):
                    continue
                hooks.update(f"{path} [{method.removeprefix('use')}]" for path, method in HOOK.findall(src))
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
                mapped_hooks.append({"hook": hook, "candidateDefinition": service_key, "serverSource": definition})
            route_actions.append({
                "routeId": route_id,
                "originalRoute": route_path,
                "routeSource": page.removeprefix(ROOT),
                "reachableSourceFileCount": len(visited),
                "directPageProcedureHooks": sorted(set(direct_hooks)),
                "reachableProcedureHooks": sorted(hooks),
                "reachableProcedureCandidates": mapped_hooks,
                "directDialogComponents": direct_dialog_names,
                "reachableDialogComponents": sorted(dialogs),
                "reviewState": "component graph indexed; button semantics, effective guards and offline policy require review",
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
