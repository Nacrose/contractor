/**
 * Document Authority Contract & Financial Projection Boundaries (M12-T03).
 * Enforces that documents and presentation decks are strictly read-only projections
 * of authoritative domain services (BoQ, Accounting, TruePPM).
 */

import { createHash } from 'node:crypto';

export class DocumentAuthorityViolationError extends Error {
  constructor(message: string) {
    super(`DocumentAuthorityViolationError: ${message}`);
    this.name = 'DocumentAuthorityViolationError';
  }
}

export class FrozenDocumentModificationError extends Error {
  constructor(documentId: string) {
    super(`FrozenDocumentModificationError: Document ${documentId} is already ISSUED and frozen against modification.`);
    this.name = 'FrozenDocumentModificationError';
  }
}

export type DocumentLifecycleStatus = 'DRAFT' | 'ISSUED' | 'ARCHIVED';

export interface AuthoritativeFinancialFigure {
  fieldName: string;
  amountPaisa: bigint; // Exact minor integer units
  formattedNepaliNpr: string; // e.g. "NPR 4,500,000.00"
  sourceLedgerSeq: number;
  sourceAccountCode: string;
}

export interface AuthoritativeBoQItemProjection {
  itemNumber: string;
  description: string;
  unit: string;
  quantity: string; // Exact decimal string e.g. "150.50"
  ratePaisa: bigint;
  totalPaisa: bigint;
  sourceBoqRevision: number;
}

export interface AuthoritativeMilestoneProjection {
  milestoneId: string;
  name: string;
  targetDate: string;
  status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED';
  varianceDays: number;
  sourceScheduleRevision: number;
}

export interface DocumentProjectionPayload {
  documentId: string;
  documentType: 'LETTER' | 'REPORT' | 'SPECIFICATION' | 'PRESENTATION_DECK';
  title: string;
  projectName: string;
  financialFigures: AuthoritativeFinancialFigure[];
  boqItems: AuthoritativeBoQItemProjection[];
  milestones: AuthoritativeMilestoneProjection[];
  narrativeSections: Record<string, string>;
}

export interface DocumentProvenanceRecord {
  documentId: string;
  templateId: string;
  templateVersion: number;
  status: DocumentLifecycleStatus;
  createdAt: string;
  author: string;
  issuedAt?: string;
  authorizedSignatory?: string;
  snapshotHash: string;
  sourceEntitiesWatermark: {
    ledgerSeq: number;
    boqRevision: number;
    scheduleRevision: number;
  };
}

export class DocumentAuthorityGuard {
  /**
   * Asserts that financial numbers provided to documents are exact integer minor units
   * and do not perform client-side floating-point mutations.
   */
  public static validateFinancialFigure(figure: AuthoritativeFinancialFigure): void {
    if (typeof figure.amountPaisa !== 'bigint') {
      throw new DocumentAuthorityViolationError(
        `Field '${figure.fieldName}' must be represented as BigInt minor units (Paisa). Received: ${typeof figure.amountPaisa}`
      );
    }

    if (typeof (figure as any).clientCalculatedVat === 'number' || typeof (figure as any).discountPercent === 'number') {
      throw new DocumentAuthorityViolationError(
        `Financial deductions (VAT, discount) cannot be computed in presentation layer. Must originate from domain service.`
      );
    }

    if (!figure.sourceAccountCode || figure.sourceLedgerSeq <= 0) {
      throw new DocumentAuthorityViolationError(
        `Financial figure '${figure.fieldName}' lacks authoritative double-entry ledger provenance.`
      );
    }
  }

  /**
   * Asserts that BoQ quantities and rates match scaled integer arithmetic.
   */
  public static validateBoQItem(item: AuthoritativeBoQItemProjection): void {
    if (typeof item.ratePaisa !== 'bigint' || typeof item.totalPaisa !== 'bigint') {
      throw new DocumentAuthorityViolationError(
        `BoQ item ${item.itemNumber} rate and total must be BigInt minor units.`
      );
    }
    if (item.sourceBoqRevision <= 0) {
      throw new DocumentAuthorityViolationError(
        `BoQ item ${item.itemNumber} lacks valid sourceBoqRevision watermark.`
      );
    }
  }
}

export class DocumentDataFlowEngine {
  private documents = new Map<string, { payload: DocumentProjectionPayload; provenance: DocumentProvenanceRecord }>();

