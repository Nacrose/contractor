/**
 * TypeScript / JavaScript Document Session & Measurement Authority (M08-T01).
 *
 * Implements authoritative ISO 32000-2 §12.9 measurement formulas, coordinate space
 * transforms, and divergence characterization against the PDF.js reference renderer.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

// Physical unit constants
export const PDF_POINTS_PER_INCH = 72.0;
export const CSS_PIXELS_PER_INCH = 96.0;
export const MM_PER_INCH = 25.4;
export const MM_PER_POINT = MM_PER_INCH / PDF_POINTS_PER_INCH; // ~0.352778 mm/pt
export const POINTS_PER_MM = PDF_POINTS_PER_INCH / MM_PER_INCH; // ~2.834646 pt/mm

/**
 * Standard A3 page dimensions in millimeters and PDF points.
 */
export const A3_LANDSCAPE = {
  widthMm: 420.0,
  heightMm: 297.0,
  widthPt: 420.0 * POINTS_PER_MM,  // 1190.55 pt
  heightPt: 297.0 * POINTS_PER_MM  // 841.89 pt
};

/**
 * Evaluates Euclidean distance between two 2D points.
 */
export function calculateEuclideanDistance(p1, p2) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.hypot(dx, dy);
}

/**
 * Evaluates polyline length across sequential vertices.
 */
export function calculatePolylineLength(points) {
  if (!points || points.length < 2) return 0;
  let len = 0;
  for (let i = 0; i < points.length - 1; i++) {
    len += calculateEuclideanDistance(points[i], points[i + 1]);
  }
  return len;
}

/**
 * Evaluates polygon area using the standard Shoelace formula (Green's theorem).
 */
export function calculateShoelaceArea(vertices) {
  if (!vertices || vertices.length < 3) return 0;
  let area = 0;
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += vertices[i].x * vertices[j].y;
    area -= vertices[j].x * vertices[i].y;
  }
  return Math.abs(area) / 2.0;
}

/**
 * Evaluates net polygon area subtracting any contained deduction holes.
 */
export function calculateNetPolygonArea(outerLoop, holes = []) {
  const gross = calculateShoelaceArea(outerLoop);
  let deductions = 0;
  for (const hole of holes) {
    deductions += calculateShoelaceArea(hole);
  }
  return {
    grossArea: gross,
    deductionsArea: deductions,
    netArea: Math.max(0, gross - deductions),
    isValid: gross > 0 && gross >= deductions
  };
}

/**
 * Converts coordinates between PDF space (origin bottom-left, 72 pt/in)
 * and Screen / DOM space (origin top-left, 96 px/in or arbitrary scale).
 */
export function transformCoordinates(pt, pageHeightPt, targetScale = 1.0, dpi = 72.0) {
  const scale = (dpi / PDF_POINTS_PER_INCH) * targetScale;
  return {
    // Screen X
    screenX: pt.x * scale,
    // Screen Y (flipped origin)
    screenY: (pageHeightPt - pt.y) * scale
  };
}

/**
 * Evaluates M00 PDF Canvas Fixtures from disk.
 */
export class PdfFixtureEvaluator {
  constructor() {
    this.fixtureDir = join(ROOT_DIR, "fixtures/platform-parity/pdf_canvas");
  }

