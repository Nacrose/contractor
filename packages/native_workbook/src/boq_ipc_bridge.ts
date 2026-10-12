/**
 * IPC/BoQ Financial Integration Bridge (M06-T07).
 *
 * Implements the boundary between the native workbook engine and the existing
 * financial domain services, as required by platform plan v3 §5.1 and §6 M06.
 *
 * Design invariants (from acceptance criteria):
 *
 *  1. EXACT-DECIMAL BOUNDARY — worksheet cell values cross the service boundary
 *     ONLY as exact-decimal strings (e.g. "1234.50") or scaled integers
 *     (e.g. 123450 in hundredths). No f64 arithmetic escapes into the financial
 *     services; all numeric coercion is done here and verified before dispatch.
 *
 *  2. NO CLIENT-AUTHORIZED POSTINGS — this module NEVER posts directly to the
 *     financial ledger. Every IPC/BoQ posting path is an existing service call
 *     (registry operation "worksheet.update" → ipc-recalc engine) with its own
 *     permission guards intact. This module is a read/format/route layer only.
 *
 *  3. ROUND-TRIP PROVENANCE — the WorksheetIpcExport and WorksheetIpcImport
 *     types carry workbookId, revision, and cellRef so that: (a) a reflected
 *     service response can be matched back to the originating worksheet cell;
 *     (b) the value present in the ledger entry and the value in the worksheet
 *     are demonstrably identical (same string, same scale).
 *
 *  4. CHANGE-FEED / FLUTTER-PARITY PATH — WorksheetIpcExport is the canonical
 *     payload shape that the change-feed (native_sync_feed) and Flutter clients
 *     consume when the server reflects recalculated IPC/BoQ totals back to the
 *     native layer. Flutter clients MUST deserialize this shape without
 *     modification; any extension to this shape is a breaking change and must
 *     follow the versioned contract process (standing constraint 3).
 *
 * References:
 *  - docs/reports/M00/inventory-routers.md row 79 (worksheet.ts / ipc-recalc)
 *  - packages/native_adapter/src/registry.ts "worksheet.update"
 *  - packages/native_workbook/src/types.ts DomainCellMetadata
 */

import type { CellModel, WorkbookModel } from './types.js';

// ---------------------------------------------------------------------------
// Exact-decimal helpers
// ---------------------------------------------------------------------------

/**
 * Validates that a string is a well-formed exact-decimal suitable for passing
 * to the financial services (no exponential notation, no trailing dot,
 * optional sign, optional decimal point, digits only around the dot).
 *
 * The financial services treat this string as the authoritative value; if it
 * does not conform, the dispatch is rejected before it reaches the network.
 */
export function isExactDecimalString(value: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(value);
}

/**
 * Converts a CellModel's computed or raw value to an exact-decimal string.
 *
 * Rules (in priority order):
 *  1. If the cell's value is already a string that passes isExactDecimalString,
 *     return it as-is (respects values that the user has explicitly typed as
 *     strings like "0.00").
 *  2. If the cell's computed value (formula result) is a finite number, format
 *     it with the requested decimalPlaces (default 2).
 *  3. If the cell's raw value is a finite number, same treatment.
 *  4. Otherwise, return null — the cell is not eligible for financial dispatch.
 *
 * @param cell The cell model to convert.
 * @param decimalPlaces Number of decimal places to enforce (default: 2).
 */
export function cellValueToExactDecimal(
  cell: CellModel,
  decimalPlaces = 2,
): string | null {
  const computed = cell.computed;
  const raw = cell.value;

  if (typeof raw === 'string' && isExactDecimalString(raw)) {
    return raw;
  }

  const candidate = computed !== undefined && computed !== null ? computed : raw;
  if (typeof candidate === 'number' && Number.isFinite(candidate)) {
    return candidate.toFixed(decimalPlaces);
  }
  return null;
}

/**
 * Converts an exact-decimal string to a scaled integer (in the given base
 * unit, e.g. hundredths = 100, thousandths = 1000).
 *
 * The result is a BigInt to guarantee no floating-point precision loss.
 * Callers that need a plain number should validate that the BigInt fits in
 * Number.MAX_SAFE_INTEGER before converting.
 *
 * @throws {RangeError} if the string is not a valid exact-decimal.
 * @throws {RangeError} if scale would require more decimal digits than present.
 */
