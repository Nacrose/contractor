/**
 * Deterministic Generator for Scale BoQ Workbooks (50k & 100k rows)
 *
 * Implements a seeded pseudo-random number generator (Mulberry32) to generate
 * realistic civil engineering bill of quantities with four-factor measurements
 * (Nos * Length * Breadth * Height) and rate/amount formulas.
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

const BOQ_WORK_ITEMS = [
  { code: "1.01", desc: "Site clearing and grubbing", unit: "m2", minNos: 1, maxNos: 2, lRange: [50, 500], bRange: [10, 30], hRange: [1, 1], rate: 35.5 },
  { code: "1.02", desc: "Roadway excavation in common soil", unit: "m3", minNos: 1, maxNos: 4, lRange: [20, 200], bRange: [7, 15], hRange: [0.5, 3.0], rate: 450.0 },
  { code: "1.03", desc: "Rock excavation by controlled blasting", unit: "m3", minNos: 1, maxNos: 2, lRange: [10, 50], bRange: [5, 12], hRange: [1.0, 4.0], rate: 1250.0 },
  { code: "2.01", desc: "Granular sub-base class A", unit: "m3", minNos: 1, maxNos: 2, lRange: [50, 300], bRange: [7, 12], hRange: [0.15, 0.20], rate: 2850.0 },
  { code: "2.02", desc: "Crushed stone base course", unit: "m3", minNos: 1, maxNos: 2, lRange: [50, 300], bRange: [7, 12], hRange: [0.10, 0.15], rate: 3600.0 },
  { code: "3.01", desc: "M15 Grade concrete in leveling course", unit: "m3", minNos: 1, maxNos: 4, lRange: [5, 30], bRange: [1.5, 5.0], hRange: [0.10, 0.15], rate: 9800.0 },
  { code: "3.02", desc: "M25 Structural concrete in piers & abutments", unit: "m3", minNos: 2, maxNos: 6, lRange: [4, 15], bRange: [0.8, 2.5], hRange: [2.0, 6.0], rate: 16500.0 },
  { code: "4.01", desc: "High yield strength deformed rebar Fe500D", unit: "kg", minNos: 10, maxNos: 50, lRange: [6, 12], bRange: [1, 1], hRange: [1.58, 2.47], rate: 135.0 },
  { code: "5.01", desc: "Random rubble masonry in 1:4 cement sand mortar", unit: "m3", minNos: 1, maxNos: 3, lRange: [10, 80], bRange: [0.6, 1.5], hRange: [1.5, 4.5], rate: 6200.0 },
  { code: "6.01", desc: "Stone pitching with 150mm filter layer", unit: "m2", minNos: 1, maxNos: 2, lRange: [15, 60], bRange: [3, 8], hRange: [1, 1], rate: 1850.0 }
];

export function generateBoqWorkbook(rowCount = 50000, seed = 20261008) {
  const rand = mulberry32(seed);
  const cells = {};

  // Headers (Row 0)
  const headers = ["Item", "BOQ Code", "Description", "Nos", "Length", "Breadth", "Height", "Qty Formula", "Rate", "Amount Formula"];
  headers.forEach((h, col) => {
    cells[`0:${col}`] = { value: h, bold: true };
  });

  for (let r = 1; r <= rowCount; r++) {
    const item = BOQ_WORK_ITEMS[Math.floor(rand() * BOQ_WORK_ITEMS.length)];
    const nos = Math.floor(rand() * (item.maxNos - item.minNos + 1)) + item.minNos;
    const len = Number((item.lRange[0] + rand() * (item.lRange[1] - item.lRange[0])).toFixed(2));
    const brd = Number((item.bRange[0] + rand() * (item.bRange[1] - item.bRange[0])).toFixed(2));
    const hgt = Number((item.hRange[0] + rand() * (item.hRange[1] - item.hRange[0])).toFixed(2));
    const rowIdx = r + 1; // 1-based row index for A1 notation

    cells[`${r}:0`] = { value: r };
    cells[`${r}:1`] = { value: item.code };
    cells[`${r}:2`] = { value: `${item.desc} (Segment ${r})` };
    cells[`${r}:3`] = { value: nos };
    cells[`${r}:4`] = { value: len };
    cells[`${r}:5`] = { value: brd };
    cells[`${r}:6`] = { value: hgt };
    cells[`${r}:7`] = { value: `=D${rowIdx}*E${rowIdx}*F${rowIdx}*G${rowIdx}`, formula: `=D${rowIdx}*E${rowIdx}*F${rowIdx}*G${rowIdx}` };
    cells[`${r}:8`] = { value: item.rate };
    cells[`${r}:9`] = { value: `=H${rowIdx}*I${rowIdx}`, formula: `=H${rowIdx}*I${rowIdx}` };
  }

  return {
    version: 2,
    activeSheetId: "scale-boq-1",
    metadata: {
      generator: "generate-boq-scale.mjs",
      seed,
      requestedRows: rowCount,
      generatedAt: "2026-10-08T00:00:00.000Z"
    },
    sheets: [
      {
        id: "scale-boq-1",
        title: `Scale BoQ ${rowCount} Rows`,
        rowCount: rowCount + 5,
        colCount: 10,
        cells
      }
    ]
  };
}

export function computeWorkbookHash(wb) {
  const json = JSON.stringify(wb);
  const hash = createHash("sha256").update(json).digest("hex");
  return { hash, byteLength: Buffer.byteLength(json) };
}

// CLI execution handler
if (process.argv[1]?.endsWith("generate-boq-scale.mjs")) {
  const rows = parseInt(process.argv[2] || "1000", 10);
  const seed = parseInt(process.argv[3] || "20261008", 10);
  const wb = generateBoqWorkbook(rows, seed);
  const { hash, byteLength } = computeWorkbookHash(wb);
  console.log(`Generated BoQ workbook: rows=${rows}, seed=${seed}, totalCells=${Object.keys(wb.sheets[0].cells).length}, bytes=${byteLength}, sha256=${hash}`);
}