  /**
   * Creates a new document draft linked to live domain projections.
   */
  public createDraft(
    payload: DocumentProjectionPayload,
    templateId: string,
    templateVersion: number,
    author: string
  ): DocumentProvenanceRecord {
    // 1. Validate all financial inputs fail-closed
    for (const f of payload.financialFigures) {
      DocumentAuthorityGuard.validateFinancialFigure(f);
    }
    for (const b of payload.boqItems) {
      DocumentAuthorityGuard.validateBoQItem(b);
    }

    // 2. Compute cryptographic snapshot digest
    const snapshotHash = this.computeSnapshotHash(payload);

    const maxLedgerSeq = payload.financialFigures.reduce((max, f) => Math.max(max, f.sourceLedgerSeq), 0);
    const maxBoqRev = payload.boqItems.reduce((max, b) => Math.max(max, b.sourceBoqRevision), 0);
    const maxScheduleRev = payload.milestones.reduce((max, m) => Math.max(max, m.sourceScheduleRevision), 0);

    const provenance: DocumentProvenanceRecord = {
      documentId: payload.documentId,
      templateId,
      templateVersion,
      status: 'DRAFT',
      createdAt: new Date().toISOString(),
      author,
      snapshotHash,
      sourceEntitiesWatermark: {
        ledgerSeq: maxLedgerSeq,
        boqRevision: maxBoqRev,
        scheduleRevision: maxScheduleRev,
      },
    };

    this.documents.set(payload.documentId, { payload, provenance });
    return provenance;
  }

  /**
   * Updates a document draft with refreshed domain projections.
   * Fails closed if the document is already ISSUED.
   */
  public updateDraft(
    documentId: string,
    updatedPayload: DocumentProjectionPayload,
    author: string
  ): DocumentProvenanceRecord {
    const existing = this.documents.get(documentId);
    if (!existing) {
      throw new Error(`Document ${documentId} not found`);
    }

    if (existing.provenance.status === 'ISSUED') {
      throw new FrozenDocumentModificationError(documentId);
    }

    // Validate new payload
    for (const f of updatedPayload.financialFigures) {
      DocumentAuthorityGuard.validateFinancialFigure(f);
    }
    for (const b of updatedPayload.boqItems) {
      DocumentAuthorityGuard.validateBoQItem(b);
    }

    existing.payload = updatedPayload;
    existing.provenance.snapshotHash = this.computeSnapshotHash(updatedPayload);
    existing.provenance.author = author;

    return existing.provenance;
  }

  /**
   * Formally issues a document, freezing its template version, source data snapshot,
   * and signatory metadata permanently.
   */
  public issueDocument(documentId: string, authorizedSignatory: string): DocumentProvenanceRecord {
    const existing = this.documents.get(documentId);
    if (!existing) {
      throw new Error(`Document ${documentId} not found`);
    }

    if (existing.provenance.status === 'ISSUED') {
      throw new FrozenDocumentModificationError(documentId);
    }

    existing.provenance.status = 'ISSUED';
    existing.provenance.authorizedSignatory = authorizedSignatory;
    existing.provenance.issuedAt = new Date().toISOString();

    return existing.provenance;
  }

  public getDocument(documentId: string) {
    return this.documents.get(documentId);
  }

  /**
   * Verifies that the projected document figures exactly match authoritative figures
   * without rounding drift or discrepancies.
   */
  public verifyFidelity(
    documentId: string,
    authoritativeLedgerTotalPaisa: bigint,
    authoritativeBoqItemsCount: number
  ): boolean {
    const existing = this.documents.get(documentId);
    if (!existing) return false;

    const documentLedgerTotal = existing.payload.financialFigures.reduce(
      (sum, f) => sum + f.amountPaisa,
      0n
    );

    if (documentLedgerTotal !== authoritativeLedgerTotalPaisa) {
      return false;
    }

    if (existing.payload.boqItems.length !== authoritativeBoqItemsCount) {
      return false;
    }

    return true;
  }

  private computeSnapshotHash(payload: DocumentProjectionPayload): string {
    const serialized = JSON.stringify(payload, (key, value) => {
      if (typeof value === 'bigint') {
        return value.toString();
      }
      return value;
    });

    return createHash('sha256').update(serialized).digest('hex');
  }
}
