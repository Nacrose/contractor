#!/usr/bin/env python3
"""Compare workbook package preservation without printing workbook cell data.

This is a structural gate for GridCraft save/reopen qualification. It does not
prove formula correctness or calculation freshness; those require application
and domain-level evidence bound to the exact saved bytes.
"""
import argparse
import hashlib
import json
import posixpath
import sys
import zipfile
from collections import Counter
from pathlib import Path
from xml.etree import ElementTree as ET

MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships"
XDR = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
LAYOUT_TAGS = {
    "sheetPr", "dimension", "sheetViews", "sheetFormatPr", "cols", "mergeCells",
    "conditionalFormatting", "dataValidations", "hyperlinks", "autoFilter",
    "printOptions", "pageMargins", "pageSetup", "headerFooter", "rowBreaks",
    "colBreaks", "legacyDrawing", "drawing", "tableParts",
}


def tag(namespace, local):
    return f"{{{namespace}}}{local}"


def _xml(archive, name):
    try:
        return ET.fromstring(archive.read(name))
    except (KeyError, ET.ParseError) as error:
        raise ValueError(f"invalid or missing workbook part: {name}") from error


def inspect_workbook(path):
    with zipfile.ZipFile(path) as archive:
        parts = set(archive.namelist())
        workbook = _xml(archive, "xl/workbook.xml")
        relationships = _xml(archive, "xl/_rels/workbook.xml.rels")
        targets = {
            relation.attrib["Id"]: relation.attrib["Target"]
            for relation in relationships.findall(tag(PKG_REL, "Relationship"))
        }
        sheets = {}
        sheet_order = []
        for sheet in workbook.findall(f"{tag(MAIN, 'sheets')}/{tag(MAIN, 'sheet')}"):
            relationship_id = sheet.attrib.get(tag(REL, "id"))
            target = targets.get(relationship_id)
            if target is None:
                raise ValueError("workbook sheet has no package relationship")
            sheet_part = (
                posixpath.normpath(target.lstrip("/"))
                if target.startswith("/")
                else posixpath.normpath(posixpath.join("xl", target))
            )
            if sheet_part not in parts:
                raise ValueError(f"missing worksheet part: {sheet_part}")
            sheet_name = sheet.attrib["name"]
            sheets[sheet_name] = sheet_part
            sheet_order.append(sheet_name)

        formulas = {}
        formula_errors = set()
        cell_styles = {}
        layout_hashes = {}
        for sheet_name, sheet_part in sheets.items():
            root = _xml(archive, sheet_part)
            layout = [
                ET.tostring(child, encoding="unicode")
                for child in root
                if child.tag.rsplit("}", 1)[-1] in LAYOUT_TAGS
            ]
            layout_hashes[sheet_name] = hashlib.sha256("\n".join(layout).encode()).hexdigest()
            for cell in root.iter(tag(MAIN, "c")):
                address = cell.attrib.get("r", "")
                cell_styles[(sheet_name, address)] = cell.attrib.get("s", "0")
                formula = cell.find(tag(MAIN, "f"))
                if formula is None:
                    continue
                key = (sheet_name, address)
                cached = cell.find(tag(MAIN, "v"))
                formulas[key] = {
                    "formula": formula.text or "",
                    "cached": cached.text if cached is not None else None,
                    "is_error": cell.attrib.get("t") == "e",
                }
                if cell.attrib.get("t") == "e":
                    formula_errors.add(key)

        media = {
            name: hashlib.sha256(archive.read(name)).hexdigest()
            for name in parts
            if name.startswith("xl/media/")
        }
        drawing_parts = sorted(
            name for name in parts
            if name.startswith("xl/drawings/drawing") and name.endswith(".xml")
        )
        drawings = Counter()
        drawing_hashes = {}
        for name in drawing_parts:
            raw = archive.read(name)
            drawing_hashes[name] = hashlib.sha256(raw).hexdigest()
            root = ET.fromstring(raw)
            drawings["shapes"] += len(root.findall(f".//{tag(XDR, 'sp')}"))
            drawings["pictures"] += len(root.findall(f".//{tag(XDR, 'pic')}"))
            drawings["graphicFrames"] += len(root.findall(f".//{tag(XDR, 'graphicFrame')}"))
            drawings["connectors"] += len(root.findall(f".//{tag(XDR, 'cxnSp')}"))
            drawings["groups"] += len(root.findall(f".//{tag(XDR, 'grpSp')}"))

        defined_names = Counter()
        for item in workbook.findall(f".//{tag(MAIN, 'definedName')}"):
            defined_names[(
                item.attrib.get("name", ""),
                item.attrib.get("localSheetId", ""),
                item.text or "",
            )] += 1
        external_links = {
            name: hashlib.sha256(archive.read(name)).hexdigest()
            for name in parts
            if name.startswith("xl/externalLinks/externalLink") and name.endswith(".xml")
        }
        styles_hash = hashlib.sha256(archive.read("xl/styles.xml")).hexdigest() if "xl/styles.xml" in parts else None
        calc = workbook.find(tag(MAIN, "calcPr"))
        calc_settings = {} if calc is None else {
            key: calc.attrib.get(key)
            for key in ("calcMode", "fullCalcOnLoad", "forceFullCalc", "calcId")
            if key in calc.attrib
        }

        return {
            "parts": parts,
            "sheets": sheets,
            "sheet_order": sheet_order,
            "layout_hashes": layout_hashes,
            "cell_styles": cell_styles,
            "formulas": formulas,
            "formula_errors": formula_errors,
            "media": media,
            "drawing_parts": drawing_parts,
            "drawing_hashes": drawing_hashes,
            "drawings": dict(drawings),
            "defined_names": defined_names,
            "external_links": external_links,
            "styles_hash": styles_hash,
            "calc_settings": calc_settings,
        }


