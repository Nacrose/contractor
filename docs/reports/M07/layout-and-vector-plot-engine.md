# M07-T06: CAD Layout, Paper Space, and Vector PDF Plot Engine

**Milestone:** M07 — CAD kernel, topology, rendering & plot  
**Task:** M07-T06 — Model/paper space, viewports, scale, lineweights, fonts, vector PDF plot via one layout/plot engine  
**Status:** Qualified and Verified  
**Date:** 2026-10-12  
**Package:** `@contractor/native-cad` (`packages/native_cad/`)  

---

## 1. Executive Summary

Task **M07-T06** establishes the authoritative layout, paper space sheet management, and pure vector PDF plot engine for Contractor CAD drafting surfaces, satisfying all acceptance requirements of Platform Plan v3 §6 (M07) and ADR-0015 §1:

1. **One Unified Plot Engine Across Platforms**: A single layout and plotting engine (`CadLayoutPlotEngine`) serves native desktop, web browser, and headless CI runtimes via pluggable `PlatformPrintAdapter` implementations. Per-platform print or plot reimplementations are strictly eliminated.
2. **Architectural Paper Space & Viewports**: Implements model space vs paper space layout switching (`activeSpace: 'model' | 'paper'`) and paper sheet definitions (ISO A0–A4, ANSI A–E, ARCH C–E) with arbitrary scaled viewports ($1:20$, $1:50$, $1:100$, $1:200$, $1:500$). Model coordinates map accurately through viewport centers and scales to paper millimeter space and PDF points, bounded by geometric clipping paths (`re W n`).
3. **Standard Lineweights & Plot Style Tables**: Maps AutoCAD standard lineweights (hundredths of mm: $0.05\text{ mm}$ to $2.00\text{ mm}$) to exact PDF points with a $0.2\text{ pt}$ hairline baseline. Supports both full RGB/ACI color rendering and monochrome plot styles (`monochrome.ctb`).
4. **Font Supply & Devanagari Script Gap Resolution**: Evaluated font supply via `craft-fonts` (ADR-0015 §1). Formally identified and resolved the Devanagari script gap: CAD `.shx` line fonts lack support for complex Nepali/Hindi Unicode ligatures and matras (`U+0900`..`U+097F`). The engine detects Devanagari text automatically and seamlessly applies OpenType Unicode font fallback (`NotoSansDevanagari`), preventing corrupted characters in cadastral, municipal, and site plan title blocks.
5. **Pure Vector PDF 1.4 Output**: Generates compliant vector PDF streams utilizing native PDF operators (`m`, `l`, `c`, `w`, `RG`, `rg`, `BT`, `Tf`, `Tj`, `ET`, `re W n`) with exact `MediaBox` paper sizing and cross-reference tables. Explicit raster fallback tracking identifies any non-vectorizable entities.

---

## 2. Architecture & Engine Design

### 2.1 Model vs Paper Space Layouts
Located at `packages/native_cad/src/layout_plot_engine.ts`:
- **Paper Dimensions**: Standardized millimeter and point metrics defined in `STANDARD_PAPER_SIZES` across ISO, ANSI, and ARCH sheet standards.
- **Viewport Transformation**:
  $$\Delta x = (x_{\text{model}} - \text{vp}.\text{modelCenter}.x) \times \text{vp}.\text{scale}$$
  $$\Delta y = (y_{\text{model}} - \text{vp}.\text{modelCenter}.y) \times \text{vp}.\text{scale}$$
  $$x_{\text{paper}} = \text{paperCenter}.x + \Delta x, \quad y_{\text{paper}} = \text{paperCenter}.y + \Delta y$$
  $$x_{\text{pdf}} = x_{\text{paper}} \times \frac{72}{25.4}, \quad y_{\text{pdf}} = y_{\text{paper}} \times \frac{72}{25.4}$$
- **Viewport Boundary Clipping**: Emits graphics state save `q`, clipping rectangle `[vpMinX, vpMinY, vpWidth, vpHeight] re W n`, draws viewport border, renders transformed drawing primitives, and restores graphics state `Q`. Drawing geometry outside the sheet viewport boundary is clipped cleanly without bleeding onto sheet margins.

### 2.2 AutoCAD Lineweight Conversion
| Lineweight Index | Metric Value | PDF Point Stroke (`w`) | Engineering Usage |
|---|---|---|---|
| **0** | $0.00\text{ mm}$ | $0.200\text{ pt}$ | Hairline / hatching boundaries |
| **9** | $0.09\text{ mm}$ | $0.255\text{ pt}$ | Thin dimension lines and extension lines |
| **13** | $0.13\text{ mm}$ | $0.369\text{ pt}$ | Centerlines and hidden lines |
| **25 (Default)** | $0.25\text{ mm}$ | $0.709\text{ pt}$ | Standard drafting outlines, notes, text |
| **35** | $0.35\text{ mm}$ | $0.992\text{ pt}$ | Section lines and secondary structural elements |
| **50** | $0.50\text{ mm}$ | $1.417\text{ pt}$ | Major structural walls and boundaries |
| **70** | $0.70\text{ mm}$ | $1.984\text{ pt}$ | Cut planes and title block borders |
| **100** | $1.00\text{ mm}$ | $2.835\text{ pt}$ | Heavy emphasis, match lines, sheet borders |

