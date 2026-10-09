import { writeFileSync } from "node:fs";
import { join } from "node:path";

function crlf(lines) {
  return lines.map((l) => String(l)).join("\r\n") + "\r\n";
}

// 1. Standard Site Plan DXF (AC1015)
export function createStandardSitePlanDxf() {
  const parts = [
    0, "SECTION", 2, "HEADER",
    9, "$ACADVER", 1, "AC1015",
    9, "$INSUNITS", 70, 4, // 4 = Millimeters
    9, "$EXTMIN", 10, 0.0, 20, 0.0, 30, 0.0,
    9, "$EXTMAX", 10, 50000.0, 20, 30000.0, 30, 0.0,
    0, "ENDSEC",

    0, "SECTION", 2, "TABLES",
    0, "TABLE", 2, "LTYPE", 70, 2,
    0, "LTYPE", 2, "CONTINUOUS", 70, 0, 3, "Solid line", 72, 65, 73, 0, 40, 0.0,
    0, "LTYPE", 2, "DASHED", 70, 0, 3, "Dashed __ __", 72, 65, 73, 2, 40, 10.0, 49, 7.0, 49, -3.0,
    0, "ENDTAB",
    0, "TABLE", 2, "LAYER", 70, 4,
    0, "LAYER", 2, "0", 70, 0, 62, 7, 6, "CONTINUOUS",
    0, "LAYER", 2, "WALLS", 70, 0, 62, 1, 6, "CONTINUOUS", // 1 = Red
    0, "LAYER", 2, "COLUMNS", 70, 0, 62, 3, 6, "CONTINUOUS", // 3 = Green
    0, "LAYER", 2, "GRID", 70, 0, 62, 8, 6, "DASHED", // 8 = Gray
    0, "LAYER", 2, "ANNOTATION", 70, 0, 62, 7, 6, "CONTINUOUS", // 7 = White
    0, "ENDTAB",
    0, "ENDSEC",

    0, "SECTION", 2, "ENTITIES",
    // Grid Lines (A-B, 1-2)
    0, "LINE", 8, "GRID", 10, 0.0, 20, 0.0, 30, 0.0, 11, 40000.0, 21, 0.0, 31, 0.0,
    0, "LINE", 8, "GRID", 10, 0.0, 20, 20000.0, 30, 0.0, 11, 40000.0, 21, 20000.0, 31, 0.0,
    0, "LINE", 8, "GRID", 10, 0.0, 20, 0.0, 30, 0.0, 11, 0.0, 21, 20000.0, 31, 0.0,
    0, "LINE", 8, "GRID", 10, 20000.0, 20, 0.0, 30, 0.0, 11, 20000.0, 21, 20000.0, 31, 0.0,
    0, "LINE", 8, "GRID", 10, 40000.0, 20, 0.0, 30, 0.0, 11, 40000.0, 21, 20000.0, 31, 0.0,

    // Columns at grid intersections (400x400)
    0, "LWPOLYLINE", 8, "COLUMNS", 90, 4, 70, 1,
    10, -200.0, 20, -200.0,
    10, 200.0, 20, -200.0,
    10, 200.0, 20, 200.0,
    10, -200.0, 20, 200.0,

    0, "LWPOLYLINE", 8, "COLUMNS", 90, 4, 70, 1,
    10, 19800.0, 20, -200.0,
    10, 20200.0, 20, -200.0,
    10, 20200.0, 20, 200.0,
    10, 19800.0, 20, 200.0,

    0, "LWPOLYLINE", 8, "COLUMNS", 90, 4, 70, 1,
    10, 39800.0, 20, -200.0,
    10, 40200.0, 20, -200.0,
    10, 40200.0, 20, 200.0,
    10, 39800.0, 20, 200.0,

    // Exterior Perimeter Wall with curved bay window
    0, "LWPOLYLINE", 8, "WALLS", 90, 5, 70, 1,
    10, 0.0, 20, 0.0, 42, 0.0,
    10, 40000.0, 20, 0.0, 42, 0.0,
    10, 40000.0, 20, 20000.0, 42, 0.0,
    10, 20000.0, 20, 20000.0, 42, 0.41421356, // Semi-curved feature (bulge for 90 deg arc)
    10, 0.0, 20, 20000.0, 42, 0.0,

    // Interior circular water tank / column pier
    0, "CIRCLE", 8, "COLUMNS", 10, 10000.0, 20, 10000.0, 30, 0.0, 40, 1500.0,

    // Door swing arc
    0, "ARC", 8, "WALLS", 10, 5000.0, 20, 0.0, 30, 0.0, 40, 1000.0, 50, 0.0, 51, 90.0,

    // Annotations
    0, "TEXT", 8, "ANNOTATION", 10, 10000.0, 20, 12000.0, 30, 0.0, 40, 350.0, 1, "STRUCTURAL BAY A-1",
    0, "TEXT", 8, "ANNOTATION", 10, 30000.0, 20, 12000.0, 30, 0.0, 40, 350.0, 1, "FABRICATION HALL B",
    0, "TEXT", 8, "ANNOTATION", 10, 0.0, 20, -1000.0, 30, 0.0, 40, 400.0, 1, "GRID 1",
    0, "TEXT", 8, "ANNOTATION", 10, 20000.0, 20, -1000.0, 30, 0.0, 40, 400.0, 1, "GRID 2",
    0, "TEXT", 8, "ANNOTATION", 10, 40000.0, 20, -1000.0, 30, 0.0, 40, 400.0, 1, "GRID 3",

    0, "ENDSEC",
    0, "EOF"
  ];
  return crlf(parts);
}

