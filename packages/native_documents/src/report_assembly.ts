/**
 * Multi-Source Report & Technical Specification Assembly Pipeline (M12-T05).
 * Aggregates live project data from daily site logs (M04), BoQ/IPC measurements (M06),
 * material delivery receipts (M05), and TruePPM schedule milestones (M09).
 * Enforces cryptographic provenance chains, exact-unit financial projections,
 * and automated stale-data change detection.
 */

import { createHash } from 'node:crypto';
import {
  DocumentAuthorityGuard,
  AuthoritativeFinancialFigure,
  AuthoritativeBoQItemProjection,
  AuthoritativeMilestoneProjection,
  DocumentProvenanceRecord,
  DocumentAuthorityViolationError,
} from './authority_contract.js';
import {
  WordCraftHostAdapter,
  OpenXmlCorrespondencePackage,
} from './wordcraft_adapter.js';

// --- Source Entity Record Interfaces ---

export interface DailySiteLogRecord {
  logId: string;
  date: string;
  weather: 'CLEAR' | 'RAIN' | 'EXTREME_COLD' | 'HIGH_WIND';
  workActivities: string[];
  manpowerTotal: number;
  equipmentActive: string[];
  revision: number;
}

export interface BoQMeasurementRecord {
  sheetId: string;
  itemNumber: string;
  description: string;
  unit: string;
  previousQty: string;
  currentQty: string;
  cumulativeQty: string;
  ratePaisa: bigint;
  amountPaisa: bigint; // Exact minor integer units
  sourceLedgerSeq: number;
  sourceAccountCode: string;
  boqRevision: number;
}

export interface MaterialDeliveryReceiptRecord {
  receiptId: string;
  challanNumber: string;
  materialName: string;
  quantityDelivered: string;
  unit: string;
  supplier: string;
  qualityCertificateRef: string;
  deliveryDate: string;
  revision: number;
}

export interface ScheduleMilestoneRecord {
  milestoneId: string;
  name: string;
  baselineDate: string;
  forecastDate: string;
  varianceDays: number;
  completionPercent: number;
  criticalPath: boolean;
  scheduleRevision: number;
}

// --- Multi-Source Report Input Bundle ---

export interface MultiSourceReportInputBundle {
  reportId: string;
  reportType: 'MONTHLY_ENGINEERING_REPORT' | 'WEEKLY_PROGRESS_REPORT' | 'TECHNICAL_SPECIFICATION';
  title: string;
  projectName: string;
  contractNumber: string;
  clientName: string;
  contractorName: string;
  engineerName: string;
  reportingPeriod: {
    startDate: string;
    endDate: string;
  };
  siteLogs: DailySiteLogRecord[];
  boqMeasurements: BoQMeasurementRecord[];
  materialDeliveries: MaterialDeliveryReceiptRecord[];
  scheduleMilestones: ScheduleMilestoneRecord[];
  executiveSummary: string;
  author: string;
}

// --- Provenance & Staleness Tracking ---

export interface SourceEntityWatermark {
  entityType: 'SITE_LOG' | 'BOQ_MEASUREMENT' | 'MATERIAL_RECEIPT' | 'SCHEDULE_MILESTONE';
  entityId: string;
  revision: number;
  digest: string;
}

export interface ReportProvenanceChain {
  reportId: string;
  assembledAt: string;
  author: string;
  masterDigest: string;
  watermarks: SourceEntityWatermark[];
}

export interface StalenessAuditResult {
  isStale: boolean;
  staleSubsystems: Array<'SITE_LOGS' | 'BOQ' | 'MATERIALS' | 'SCHEDULE'>;
  changedEntities: Array<{
    entityType: string;
    entityId: string;
    snapshotRevision: number;
    currentRevision: number;
  }>;
  prompt: string;
}

export class MultiSourceReportAssemblyPipeline {
  private bundle: MultiSourceReportInputBundle;
  private provenanceChain: ReportProvenanceChain;