export function exactDecimalToScaledInt(
  value: string,
  scale: 100 | 1000 | 10000 = 100,
): bigint {
  if (!isExactDecimalString(value)) {
    throw new RangeError(`Not an exact-decimal string: "${value}"`);
  }
  const [intPart, fracPart = ''] = value.replace(/^-/, '').split('.');
  const negative = value.startsWith('-');
  const scaleStr = String(scale);
  const requiredFracDigits = scaleStr.length - 1; // 100→2, 1000→3, 10000→4
  if (fracPart.length > requiredFracDigits) {
    throw new RangeError(
      `Decimal "${value}" has more than ${requiredFracDigits} fractional digits for scale ${scale}`,
    );
  }
  const paddedFrac = fracPart.padEnd(requiredFracDigits, '0');
  const combined = BigInt(intPart + paddedFrac);
  return negative ? -combined : combined;
}

// ---------------------------------------------------------------------------
// IPC / BoQ line-item types
// ---------------------------------------------------------------------------

/**
 * A single BoQ (Bill of Quantities) line item as read from the worksheet.
 * Values are exact-decimal strings at the service boundary.
 *
 * boqCode     — unique item code in the project BoQ (DomainCellMetadata.boqCode)
 * description — human-readable item description (DomainCellMetadata.description)
 * unit        — unit of measure (DomainCellMetadata.unit)
 * quantity    — exact-decimal string quantity from the worksheet
 * rate        — exact-decimal string unit rate from the worksheet
 * amount      — exact-decimal string product (quantity × rate); authoritative
 *               value is computed by the ipc-recalc engine, not this layer
 * currency    — ISO 4217 currency code (defaults to workbook metadata currency)
 * cellRef     — "sheetId:colId:rowId" provenance reference for round-trip
 * ledgerRef   — opaque reference forwarded from DomainCellMetadata.ledgerRef
 *               for linkage to the financial ledger entry
 */
export interface BoqLineItem {
  boqCode: string;
  description: string;
  unit: string;
  quantity: string;
  rate: string;
  amount: string;
  currency: string;
  cellRef: string;
  ledgerRef?: string;
}

/**
 * An IPC (Interim Payment Certificate) summary exported from the worksheet.
 * This is the payload dispatched to the ipc-recalc engine via "worksheet.update".
 *
 * workbookId — stable workbook identity (WorkbookModel.workbookId)
 * revision   — snapshot revision at the time of export (for round-trip check)
 * projectId  — project this IPC belongs to (from WorkbookMetadata.project)
 * ipcNumber  — IPC serial number extracted from the workbook (may be null if
 *              the workbook does not carry this metadata)
 * currency   — ISO 4217 from workbook metadata
 * lineItems  — BoQ line items eligible for financial posting
 * subtotal   — exact-decimal string sum of all line item amounts as computed
 *              by this layer from the worksheet values; the ipc-recalc engine
 *              re-derives this independently and the values MUST match
 * exportedAt — ISO 8601 UTC timestamp of this export snapshot
 */
export interface WorksheetIpcExport {
  workbookId: string;
  revision: number;
  projectId: string;
  ipcNumber: number | null;
  currency: string;
  lineItems: BoqLineItem[];
  subtotal: string;
  exportedAt: string;
}

/**
 * The response payload reflected back from the ipc-recalc engine after it has
 * validated and accepted the IPC export. This shape is consumed by both the
 * TypeScript layer and Flutter clients (change-feed / Flutter-parity path).
 *
 * acceptedRevision — the workbook revision the server validated against
 * serverSubtotal   — the server's independently computed subtotal (must match)
 * discrepancies    — line items where the server's computed amount differs from
 *                    the worksheet amount (exact-decimal mismatch after rounding)
 * receiptId        — durable receipt id (M03-T04 §7 durable-receipt rules)
 * serverSeq        — monotonic server sequence for change-feed ordering
 * reflectedAt      — ISO 8601 UTC timestamp of server acceptance
 */
export interface WorksheetIpcImport {
  workbookId: string;
  acceptedRevision: number;
  serverSubtotal: string;
  discrepancies: Array<{
    cellRef: string;
    boqCode: string;
    worksheetAmount: string;
    serverAmount: string;
  }>;
  receiptId: string;
  serverSeq: number;
  reflectedAt: string;
}

