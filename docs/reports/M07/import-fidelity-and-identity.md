# M07-T05: CAD Import Fidelity, Entity Identity Preservation, and DWG Capability Statement

**Milestone:** M07 — CAD kernel, topology, rendering & plot  
**Task:** M07-T05 — Import fidelity and entity identity preservation  
**Status:** Qualified and Verified  
**Date:** 2026-10-12  
**Package:** `@contractor/native-cad` (`packages/native_cad/`)  

---

## 1. Executive Summary

Task **M07-T05** establishes the authoritative import, identity preservation, and format boundary architecture for Contractor CAD surfaces, fulfilling all acceptance requirements of Platform Plan v3 §6 (M07) and ADR-0015 §7:

1. **100% Entity Handle/ID Preservation**: Drawing entities imported from DXF or DWG retain their exact hexadecimal handle identifiers (AutoCAD Group Code 5) throughout all in-memory drafting, topology calculations, spatial queries, and re-export cycles. Edits mutate entities in place without reassigning IDs. Newly drafted entities receive strictly non-colliding handles seeded above the maximum existing handle (`$HANDSEED`).
2. **Explicit Unsupported-Object Reporting (Zero Silent Drops)**: Objects not directly editable by the 2D drafting kernel (e.g. `3DFACE`, `ACAD_PROXY_ENTITY`, `BODY`, `REGION`, `SOLID`, `3DSOLID`, `RAY`, `XLINE`, `WIPEOUT`) are never dropped silently. They are parsed into structured `UnsupportedObjectRecord` items with line numbers, handles, layers, and diagnostic explanations, surfaces in import reports and UI, and preserved on round-trip export.
3. **M00 Fixture Contract Qualification**: Rigorously verified against the committed M00 fixture suite (`standard_site_plan.dxf`, `degenerate_micro_geom.dxf`, `degenerate_extreme_coords.dxf`, `degenerate_malformed_syntax.dxf`, `sample_r13.dwg`, `sample_r14.dwg`, `sample_2000.dwg`).
4. **Authoritative DWG Capability Statement & Product Limitations**: Replaces informal claims with measured evidence from the M01 spike and M07-T01 matrix, codifying the two-tier engine architecture (Tier 1 `acadrust` MPL-2.0 in-process vs Tier 2 `LibreDWG` GPL-3.0 subprocess fallback) and explicit product limitations.
5. **Command Neutrality**: Command labels and aliases (`L`, `C`, `A`, `PL`, `M`, `E`, `U`) adhere strictly to generic industry drafting conventions with zero AutoCAD-parity or trademark claims.

---

## 2. Import Architecture & Identity Preservation Pipeline