  constructor(bundle: MultiSourceReportInputBundle) {
    this.bundle = bundle;
    this.validateInputs();
    this.provenanceChain = this.computeProvenanceChain();
  }

  private validateInputs(): void {
    // Validate all financial figures across BoQ measurements
    for (const item of this.bundle.boqMeasurements) {
      if (typeof item.amountPaisa !== 'bigint' || typeof item.ratePaisa !== 'bigint') {
        throw new DocumentAuthorityViolationError(
          `BoQ item '${item.itemNumber}' amounts must be BigInt minor units (Paisa).`
        );
      }
      if (!item.sourceAccountCode || item.sourceLedgerSeq <= 0) {
        throw new DocumentAuthorityViolationError(
          `BoQ item '${item.itemNumber}' lacks valid double-entry ledger sequence provenance.`
        );
      }
    }
  }

  /**
   * Computes SHA-256 cryptographic digests for every entity in the bundle,
   * building an immutable provenance watermark chain.
   */
  public computeProvenanceChain(): ReportProvenanceChain {
    const watermarks: SourceEntityWatermark[] = [];

    for (const log of this.bundle.siteLogs) {
      const digest = createHash('sha256')
        .update(JSON.stringify({ id: log.logId, rev: log.revision, date: log.date, act: log.workActivities }))
        .digest('hex');
      watermarks.push({
        entityType: 'SITE_LOG',
        entityId: log.logId,
        revision: log.revision,
        digest,
      });
    }

    for (const boq of this.bundle.boqMeasurements) {
      const digest = createHash('sha256')
        .update(JSON.stringify({
          id: boq.sheetId,
          item: boq.itemNumber,
          rev: boq.boqRevision,
          amt: boq.amountPaisa.toString(),
          qty: boq.cumulativeQty,
        }))
        .digest('hex');
      watermarks.push({
        entityType: 'BOQ_MEASUREMENT',
        entityId: boq.sheetId,
        revision: boq.boqRevision,
        digest,
      });
    }

    for (const mat of this.bundle.materialDeliveries) {
      const digest = createHash('sha256')
        .update(JSON.stringify({ id: mat.receiptId, ch: mat.challanNumber, rev: mat.revision, qty: mat.quantityDelivered }))
        .digest('hex');
      watermarks.push({
        entityType: 'MATERIAL_RECEIPT',
        entityId: mat.receiptId,
        revision: mat.revision,
        digest,
      });
    }

    for (const ms of this.bundle.scheduleMilestones) {
      const digest = createHash('sha256')
        .update(JSON.stringify({ id: ms.milestoneId, rev: ms.scheduleRevision, fc: ms.forecastDate, v: ms.varianceDays }))
        .digest('hex');
      watermarks.push({
        entityType: 'SCHEDULE_MILESTONE',
        entityId: ms.milestoneId,
        revision: ms.scheduleRevision,
        digest,
      });
    }

    const masterDigest = createHash('sha256')
      .update(watermarks.map((w) => `${w.entityType}:${w.entityId}:${w.revision}:${w.digest}`).join('|'))
      .digest('hex');

    return {
      reportId: this.bundle.reportId,
      assembledAt: new Date().toISOString(),
      author: this.bundle.author,
      masterDigest,
      watermarks,
    };
  }

  public getProvenanceChain(): ReportProvenanceChain {
    return { ...this.provenanceChain, watermarks: [...this.provenanceChain.watermarks] };
  }