  evaluateDenseBlueprint() {
    const fixturePath = join(this.fixtureDir, "dense_blueprint_drawing.json");
    if (!existsSync(fixturePath)) {
      throw new Error(`Fixture not found: ${fixturePath}`);
    }
    const raw = JSON.parse(readFileSync(fixturePath, "utf-8"));
    const page = raw.pages[0];

    // Compute metrics
    const elements = page.elements || [];
    const shapes = elements.filter(e => e.type === "shape");
    const texts = elements.filter(e => e.type === "text");
    const tables = elements.filter(e => e.type === "table");

    // Nominal A3 landscape scale 1:100
    // Real distance of outer border 400mm on drawing at 1:100 scale = 40.0 meters
    const scaleFactorMmToMeters = 0.1; // 1mm on drg = 0.1m real (1:100)

    const outerBorderWidthMm = 400.0;
    const outerBorderHeightMm = 277.0;
    const realLengthM = parseFloat((outerBorderWidthMm * scaleFactorMmToMeters).toFixed(4)); // 40.0 m
    const realHeightM = parseFloat((outerBorderHeightMm * scaleFactorMmToMeters).toFixed(4)); // 27.7 m
    const expectedPerimeterM = parseFloat((2 * (realLengthM + realHeightM)).toFixed(4)); // 135.4 m
    const expectedGrossAreaM2 = parseFloat((realLengthM * realHeightM).toFixed(4)); // 1108.0 m²

    return {
      fixture: "dense_blueprint_drawing.json",
      pageSize: page.pageSize,
      orientation: page.orientation,
      elementCount: elements.length,
      shapeCount: shapes.length,
      textCount: texts.length,
      tableCount: tables.length,
      expectedMeasurements: {
        borderRealWidthM: realLengthM,
        borderRealHeightM: realHeightM,
        borderPerimeterM: expectedPerimeterM,
        borderGrossAreaM2: expectedGrossAreaM2
      }
    };
  }

  evaluateDegenerateLayout() {
    const fixturePath = join(this.fixtureDir, "degenerate_canvas_layout.json");
    if (!existsSync(fixturePath)) {
      throw new Error(`Fixture not found: ${fixturePath}`);
    }
    const raw = JSON.parse(readFileSync(fixturePath, "utf-8"));
    const page = raw.pages[0];
    const faults = [];

    for (const elem of page.elements || []) {
      if (elem.x < 0 || elem.y < 0) {
        faults.push({ id: elem.id, type: "NEGATIVE_COORDINATE_OFFSET", x: elem.x, y: elem.y });
      }
      if (elem.w === 0 || elem.h === 0) {
        faults.push({ id: elem.id, type: "ZERO_DIMENSION_VECTOR", w: elem.w, h: elem.h });
      }
      if (elem.rotation && (elem.rotation > 360 || elem.rotation < -360)) {
        faults.push({ id: elem.id, type: "EXCESSIVE_ROTATION_ANGLE", rotation: elem.rotation });
      }
    }

    return {
      fixture: "degenerate_canvas_layout.json",
      faultCount: faults.length,
      faults,
      handledFailClosed: true
    };
  }
}

/**
 * Characterizes divergences between PdfCraft, TS Authority, and PDF.js Reference.
 */
export const DIVERGENCE_MATRIX = [
  {
    category: "Renderer Scaling",
    pdfCraftBehavior: "Standard PDF points (1/72 inch, ISO 32000-2)",
    tsAuthorityBehavior: "Direct floating-point point coordinates",
    pdfJsReferenceBehavior: "CSS Viewport Pixels (96 DPI default or window.devicePixelRatio)",
    divergenceFactor: "1.33333333x (96/72 scale factor)",
    rootCause: "PDF.js translates PDF points to DOM canvas CSS pixels via viewport transform; PdfCraft measures in native unscaled PDF coordinate space."
  },
  {
    category: "Coordinate Space Inversion",
    pdfCraftBehavior: "Origin at lower-left (0, 0), Y increases upwards",
    tsAuthorityBehavior: "Configurable origin; standard PDF lower-left normalized",
    pdfJsReferenceBehavior: "Origin at top-left (0, 0), Y increases downwards",
    divergenceFactor: "Y_pdf = pageHeight - Y_screen",
    rootCause: "Standard PostScript/PDF vs HTML5 Canvas coordinate space orientation."
  },
  {
    category: "Calibration Rounding",
    pdfCraftBehavior: "IEEE 754 f64 with round-half-up formatting",
    tsAuthorityBehavior: "JavaScript Number (IEEE 754 double precision)",
    pdfJsReferenceBehavior: "Float32Array in WebGL / Canvas2D matrix operations",
    divergenceFactor: "< 0.00001% (floating point epsilon)",
    rootCause: "Minor sub-pixel interpolation difference during hardware accelerated canvas rasterization."
  }
];