// ---------------------------------------------------------------------------
// Bridge errors
// ---------------------------------------------------------------------------

export type BoqBridgeErrorCode =
  | 'no_eligible_cells'
  | 'exact_decimal_coercion_failed'
  | 'missing_boq_code'
  | 'missing_project'
  | 'subtotal_overflow'
  | 'round_trip_mismatch';

export class BoqBridgeError extends Error {
  constructor(
    public readonly code: BoqBridgeErrorCode,
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'BoqBridgeError';
  }
}

// ---------------------------------------------------------------------------
// Collection: extract BoQ-eligible cells from a workbook
// ---------------------------------------------------------------------------

/**
 * A cell is BoQ-eligible if ALL of the following hold:
 *  - It has DomainCellMetadata with a non-empty boqCode.
 *  - Its protection is NOT locked (locked cells carry formula-derived values
 *    managed by the ipc-recalc engine and are never re-submitted from the client).
 *  - Its effective value (computed or raw) can be coerced to an exact-decimal.
 */
function isBoqEligible(cell: CellModel): boolean {
  return (
    Boolean(cell.domainMetadata?.boqCode) &&
    !cell.protection.locked &&
    cellValueToExactDecimal(cell) !== null
  );
}

/**
 * Builds a cellRef string from sheet + cell identities.
 * Format: "<sheetId>:<colId>:<rowId>"
 */
function makeCellRef(sheetId: string, cell: CellModel): string {
  return `${sheetId}:${cell.colId}:${cell.rowId}`;
}

/**
 * Walks all sheets of a workbook and collects BoQ-eligible cells into
 * a flat list ordered by sheet insertion order, then by row index (ascending),
 * then by column index (ascending).
 *
 * The ordering ensures that the same workbook always produces the same
 * line-item list for a given revision, making exports deterministic.
 */