def compare(before, after):
    before_formula_keys = set(before["formulas"])
    after_formula_keys = set(after["formulas"])
    common_formula_keys = before_formula_keys & after_formula_keys
    formula_changes = {
        key for key in common_formula_keys
        if before["formulas"][key]["formula"] != after["formulas"][key]["formula"]
    }
    cached_changes = {
        key for key in common_formula_keys
        if before["formulas"][key]["cached"] != after["formulas"][key]["cached"]
    }
    missing_media = set(before["media"]) - set(after["media"])
    changed_media = {
        name for name in set(before["media"]) & set(after["media"])
        if before["media"][name] != after["media"][name]
    }
    added_media = set(after["media"]) - set(before["media"])
    missing_parts = before["parts"] - after["parts"]
    added_parts = after["parts"] - before["parts"]
    removed_names = before["defined_names"] - after["defined_names"]
    added_names = after["defined_names"] - before["defined_names"]
    new_formula_errors = after["formula_errors"] - before["formula_errors"]
    cleared_formula_errors = before["formula_errors"] - after["formula_errors"]
    common_style_cells = set(before["cell_styles"]) & set(after["cell_styles"])
    changed_style_cells = {
        key for key in common_style_cells
        if before["cell_styles"][key] != after["cell_styles"][key]
    }
    common_layouts = set(before["layout_hashes"]) & set(after["layout_hashes"])
    changed_layouts = {
        name for name in common_layouts
        if before["layout_hashes"][name] != after["layout_hashes"][name]
    }
    changed_drawing_parts = {
        name for name in set(before["drawing_hashes"]) & set(after["drawing_hashes"])
        if before["drawing_hashes"][name] != after["drawing_hashes"][name]
    }
    changed_external_links = {
        name for name in set(before["external_links"]) & set(after["external_links"])
        if before["external_links"][name] != after["external_links"][name]
    }

    summary = {
        "before": {
            "sheetCount": len(before["sheets"]),
            "formulaCount": len(before["formulas"]),
            "formulaErrorCount": len(before["formula_errors"]),
            "mediaCount": len(before["media"]),
            "drawingPartCount": len(before["drawing_parts"]),
            "drawingObjects": before["drawings"],
            "definedNameCount": sum(before["defined_names"].values()),
            "externalLinkPartCount": len(before["external_links"]),
        },
        "after": {
            "sheetCount": len(after["sheets"]),
            "formulaCount": len(after["formulas"]),
            "formulaErrorCount": len(after["formula_errors"]),
            "mediaCount": len(after["media"]),
            "drawingPartCount": len(after["drawing_parts"]),
            "drawingObjects": after["drawings"],
            "definedNameCount": sum(after["defined_names"].values()),
            "externalLinkPartCount": len(after["external_links"]),
        },
        "differences": {
            "sheetNamesMissing": sorted(set(before["sheets"]) - set(after["sheets"])),
            "sheetNamesAdded": sorted(set(after["sheets"]) - set(before["sheets"])),
            "sheetOrderChanged": before["sheet_order"] != after["sheet_order"],
            "packagePartsMissing": len(missing_parts),
            "packagePartsAdded": len(added_parts),
            "worksheetLayoutsChanged": len(changed_layouts),
            "cellStylesChanged": len(changed_style_cells),
            "formulaCellsMissing": len(before_formula_keys - after_formula_keys),
            "formulaCellsAdded": len(after_formula_keys - before_formula_keys),
            "formulaExpressionsChanged": len(formula_changes),
            "formulaCachedResultsChanged": len(cached_changes),
            "formulaErrorsAdded": len(new_formula_errors),
            "formulaErrorsCleared": len(cleared_formula_errors),
            "mediaMissing": len(missing_media),
            "mediaChanged": len(changed_media),
            "mediaAdded": len(added_media),
            "drawingPartsMissing": len(set(before["drawing_parts"]) - set(after["drawing_parts"])),
            "drawingPartsChanged": len(changed_drawing_parts),
            "definedNamesRemoved": sum(removed_names.values()),
            "definedNamesAdded": sum(added_names.values()),
            "externalLinkPartsMissing": len(set(before["external_links"]) - set(after["external_links"])),
            "externalLinkPartsChanged": len(changed_external_links),
            "stylesPartChanged": before["styles_hash"] != after["styles_hash"],
            "calculationSettingsChanged": before["calc_settings"] != after["calc_settings"],
        },
    }

    required = summary["differences"]
    failures = []
    if required["sheetNamesMissing"] or required["sheetNamesAdded"] or required["sheetOrderChanged"]:
        failures.append("worksheet names or count changed")
    if required["worksheetLayoutsChanged"] or required["cellStylesChanged"] or required["stylesPartChanged"]:
        failures.append("worksheet layout or styles changed")
    if required["formulaCellsMissing"] or required["formulaExpressionsChanged"]:
        failures.append("formula cells were removed or changed")
    if required["formulaErrorsAdded"]:
        failures.append("formula error caches increased")
    if required["mediaMissing"] or required["mediaChanged"]:
        failures.append("embedded media was removed or changed")
    if required["drawingPartsChanged"]:
        failures.append("drawing part content changed")
    for kind in ("shapes", "pictures", "graphicFrames", "connectors", "groups"):
        if summary["after"]["drawingObjects"].get(kind, 0) < summary["before"]["drawingObjects"].get(kind, 0):
            failures.append(f"drawing {kind} were lost")
    if required["definedNamesRemoved"] or required["externalLinkPartsMissing"] or required["externalLinkPartsChanged"]:
        failures.append("defined names or external-link parts were removed")
    if required["calculationSettingsChanged"]:
        failures.append("calculation settings changed")
    if required["drawingPartsMissing"]:
        failures.append("drawing parts were removed")
    summary["strictGate"] = {"passed": not failures, "failures": failures}
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("before", type=Path, help="workbook before the GridCraft edit/save cycle")
    parser.add_argument("after", type=Path, help="workbook after GridCraft save and reopen")
    parser.add_argument("--strict", action="store_true", help="exit 1 when structural preservation fails")
    args = parser.parse_args()
    try:
        result = compare(inspect_workbook(args.before), inspect_workbook(args.after))
    except (OSError, zipfile.BadZipFile, ValueError) as error:
        parser.error(str(error))
    print(json.dumps(result, indent=2, sort_keys=True))
    if args.strict and not result["strictGate"]["passed"]:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