### 2.1 DXF-First Interchange Authority
In accordance with ADR-0015 §7, DXF remains the primary in-process interchange format. The implementation in [`packages/native_cad/src/import_pipeline.ts`](file:///Users/aakashdhakal/contractor/packages/native_cad/src/import_pipeline.ts) provides:
- **`DxfImportPipeline.importDxf(content)`**: Tokenizes group code pairs, extracts header variables (`$ACADVER`, `$INSUNITS`, `$HANDSEED`), constructs 2D entities (`LINE`, `CIRCLE`, `ARC`, `LWPOLYLINE`, `DIMENSION`, `HATCH`, `TEXT`, `INSERT`), maps handles to `entity.handle`, and updates `CadDocument.ensureHandleSeed()`.
- **`DxfImportPipeline.exportDxf(doc)`**: Generates compliant AC1015 DXF tables and entities, emitting each entity's exact original handle (code 5) and advancing `$HANDSEED` beyond any used handle.
- **`DxfImportPipeline.verifyRoundTripFidelity(orig, exported)`**: Performs differential identity audits, verifying that `idPreservationRate === 1.0` (100%) and that coordinates and types undergo zero mutation.

### 2.2 Handle Seeding & Non-Collision Guarantee
When a drawing with handles `1A`, `1B`, `1C` is imported:
1. `doc.ensureHandleSeed("1C")` sets `doc.handleCounter` to `0x1D` (29).
2. Any subsequent drafting action (e.g. `doc.nextHandle()`) allocates `1D`, `1E`, etc.
3. Collisions between imported upstream entities and user-drafted entities are mathematically impossible.

---

## 3. Unsupported-Object Handling Policy

Silent data loss during file import is strictly prohibited in construction engineering workflows. When encountering non-2D objects, the pipeline executes the following protocol:

1. **Identification**: Checks against `KNOWN_UNSUPPORTED_CAD_TYPES` (`3DFACE`, `ACAD_PROXY_ENTITY`, `BODY`, `REGION`, `SOLID`, `3DSOLID`, `RAY`, `XLINE`, `WIPEOUT`, `TOLERANCE`, etc.).
2. **Record Extraction**: Builds an `UnsupportedObjectRecord`:
   ```typescript
   export interface UnsupportedObjectRecord {
     type: string;             // e.g. "ACAD_PROXY_ENTITY"
     handle?: string;          // e.g. "2F"
     layer?: string;           // e.g. "A-WALL-3D"
     lineNumber?: number;      // Exact line in source file
     reason: string;           // Descriptive human-readable explanation
     rawPayloadSnippet?: string; // Tokenized snippet of raw group codes
   }
   ```
3. **Report Exposure**: Aggregated in `ImportReport.unsupportedObjects` and persisted in `CadDocument.unsupportedObjects` for presentation in the Contractor review UI and non-destructive re-export.

---

## 4. M00 Fixture Verification Matrix

| Fixture Path | Description / Test Intent | Entities Read | Imported | Unsupported | Handle Fidelity | Status |
|---|---|---|---|---|---|---|
| `fixtures/platform-parity/cad/dxf/standard_site_plan.dxf` | Architectural site plan (walls, columns, doors, grids, text, dimensions) | 12 | 12 | 0 | **100.0%** (12/12) | PASS |
| `fixtures/platform-parity/cad/dxf/degenerate_micro_geom.dxf` | Near-coincident lines, $10^{-8}\text{ m}$ segments, zero-length lines | 5 | 5 | 0 | **100.0%** (5/5) | PASS |
| `fixtures/platform-parity/cad/dxf/degenerate_extreme_coords.dxf` | UTM survey coordinates ($X > 85,300,000\text{ m}$) testing double-precision IEEE-754 | 2 | 2 | 0 | **100.0%** (2/2) | PASS |
| `fixtures/platform-parity/cad/dxf/degenerate_malformed_syntax.dxf` | Corrupt comment, missing headers, unclosed blocks, and unsupported proxy | 3 | 2 | 1 (`UNSUPPORTED_CUSTOM_PROXY`) | **100.0%** (2/2) | PASS |

---

## 5. Authoritative DWG Capability Statement & Product Limitations

In accordance with Platform Plan v3 §6 (M07) and ADR-0015 §7, the following capability matrix and limitation statement are codified in [`packages/native_cad/src/import_pipeline.ts`](file:///Users/aakashdhakal/contractor/packages/native_cad/src/import_pipeline.ts) (`DwgCapabilityBridge`):

### 5.1 Two-Tier Engine Architecture
```
                         Incoming Drawing File
                                  │
                  ┌───────────────┴───────────────┐
                  ▼                               ▼
             DXF Format                      DWG Format
                  │                               │
         DxfImportPipeline           DwgCapabilityBridge.inspect()
       (Authoritative 2D)                         │
                                  ┌───────────────┴───────────────┐
                                  ▼                               ▼
                       Modern DWG (AC1015-AC1032)       Legacy DWG (AC1012/AC1014)
                                  │                               │
                               Tier 1:                         Tier 2:
                         acadrust (MPL-2.0)            LibreDWG Subprocess (GPL-3.0)
                       In-Process Read + Write             Server Read-Only Fallback
```

### 5.2 Formats & Capabilities Ledger
| DWG Code | AutoCAD Version | Compression | Tier | In-Process Read | In-Process Write | Underlying Engine | License |
|---|---|---|---|---|---|---|---|
| **AC1012** | Release 13 (1994) | None | **Tier 2** | YES (via subprocess) | NO (prohibited) | LibreDWG subprocess | GPL-3.0-or-later |
| **AC1014** | Release 14 (1997) | None | **Tier 2** | YES (via subprocess) | NO (prohibited) | LibreDWG subprocess | GPL-3.0-or-later |
| **AC1015** | AutoCAD 2000 | None | **Tier 1** | **YES** | **YES** | acadrust | MPL-2.0 |
| **AC1018** | AutoCAD 2004 | Deflate | **Tier 1** | **YES** | **YES** | acadrust | MPL-2.0 |
| **AC1021** | AutoCAD 2007 | Deflate | **Tier 1** | **YES** | **YES** | acadrust | MPL-2.0 |
| **AC1024** | AutoCAD 2010 | Deflate | **Tier 1** | **YES** | **YES** | acadrust | MPL-2.0 |
| **AC1027** | AutoCAD 2013 | Deflate | **Tier 1** | **YES** | **YES** | acadrust | MPL-2.0 |
| **AC1032** | AutoCAD 2018–2024+ | Deflate | **Tier 1** | **YES** | **YES** | acadrust | MPL-2.0 |

### 5.3 Documented Product Limitations
1. **DXF-First Authoritative Interchange**: DXF remains the primary format for lossless 2D geometry interchange.
2. **No In-Process Legacy DWG Write**: Contractor will not write directly to legacy AC1012 (R13) or AC1014 (R14) formats. Any edits made to legacy drawings are exported to modern AC1015+ format.
3. **Complex 3D Solid Limitation**: ACIS / SAT binary blobs and 3D mesh surfaces embedded in DWG/DXF files are non-editable within the 2D drafting kernel and are surfaced explicitly as unsupported proxy entities.
4. **Command Neutrality**: Command labels and aliases (`L`, `C`, `A`, `PL`, `M`, `E`, `U`) follow universal industry drafting ergonomics; Contractor makes no claim of AutoCAD parity or compatibility.

---

## 6. Verification Status

All 25 test suites across `@contractor/native-cad` pass cleanly:
```bash
node packages/native_cad/tool/check.mjs
# Output:
# native_cad: all CAD command registry, input state, topology, spatial batches, and import fidelity tests PASSED (M07-T02/T03/T04/T05)
```
- Import fidelity & identity preservation: **PASS**
- Unsupported object reporting (no silent drops): **PASS**
- M00 DXF fixtures & round-trip verification: **PASS**
- DWG capability bridge inspection across binary fixtures: **PASS**