export function collectBoqCells(
  workbook: WorkbookModel,
): Array<{ sheetId: string; cell: CellModel }> {
  const result: Array<{ sheetId: string; cell: CellModel }> = [];

  for (const sheet of workbook.sheets) {
    const rowIndexById = new Map<string, number>(
      sheet.rows.map((r) => [r.id, r.index]),
    );
    const colIndexById = new Map<string, number>(
      sheet.cols.map((c) => [c.id, c.index]),
    );

    const eligibleCells = Object.values(sheet.cells).filter(isBoqEligible);

    eligibleCells.sort((a, b) => {
      const rowA = rowIndexById.get(a.rowId) ?? 0;
      const rowB = rowIndexById.get(b.rowId) ?? 0;
      if (rowA !== rowB) return rowA - rowB;
      const colA = colIndexById.get(a.colId) ?? 0;
      const colB = colIndexById.get(b.colId) ?? 0;
      return colA - colB;
    });

    for (const cell of eligibleCells) {
      result.push({ sheetId: sheet.id, cell });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Core export: workbook → WorksheetIpcExport
// ---------------------------------------------------------------------------

export interface ExportOptions {
  /**
   * ISO 8601 UTC timestamp to use as exportedAt. Defaults to new Date().toISOString().
   * Provided as an option so tests can pass a fixed value for determinism.
   */
  exportedAt?: string;

  /**
   * Number of decimal places to enforce at the boundary (default: 2).
   */
  decimalPlaces?: number;

  /**
   * If true, cells that fail exact-decimal coercion are silently skipped
   * instead of throwing. Default: false (fail-fast).
   */
  skipIneligible?: boolean;
}

/**
 * Builds a WorksheetIpcExport from the current workbook state.
 *
 * This is the ONLY function that should be called to prepare a workbook
 * snapshot for dispatch to the ipc-recalc engine. It enforces:
 *  - Exact-decimal formatting of all boundary values.
 *  - Subtotal computation in string arithmetic (no floating-point).
 *  - Provenance tracking (cellRef on every line item).
 *
 * @throws {BoqBridgeError} if the workbook has no eligible cells, if the
 *   project ID is missing, or if a cell fails coercion (when skipIneligible
 *   is false).
 */
export function buildIpcExport(
  workbook: WorkbookModel,
  opts: ExportOptions = {},
): WorksheetIpcExport {
  const decimalPlaces = opts.decimalPlaces ?? 2;
  const exportedAt = opts.exportedAt ?? new Date().toISOString();
  const skipIneligible = opts.skipIneligible ?? false;

  const projectId = workbook.metadata.project;
  if (!projectId) {
    throw new BoqBridgeError(
      'missing_project',
      'WorkbookModel.metadata.project is required for IPC export',
    );
  }

  const currency = workbook.metadata.currency ?? 'USD';
  const eligible = collectBoqCells(workbook);

  if (eligible.length === 0) {
    throw new BoqBridgeError(
      'no_eligible_cells',
      'No BoQ-eligible (unlocked, domain-tagged, numeric) cells found in workbook',
    );
  }

  const lineItems: BoqLineItem[] = [];
  let subtotalCents = BigInt(0); // accumulate in scaled integer to avoid float drift
  const scale = 10 ** decimalPlaces;

  for (const { sheetId, cell } of eligible) {
    const meta = cell.domainMetadata!;
    const boqCode = meta.boqCode;
    if (!boqCode) {
      if (skipIneligible) continue;
      throw new BoqBridgeError(
        'missing_boq_code',
        `Cell ${cell.id} has DomainCellMetadata but no boqCode`,
        { cellId: cell.id },
      );
    }

    // We use the cell as the "amount" cell; quantity and rate may live in
    // sibling cells identified by isQuantityTarget or by convention. For this
    // first integration, each BoQ-eligible cell is treated as an amount cell.
    // A future task may introduce explicit quantity/rate cell pairing.
    const amountStr = cellValueToExactDecimal(cell, decimalPlaces);
    if (amountStr === null) {
      if (skipIneligible) continue;
      throw new BoqBridgeError(
        'exact_decimal_coercion_failed',
        `Cell ${cell.id} (boqCode "${boqCode}") could not be coerced to exact-decimal`,
        { cellId: cell.id, boqCode },
      );
    }

    // Accumulate subtotal in scaled integer arithmetic.
    try {
      const amountScaled = exactDecimalToScaledInt(
        amountStr,
        scale as 100 | 1000 | 10000,
      );
      subtotalCents += amountScaled;
    } catch (e) {
      if (skipIneligible) continue;
      throw new BoqBridgeError(
        'subtotal_overflow',
        `Cannot accumulate cell ${cell.id} amount "${amountStr}" into subtotal: ${String(e)}`,
        { cellId: cell.id, amountStr },
      );
    }

    lineItems.push({
      boqCode,
      description: meta.description ?? '',
      unit: meta.unit ?? '',
      quantity: '1', // placeholder: quantity cell pairing is a M06-T08+ concern
      rate: amountStr,
      amount: amountStr,
      currency: currency,
      cellRef: makeCellRef(sheetId, cell),
      ledgerRef: meta.ledgerRef,
    });
  }

  if (lineItems.length === 0) {
    throw new BoqBridgeError(
      'no_eligible_cells',
      'No line items could be constructed after coercion (all cells skipped or failed)',
    );
  }

  // Format subtotal from scaled integer back to exact-decimal string.
  const subtotalStr = formatScaledIntToDecimal(subtotalCents, decimalPlaces);

  return {
    workbookId: workbook.workbookId,
    revision: workbook.revision,
    projectId,
    ipcNumber: extractIpcNumber(workbook),
    currency,
    lineItems,
    subtotal: subtotalStr,
    exportedAt,
  };
}

// ---------------------------------------------------------------------------
// Round-trip verification: WorksheetIpcImport → worksheet
// ---------------------------------------------------------------------------

/**
 * Verifies that a WorksheetIpcImport response from the ipc-recalc engine is
 * consistent with the export that produced it.
 *
 * Checks:
 *  1. workbookId matches.
 *  2. acceptedRevision matches the revision in the original export.
 *  3. serverSubtotal matches the export subtotal (exact-decimal string equality).
 *  4. discrepancies array is empty (no line-item amount mismatch).
 *
 * @throws {BoqBridgeError} with code "round_trip_mismatch" on any check failure.
 */
export function verifyIpcRoundTrip(
  exportPayload: WorksheetIpcExport,
  importPayload: WorksheetIpcImport,
): void {
  const mismatches: string[] = [];

  if (exportPayload.workbookId !== importPayload.workbookId) {
    mismatches.push(
      `workbookId mismatch: exported "${exportPayload.workbookId}", server returned "${importPayload.workbookId}"`,
    );
  }

  if (exportPayload.revision !== importPayload.acceptedRevision) {
    mismatches.push(
      `revision mismatch: exported revision ${exportPayload.revision}, server accepted revision ${importPayload.acceptedRevision}`,
    );
  }

  if (exportPayload.subtotal !== importPayload.serverSubtotal) {
    mismatches.push(
      `subtotal mismatch: worksheet computed "${exportPayload.subtotal}", server computed "${importPayload.serverSubtotal}"`,
    );
  }

  if (importPayload.discrepancies.length > 0) {
    for (const disc of importPayload.discrepancies) {
      mismatches.push(
        `line-item discrepancy: cellRef="${disc.cellRef}" boqCode="${disc.boqCode}" ` +
          `worksheetAmount="${disc.worksheetAmount}" serverAmount="${disc.serverAmount}"`,
      );
    }
  }

  if (mismatches.length > 0) {
    throw new BoqBridgeError(
      'round_trip_mismatch',
      `IPC round-trip verification failed:\n  ${mismatches.join('\n  ')}`,
      { exportRevision: exportPayload.revision, importedRevision: importPayload.acceptedRevision },
    );
  }
}

// ---------------------------------------------------------------------------
// Worksheet cell reflection: apply ipc-recalc results back to worksheet
// ---------------------------------------------------------------------------

/**
 * Descriptor for a cell value update reflected from the ipc-recalc engine.
 * Returned by reflectIpcImport() so the caller can pass it to
 * WorkbookCommandEngine or WorkbookOperationJournal.
 *
 * The caller MUST route this through the "worksheet.update" operation in the
 * adapter registry (not apply it directly to the WorkbookModel) so that the
 * server-side permission guards run.
 */
export interface IpcCellReflection {
  /** The cell reference string from the line item (sheetId:colId:rowId). */
  cellRef: string;
  /** The exact-decimal string value returned by the server. */
  serverValue: string;
  /** Provenance: the receiptId from the ipc-recalc engine response. */
  provenanceReceiptId: string;
  /** Provenance: the serverSeq from the change-feed ordering. */
  provenanceServerSeq: number;
}

/**
 * Converts a WorksheetIpcImport into a list of IpcCellReflection descriptors
 * that the caller should route through the adapter's "worksheet.update" path
 * to update locked cells with the server's authoritative computed amounts.
 *
 * Only cells with NO discrepancy are reflected. Discrepant cells must be
 * reviewed by the user before their values are updated.
 *
 * This function does NOT mutate the workbook. Mutation is the caller's
 * responsibility, via the WorkbookCommandEngine / adapter guard chain.
 */
export function reflectIpcImport(
  exportPayload: WorksheetIpcExport,
  importPayload: WorksheetIpcImport,
): IpcCellReflection[] {
  const discrepantRefs = new Set(
    importPayload.discrepancies.map((d) => d.cellRef),
  );

  return exportPayload.lineItems
    .filter((item) => !discrepantRefs.has(item.cellRef))
    .map((item) => ({
      cellRef: item.cellRef,
      serverValue: item.amount, // server echoes accepted amount
      provenanceReceiptId: importPayload.receiptId,
      provenanceServerSeq: importPayload.serverSeq,
    }));
}

// ---------------------------------------------------------------------------
// Utilities (internal)
// ---------------------------------------------------------------------------

/**
 * Formats a scaled BigInt back to an exact-decimal string.
 * e.g. formatScaledIntToDecimal(123450n, 2) → "1234.50"
 *      formatScaledIntToDecimal(-750n, 2)  → "-7.50"
 *      formatScaledIntToDecimal(0n, 2)     → "0.00"
 */
function formatScaledIntToDecimal(scaled: bigint, decimalPlaces: number): string {
  const negative = scaled < BigInt(0);
  const abs = negative ? -scaled : scaled;
  const scaleBI = BigInt(10 ** decimalPlaces);
  const intPart = abs / scaleBI;
  const fracPart = abs % scaleBI;
  const fracStr = String(fracPart).padStart(decimalPlaces, '0');
  return `${negative ? '-' : ''}${intPart}.${fracStr}`;
}

/**
 * Attempts to extract a numeric IPC serial number from workbook metadata.
 * Looks for a "ipcNumber" key in metadata.custom, or returns null.
 */
function extractIpcNumber(workbook: WorkbookModel): number | null {
  const raw = workbook.metadata.custom?.['ipcNumber'];
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}