// 2. Degenerate Micro Geometry DXF (near-coincident, zero-length, extreme snap stress)
export function createDegenerateMicroGeomDxf() {
  const parts = [
    0, "SECTION", 2, "HEADER",
    9, "$ACADVER", 1, "AC1015",
    0, "ENDSEC",
    0, "SECTION", 2, "ENTITIES",

    // Zero-length line
    0, "LINE", 8, "DEGENERATE", 10, 100.0, 20, 100.0, 30, 0.0, 11, 100.0, 21, 100.0, 31, 0.0,

    // Near-coincident line segment (1e-8 delta)
    0, "LINE", 8, "DEGENERATE", 10, 200.0, 20, 200.0, 30, 0.0, 11, 200.00000001, 21, 200.00000001, 31, 0.0,

    // Micro-radius circle (1e-7)
    0, "CIRCLE", 8, "DEGENERATE", 10, 300.0, 20, 300.0, 30, 0.0, 40, 0.0000001,

    // Bulge approaching zero (straight segment masquerading as arc)
    0, "LWPOLYLINE", 8, "DEGENERATE", 90, 3, 70, 0,
    10, 0.0, 20, 0.0, 42, 1e-12,
    10, 50.0, 20, 0.0, 42, -1e-12,
    10, 100.0, 20, 0.0,

    // Self-intersecting bowtie polygon
    0, "LWPOLYLINE", 8, "DEGENERATE", 90, 4, 70, 1,
    10, 0.0, 20, 0.0,
    10, 100.0, 20, 100.0,
    10, 0.0, 20, 100.0,
    10, 100.0, 20, 0.0,

    0, "ENDSEC",
    0, "EOF"
  ];
  return crlf(parts);
}

// 3. Degenerate Extreme Coordinates DXF (UTM / large offsets testing IEEE 754 precision)
export function createDegenerateExtremeCoordsDxf() {
  const baseX = 85300000.12345678;
  const baseY = 27700000.87654321;
  const parts = [
    0, "SECTION", 2, "HEADER",
    9, "$ACADVER", 1, "AC1015",
    0, "ENDSEC",
    0, "SECTION", 2, "ENTITIES",

    // Small square (10x10) placed at 85 million mm offset
    0, "LWPOLYLINE", 8, "UTM_SITE", 90, 4, 70, 1,
    10, baseX, 20, baseY,
    10, baseX + 10.0, 20, baseY,
    10, baseX + 10.0, 20, baseY + 10.0,
    10, baseX, 20, baseY + 10.0,

    // Thin diagonal across extreme domain
    0, "LINE", 8, "UTM_SITE",
    10, baseX - 5000.0, 20, baseY - 5000.0, 30, 0.0,
    11, baseX + 5000.0, 21, baseY + 5000.0, 31, 0.0,

    0, "ENDSEC",
    0, "EOF"
  ];
  return crlf(parts);
}

// 4. Degenerate Malformed Syntax DXF (resync / error recovery test)
export function createDegenerateMalformedSyntaxDxf() {
  // Deliberately injected: spaces before codes, unknown group codes, unrecognized entity, missing ENDSEC
  return [
    "  0\r\nSECTION\r\n  2\r\nHEADER\r\n  9\r\n$ACADVER\r\n  1\r\nAC1015\r\n  0\r\nENDSEC\r\n",
    "  0\r\nSECTION\r\n  2\r\nENTITIES\r\n",
    "999\r\nCORRUPT_COMMENT_WITHOUT_SPEC\r\n",
    "  0\r\nLINE\r\n  8\r\nRECOVERY_LAYER\r\n 10\r\n0.0\r\n 20\r\n0.0\r\n 11\r\n100.0\r\n 21\r\n100.0\r\n",
    "  0\r\nUNSUPPORTED_CUSTOM_PROXY\r\n 90\r\n12345\r\n 310\r\nDEADBEEFCAFE\r\n",
    "  0\r\nCIRCLE\r\n  8\r\nRECOVERY_LAYER\r\n 10\r\n50.0\r\n 20\r\n50.0\r\n 40\r\n25.0\r\n",
    "0\r\nENDSEC\r\n0\r\nEOF\r\n"
  ].join("");
}