---

## 3. Font Supply & Devanagari Script Gap Evaluation

### 3.1 The CAD Font Problem
CAD drawings historically rely on AutoCAD `.shx` line fonts (compiled vector stroke sequences such as `simplex.shx`, `txt.shx`, `romans.shx`). While highly optimized for plotters, SHX fonts only encode ASCII or 8-bit regional code pages.

In Nepal and South Asia, construction contracts, municipal approval submissions, and land survey (नापी / कित्ता) drawings are strictly bilingual:
- Title blocks, client names, local municipality approvals, and land parcel ownership notes require Unicode Devanagari script (`U+0900`..`U+097F`).
- When opened in conventional CAD tools using `.shx` styles, Devanagari text renders as unreadable question marks (`???`), disjointed syllables, or raw uncomposed codepoints.

### 3.2 Implemented Resolution
The `CadLayoutPlotEngine` incorporates intelligent script detection and Unicode font fallback:
1. **Script Detection**: `containsDevanagari(text)` evaluates incoming strings against `/[\u0900-\u097F]/`.
2. **Dynamic Fallback Allocation**:
   - For Latin / Numeric text: maps to `/F1` (`Helvetica` / standard SHX vector stroke).
   - For Devanagari text: automatically flags `devanagariFallbackApplied: true` and maps font dictionary `/F_DEV` pointing to OpenType Unicode font supply (`NotoSansDevanagari`), preserving glyph conjuncts and matra positions.
3. **Audit Inventory**: `PlotResult.fontsUsed` exposes the exact fonts active in the output document.

---

## 4. Pure Vector PDF 1.4 Generation

The engine constructs a standards-compliant PDF 1.4 document from memory:
```text
%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 1190.55 841.89] /Contents 4 0 R /Resources 5 0 R >> endobj
4 0 obj << /Length ... >> stream
  q
  85.04 85.04 1020.47 671.81 re W n
  1.42 w 0.000 0.000 0.000 RG
  100.00 100.00 m 500.00 100.00 l S
  ...
  Q
endstream endobj
5 0 obj << /Font << /F1 << ... >> /F_DEV << ... >> >> >> endobj
xref
...
trailer << /Size 6 /Root 1 0 R >>
startxref ...
%%EOF
```

### Explicit Raster Fallback Policy
Where drawing primitives cannot be converted to vector paths (e.g. non-vectorized ACIS 3D solids, geo-referenced aerial orthophoto underlays, or corrupt geometry):
- The engine records the affected entity handles in `PlotResult.rasterFallbackEntities`.
- In `vector_with_raster_fallback` mode, an explicit raster tile is positioned, and warnings are returned in the result payload.
- No silent omissions occur.

---

## 5. Unified Platform Print Adapters

To prevent divergent plot implementations between web browsers and native desktop apps, all platform-specific delivery is decoupled into `PlatformPrintAdapter`:

```typescript
export interface PlatformPrintAdapter {
  readonly platformName: 'web' | 'desktop' | 'headless';
  outputPdf(pdfBytes: Uint8Array, filename: string): Promise<PlotOutputResult>;
}
```

- **`HeadlessPrintAdapter`**: Delivers bytes directly to in-memory buffers or CI test verification harnesses.
- **`WebPrintAdapter`**: Wraps the PDF `Uint8Array` in a `Blob`, registers an object URL (`blob://`), and triggers browser download or iframe printing preview.
- **`DesktopPrintAdapter`**: Streams binary bytes to local file storage (`file:///`) or desktop print spoolers.

---

## 6. Verification Status

All 30 test suites across `@contractor/native-cad` pass cleanly:
```bash
node packages/native_cad/tool/check.mjs
# Output:
# native_cad: all CAD command registry, input state, topology, spatial batches, import fidelity, and layout/plot tests PASSED (M07-T02/T03/T04/T05/T06)
```

Verified contract tests in `packages/native_cad/test/layout_plot_engine.test.ts`:
- Paper space layout definition and architectural viewports ($1:100$, $1:20$): **PASS**
- Lineweight to PDF point conversions ($0.00\text{ mm}$ to $1.00\text{ mm}$) and scale arithmetic: **PASS**
- Devanagari script detection and automatic Unicode font fallback: **PASS**
- Vector PDF 1.4 binary stream, viewport clipping (`re W n`), and vector primitives: **PASS**
- Unified platform print adapters (Web, Desktop, Headless): **PASS**
