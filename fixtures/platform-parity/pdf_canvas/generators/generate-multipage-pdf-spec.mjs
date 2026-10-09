/**
 * Deterministic Multi-Page PDF Canvas Specification Generator (100+ Pages)
 *
 * Generates synthetic high-page-count construction document bundles simulating
 * 120-page multi-drawing submittals and dense measurement reports.
 *
 * Seed: 20261008
 */
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";

export function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateMultipagePdfSpec(pageCount = 120, seed = 20261008) {
  const rand = mulberry32(seed);
  const pages = [];

  const PAPER_CHOICES = ["a4", "a3", "letter", "legal"];
  const ORIENTATIONS = ["portrait", "landscape"];

  for (let p = 1; p <= pageCount; p++) {
    const isDrawingPage = p > 2 && p % 2 === 0;
    const pageSize = isDrawingPage ? "a3" : (p === 1 ? "a4" : PAPER_CHOICES[Math.floor(rand() * PAPER_CHOICES.length)]);
    const orientation = isDrawingPage ? "landscape" : (p === 1 ? "portrait" : ORIENTATIONS[Math.floor(rand() * ORIENTATIONS.length)]);

    const elements = [
      {
        id: `header-text-${p}`,
        type: "text",
        x: 20,
        y: 15,
        w: 160,
        h: 12,
        text: `PROJECT DOCUMENTATION PACKAGE - SHEET ${p} OF ${pageCount}`,
        fontSize: 10,
        bold: true
      },
      {
        id: `page-border-${p}`,
        type: "shape",
        shape: "rect",
        x: 10,
        y: 10,
        w: orientation === "landscape" ? 277 : 190,
        h: orientation === "landscape" ? 190 : 277,
        stroke: "#1e293b",
        strokeWidth: 0.75,
        fill: "none"
      }
    ];

    if (isDrawingPage) {
      // Add vector entities to drawing pages
      const elementCount = 5 + Math.floor(rand() * 10);
      for (let e = 0; e < elementCount; e++) {
        elements.push({
          id: `geom-${p}-${e}`,
          type: "shape",
          shape: e % 2 === 0 ? "rect" : "circle",
          x: 30 + rand() * 180,
          y: 30 + rand() * 120,
          w: 15 + rand() * 30,
          h: 15 + rand() * 30,
          stroke: "#0284c7",
          strokeWidth: 0.5,
          fill: "#f0f9ff"
        });
      }
    } else {
      // Add tabular takeoff or notes
      elements.push({
        id: `table-${p}`,
        type: "table",
        x: 20,
        y: 40,
        w: 170,
        h: 120,
        rows: 8,
        cols: 4,
        columnWidths: [30, 60, 40, 40],
        cells: {
          "0:0": { "text": "ITEM", "bold": true },
          "0:1": { "text": "SPECIFICATION", "bold": true },
          "0:2": { "text": "COMPLIANCE", "bold": true },
          "0:3": { "text": "REMARKS", "bold": true },
          "1:0": { "text": `S-${p}.1` },
          "1:1": { "text": "Structural Grade C30/37" },
          "1:2": { "text": "PASSED" },
          "1:3": { "text": "7-day cube test verified" }
        }
      });
    }

    pages.push({
      id: `page-${p}`,
      pageNumber: p,
      pageSize,
      orientation,
      elements
    });
  }

  return {
    version: 1,
    metadata: {
      generator: "generate-multipage-pdf-spec.mjs",
      seed,
      requestedPages: pageCount,
      generatedAt: "2026-10-08T00:00:00.000Z"
    },
    pages
  };
}

export function computeDocHash(doc) {
  const json = JSON.stringify(doc);
  const hash = createHash("sha256").update(json).digest("hex");
  return { hash, byteLength: Buffer.byteLength(json) };
}

if (process.argv[1]?.endsWith("generate-multipage-pdf-spec.mjs")) {
  const pages = parseInt(process.argv[2] || "120", 10);
  const seed = parseInt(process.argv[3] || "20261008", 10);
  const doc = generateMultipagePdfSpec(pages, seed);
  const { hash, byteLength } = computeDocHash(doc);
  console.log(`Generated Multipage PDF spec: pages=${pages}, seed=${seed}, totalPages=${doc.pages.length}, bytes=${byteLength}, sha256=${hash}`);
}
