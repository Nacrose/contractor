#!/usr/bin/env python3
"""Audit a Construction Manager ZIP and the TS/TSX tree reachable from its pages.

Usage: python3 scripts/audit_frontend_archive.py ARCHIVE.zip [--output FILE.json]
This index does not prove ZIP-to-Git identity or infer effective guards/offline policy.
"""
import argparse
import hashlib
import json
import re
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
    parser.add_argument("archive", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    raw = args.archive.read_bytes()
    with zipfile.ZipFile(args.archive) as archive:
        files = set(archive.namelist())
        pages = sorted(
            name for name in files
            if name.startswith(ROOT + "src/app/") and name.endswith("/page.tsx")
        )
        routers = sorted(
            name for name in files
            if name.startswith(ROOT + "src/server/routers/")
            and name.endswith(".ts") and not name.endswith("/_app.ts")
        )
        app = archive.read(ROOT + "src/server/routers/_app.ts").decode()
        root_routers = re.findall(r"^\s*(\w+):\s*\w+Router,", app, re.M)
        old_pattern = re.compile(
            r"^\s*([a-zA-Z0-9_]+):\s*(?:publicProcedure|protectedProcedure|"
            r"projectProcedure|adminProcedure|procedure|orgProcedure)", re.M
        )
        definitions = set()
        for name in routers:
            src = archive.read(name).decode(errors="ignore")
            basename = name.rsplit("/", 1)[-1][:-3]
            router = basename.split("-")[0] + "".join(x.capitalize() for x in basename.split("-")[1:])
            definitions.update((router, proc) for proc in old_pattern.findall(src))
        admin = archive.read(ROOT + "src/server/routers/admin.ts").decode()
        admin_omitted = re.findall(r"^\s*([\w]+):\s*superAdminProcedure\b", admin, re.M)
        procedure_sources = {}
        for name in routers:
            src = archive.read(name).decode(errors="ignore")
            base = name.rsplit("/", 1)[-1][:-3]
            router = base.split("-")[0] + "".join(x.capitalize() for x in base.split("-")[1:])
            for match in re.finditer(r"^\s*([A-Za-z0-9_]+):\s*([A-Za-z0-9_]+Procedure)\b", src, re.M):
                next_prop = re.search(r"^\s*[A-Za-z0-9_]+:\s*\w+Procedure\b", src[match.end():], re.M)
                end = match.end() + next_prop.start() if next_prop else min(len(src), match.end() + 1500)
                body = src[match.end():end]
                kind = "mutation" if re.search(r"\.mutation\s*\(", body) else "query" if re.search(r"\.query\s*\(", body) else "unclassified"
                procedure_sources[f"{router}.{match.group(1)}"] = {
                    "sourceFile": name.removeprefix(ROOT),
                    "declaredProcedureWrapper": match.group(2),
                    "handlerKind": kind,
                }
        route_actions = []
        all_hooks, total_hooks, direct_dialogs = set(), 0, 0
        for page in pages:
            pending, visited, hooks, dialogs = [page], set(), set(), set()
            while pending:
                current = pending.pop()
                if current in visited:
                    continue
                visited.add(current)
                try:
                    src = archive.read(current).decode(errors="ignore")
                except KeyError:
                    continue
                hooks.update(f"{path} [{method.removeprefix('use')}]" for path, method in HOOK.findall(src))
                dialogs.update(DIALOG.findall(src))
                for imported in IMPORT.findall(src):
                    target = resolve_local_import(current, imported, files)
                    if target:
                        pending.append(target)
            direct = archive.read(page).decode(errors="ignore")
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
            "source": {
                "archive": args.archive.name,
                "sha256": hashlib.sha256(raw).hexdigest(),
                "zipCommentRevisionClaim": archive.comment.decode(errors="replace"),
            },
            "counts": {
                "appRouterRegistrations": len(root_routers),
                "routerSourceFiles": len(routers),
                "pageRoutes": len(pages),
                "projectPageRoutes": sum("/projects/[id]/" in p for p in pages),
                "otherPageRoutes": sum("/projects/[id]/" not in p for p in pages),
                "proceduresMatchedByHistoricalPattern": len(definitions),
                "superAdminProceduresOmittedByHistoricalPattern": len(admin_omitted),
                "procedureDefinitionsByThesePatterns": len(definitions) + len(admin_omitted),
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


if __name__ == "__main__":
    main()