  /**
   * Audits the cached report snapshot against current live subsystem entities.
   * Prompts regeneration if underlying project records have changed.
   */
  public auditStaleness(liveCurrent: {
    siteLogs?: Array<{ logId: string; revision: number }>;
    boqMeasurements?: Array<{ sheetId: string; boqRevision: number }>;
    materialDeliveries?: Array<{ receiptId: string; revision: number }>;
    scheduleMilestones?: Array<{ milestoneId: string; scheduleRevision: number }>;
  }): StalenessAuditResult {
    const changedEntities: StalenessAuditResult['changedEntities'] = [];
    const staleSubsystems = new Set<'SITE_LOGS' | 'BOQ' | 'MATERIALS' | 'SCHEDULE'>();

    if (liveCurrent.siteLogs) {
      for (const cur of liveCurrent.siteLogs) {
        const snap = this.provenanceChain.watermarks.find(
          (w) => w.entityType === 'SITE_LOG' && w.entityId === cur.logId
        );
        if (snap && snap.revision !== cur.revision) {
          staleSubsystems.add('SITE_LOGS');
          changedEntities.push({
            entityType: 'SITE_LOG',
            entityId: cur.logId,
            snapshotRevision: snap.revision,
            currentRevision: cur.revision,
          });
        }
      }
    }

    if (liveCurrent.boqMeasurements) {
      for (const cur of liveCurrent.boqMeasurements) {
        const snap = this.provenanceChain.watermarks.find(
          (w) => w.entityType === 'BOQ_MEASUREMENT' && w.entityId === cur.sheetId
        );
        if (snap && snap.revision !== cur.boqRevision) {
          staleSubsystems.add('BOQ');
          changedEntities.push({
            entityType: 'BOQ_MEASUREMENT',
            entityId: cur.sheetId,
            snapshotRevision: snap.revision,
            currentRevision: cur.boqRevision,
          });
        }
      }
    }

    if (liveCurrent.materialDeliveries) {
      for (const cur of liveCurrent.materialDeliveries) {
        const snap = this.provenanceChain.watermarks.find(
          (w) => w.entityType === 'MATERIAL_RECEIPT' && w.entityId === cur.receiptId
        );
        if (snap && snap.revision !== cur.revision) {
          staleSubsystems.add('MATERIALS');
          changedEntities.push({
            entityType: 'MATERIAL_RECEIPT',
            entityId: cur.receiptId,
            snapshotRevision: snap.revision,
            currentRevision: cur.revision,
          });
        }
      }
    }

    if (liveCurrent.scheduleMilestones) {
      for (const cur of liveCurrent.scheduleMilestones) {
        const snap = this.provenanceChain.watermarks.find(
          (w) => w.entityType === 'SCHEDULE_MILESTONE' && w.entityId === cur.milestoneId
        );
        if (snap && snap.revision !== cur.scheduleRevision) {
          staleSubsystems.add('SCHEDULE');
          changedEntities.push({
            entityType: 'SCHEDULE_MILESTONE',
            entityId: cur.milestoneId,
            snapshotRevision: snap.revision,
            currentRevision: cur.scheduleRevision,
          });
        }
      }
    }

    const isStale = changedEntities.length > 0;
    const prompt = isStale
      ? `Stale Project Records Detected: ${changedEntities.length} entities in [${Array.from(staleSubsystems).join(', ')}] have updated since report assembly. Regenerate report to synchronize figures.`
      : 'Report is up to date with live project records.';

    return {
      isStale,
      staleSubsystems: Array.from(staleSubsystems),
      changedEntities,
      prompt,
    };
  }

  /**
   * Refreshes the bundle with updated records and recomputes the provenance chain.
   */
  public refreshWithLiveBundle(updatedBundle: MultiSourceReportInputBundle): void {
    this.bundle = updatedBundle;
    this.validateInputs();
    this.provenanceChain = this.computeProvenanceChain();
  }

  /**
   * Assembles a structured multi-section document into WordCraft host adapter,
   * compiling executive summaries, tabular project figures, and cryptographic provenance footers.
   */
  public assembleWordCraftDocument(): WordCraftHostAdapter {
    const adapter = new WordCraftHostAdapter({
      documentId: this.bundle.reportId,
      templateId: 'FIDIC_NOTICE_OF_CLAIM', // uses underlying host adapter engine
      author: this.bundle.author,
      initialMode: 'full_editor',
      metadata: {
        projectName: this.bundle.projectName,
        contractNumber: this.bundle.contractNumber,
        clientName: this.bundle.clientName,
        contractorName: this.bundle.contractorName,
        engineerName: this.bundle.engineerName,
        subject: this.bundle.title,
        referenceNumber: this.bundle.reportId,
      },
    });

    // 1. Financial Figures binding with double-entry provenance
    let totalCertifiedPaisa = 0n;
    for (const item of this.bundle.boqMeasurements) {
      totalCertifiedPaisa += item.amountPaisa;
      adapter.addFinancialFigure({
        fieldName: `boqItem_${item.itemNumber}`,
        amountPaisa: item.amountPaisa,
        formattedNepaliNpr: `NPR ${(Number(item.amountPaisa) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
        sourceLedgerSeq: item.sourceLedgerSeq,
        sourceAccountCode: item.sourceAccountCode,
      });
    }

    // 2. Tabular Section: Bill of Quantities / IPC Progress
    adapter.addTable({
      title: 'Section 1: Bill of Quantities (BoQ) Cumulative Certified Progress',
      headers: ['Item No', 'Description', 'Unit', 'Previous Qty', 'Current Qty', 'Cumulative Qty', 'Amount (NPR)'],
      rows: this.bundle.boqMeasurements.map((b) => [
        b.itemNumber,
        b.description,
        b.unit,
        b.previousQty,
        b.currentQty,
        b.cumulativeQty,
        (Number(b.amountPaisa) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 }),
      ]),
    });

    // 3. Tabular Section: TruePPM Milestone Schedules
    adapter.addTable({
      title: 'Section 2: Critical Path Milestone Schedule Status (TruePPM)',
      headers: ['Milestone ID', 'Milestone Name', 'Baseline Date', 'Forecast Date', 'Variance (Days)', 'Progress (%)', 'Critical'],
      rows: this.bundle.scheduleMilestones.map((s) => [
        s.milestoneId,
        s.name,
        s.baselineDate,
        s.forecastDate,
        s.varianceDays > 0 ? `+${s.varianceDays}` : `${s.varianceDays}`,
        `${s.completionPercent}%`,
        s.criticalPath ? 'YES' : 'NO',
      ]),
    });

    // 4. Tabular Section: Material Deliveries Intake (M05)
    adapter.addTable({
      title: 'Section 3: Verified Material Deliveries & Inward Challans',
      headers: ['Receipt Ref', 'Challan No', 'Material', 'Quantity', 'Unit', 'Supplier', 'Quality Cert'],
      rows: this.bundle.materialDeliveries.map((m) => [
        m.receiptId,
        m.challanNumber,
        m.materialName,
        m.quantityDelivered,
        m.unit,
        m.supplier,
        m.qualityCertificateRef,
      ]),
    });

    // 5. Tabular Section: Daily Site Logs Activity Rollup (M04)
    adapter.addTable({
      title: 'Section 4: Daily Site Operations & Deployment Rollup',
      headers: ['Log Date', 'Weather', 'Manpower', 'Key Activities', 'Active Plant / Equipment'],
      rows: this.bundle.siteLogs.map((l) => [
        l.date,
        l.weather,
        `${l.manpowerTotal} pax`,
        l.workActivities.join('; '),
        l.equipmentActive.join(', '),
      ]),
    });

    // 6. Cryptographic Provenance Traceability Table
    adapter.addTable({
      title: 'Appendix: Cryptographic Record Provenance & Integrity Chain',
      headers: ['Subsystem Source', 'Entity Identifier', 'Revision', 'SHA-256 Record Digest'],
      rows: this.provenanceChain.watermarks.map((w) => [
        w.entityType,
        w.entityId,
        `Rev ${w.revision}`,
        w.digest.substring(0, 16) + '...',
      ]),
    });

    return adapter;
  }

  /**
   * Exports compiled report to OpenXML (.docx) package with embedded provenance.
   */
  public exportReportDocx(): OpenXmlCorrespondencePackage {
    const adapter = this.assembleWordCraftDocument();
    return adapter.exportOpenXmlPackage();
  }
}
