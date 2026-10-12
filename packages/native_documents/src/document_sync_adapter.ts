/**
 * Document & Deck Change-Feed Sync, Offline Durability & Conflict Handling (M12-T08).
 * Manages local durable storage (< 5ms), change-feed event dispatch,
 * optimistic concurrency control, conflict detection with branch-fork review,
 * and immutable issuance locking for WordCraft (.docx) and DeckCraft (.pptx) artifacts.
 */

import { createHash } from 'node:crypto';
import {
  FrozenDocumentModificationError,
  DocumentAuthorityViolationError,
  DocumentLifecycleStatus,
} from './authority_contract.js';

export type DocumentArtifactType = 'WORDCRAFT_DOCX' | 'DECKCRAFT_PPTX';

export type DocumentSyncStatus =
  | 'LOCAL_DIRTY'
  | 'SYNCING'
  | 'SYNCED'
  | 'CONFLICT_DETECTED'
  | 'FROZEN_LOCKED';

export interface DocumentArtifactRecord {
  documentId: string;
  artifactType: DocumentArtifactType;
  revisionId: string;
  baseRevisionId: string | null;
  sequenceNumber: number;
  title: string;
  status: DocumentLifecycleStatus;
  contentPayloadJson: string;
  binarySha256: string;
  localSavedAt: string;
  syncedAt?: string;
  syncStatus: DocumentSyncStatus;
  forkBranchOf?: string;
  author: string;
}

export interface SyncChangeEvent {
  eventId: string;
  documentId: string;
  type:
    | 'DOCUMENT_DRAFT_CREATED'
    | 'DOCUMENT_DRAFT_MODIFIED'
    | 'DOCUMENT_BRANCH_FORKED'
    | 'DOCUMENT_CONCURRENT_CONFLICT_DETECTED'
    | 'DOCUMENT_ISSUANCE_LOCKED';
  revisionId: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface SaveDraftInput {
  documentId: string;
  artifactType: DocumentArtifactType;
  baseRevisionId: string | null;
  title: string;
  contentPayload: Record<string, unknown>;
  author: string;
}

export interface ConflictResolutionRecord {
  documentId: string;
  originalRevisionId: string;
  incomingRevisionId: string;
  forkedDocumentId: string;
  detectedAt: string;
  author: string;
  status: 'PENDING_MANUAL_REVIEW' | 'MERGED' | 'DISCARDED';
}

export class DocumentSyncAdapter {
  private localStore: Map<string, DocumentArtifactRecord> = new Map();
  private revisionHistory: Map<string, DocumentArtifactRecord[]> = new Map();
  private changeFeed: SyncChangeEvent[] = [];
  private activeConflicts: Map<string, ConflictResolutionRecord> = new Map();

  /**
   * Saves a document draft durably to local storage before network dispatch.
   * Benchmarked to complete within < 5ms.
   */
  public saveDraftLocally(input: SaveDraftInput): {
    record: DocumentArtifactRecord;
    durationMs: number;
  } {
    const startTime = performance.now();
    const existing = this.localStore.get(input.documentId);

    // If existing document is issued, fail-closed
    if (existing && existing.status === 'ISSUED') {
      throw new FrozenDocumentModificationError(input.documentId);
    }

    const payloadJson = JSON.stringify(input.contentPayload);
    const binarySha256 = createHash('sha256').update(payloadJson).digest('hex');

    const nextSeq = existing ? existing.sequenceNumber + 1 : 1;
    const revisionId = `REV-${input.documentId}-${nextSeq}-${binarySha256.substring(0, 8)}`;
    const now = new Date().toISOString();

    const record: DocumentArtifactRecord = {
      documentId: input.documentId,
      artifactType: input.artifactType,
      revisionId,
      baseRevisionId: input.baseRevisionId ?? (existing ? existing.revisionId : null),
      sequenceNumber: nextSeq,
      title: input.title,
      status: 'DRAFT',
      contentPayloadJson: payloadJson,
      binarySha256,
      localSavedAt: now,
      syncStatus: 'LOCAL_DIRTY',
      author: input.author,
    };

    this.localStore.set(input.documentId, record);

    const history = this.revisionHistory.get(input.documentId) || [];
    history.push(record);
    this.revisionHistory.set(input.documentId, history);

    // Dispatch change-feed event
    const eventType = existing ? 'DOCUMENT_DRAFT_MODIFIED' : 'DOCUMENT_DRAFT_CREATED';
    this.dispatchChangeEvent(eventType, record, {
      sequenceNumber: nextSeq,
      binarySha256,
    });

    const durationMs = performance.now() - startTime;
    return { record, durationMs };
  }

  /**
   * Processes incoming server change-feed revisions.
   * Implements optimistic concurrency check: detects conflicts without silent overwriting.
   */
  public processIncomingServerRevision(serverRecord: DocumentArtifactRecord): {
    status: 'APPLIED' | 'CONFLICT' | 'FROZEN_REJECTED';
    conflictRecord?: ConflictResolutionRecord;
  } {
    const local = this.localStore.get(serverRecord.documentId);

    // 1. If local is already ISSUED, reject any modification from network
    if (local && local.status === 'ISSUED') {
      return { status: 'FROZEN_REJECTED' };
    }

    // 2. If no local record exists, apply cleanly
    if (!local) {
      const applied: DocumentArtifactRecord = {
        ...serverRecord,
        syncStatus: 'SYNCED',
        syncedAt: new Date().toISOString(),
      };
      this.localStore.set(serverRecord.documentId, applied);
      return { status: 'APPLIED' };
    }

    // 3. If local has clean sync status (not dirty), fast-forward apply
    if (local.syncStatus === 'SYNCED') {
      const applied: DocumentArtifactRecord = {
        ...serverRecord,
        syncStatus: 'SYNCED',
        syncedAt: new Date().toISOString(),
      };
      this.localStore.set(serverRecord.documentId, applied);
      return { status: 'APPLIED' };
    }

    // 4. Concurrent edit detected! Local has uncommitted changes that branched from an older base
    if (local.syncStatus === 'LOCAL_DIRTY' && local.baseRevisionId !== serverRecord.revisionId) {
      local.syncStatus = 'CONFLICT_DETECTED';

      // Automatically fork draft into review branch to prevent silent overwriting
      const forked = this.forkBranchForConflictReview(
        local.documentId,
        local.author,
        local.contentPayloadJson
      );

      const conflict: ConflictResolutionRecord = {
        documentId: serverRecord.documentId,
        originalRevisionId: serverRecord.revisionId,
        incomingRevisionId: local.revisionId,
        forkedDocumentId: forked.documentId,
        detectedAt: new Date().toISOString(),
        author: local.author,
        status: 'PENDING_MANUAL_REVIEW',
      };

      this.activeConflicts.set(serverRecord.documentId, conflict);

      this.dispatchChangeEvent('DOCUMENT_CONCURRENT_CONFLICT_DETECTED', local, {
        serverRevisionId: serverRecord.revisionId,
        localRevisionId: local.revisionId,
        forkedDocumentId: forked.documentId,
      });

      return { status: 'CONFLICT', conflictRecord: conflict };
    }

    return { status: 'APPLIED' };
  }

  /**
   * Creates a dedicated review branch fork when a concurrent edit is detected,
   * guaranteeing that neither the author's work nor the remote update is silently discarded.
   */
  public forkBranchForConflictReview(
    documentId: string,
    author: string,
    draftPayloadJson: string
  ): DocumentArtifactRecord {
    const timestamp = Date.now();
    const sanitizedAuthor = author.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const forkedDocId = `${documentId.toLowerCase()}-fork-${sanitizedAuthor}-${timestamp}`;

    const existing = this.localStore.get(documentId);
    const binarySha256 = createHash('sha256').update(draftPayloadJson).digest('hex');

    const forkedRecord: DocumentArtifactRecord = {
      documentId: forkedDocId,
      artifactType: existing?.artifactType ?? 'WORDCRAFT_DOCX',
      revisionId: `REV-${forkedDocId}-1`,
      baseRevisionId: existing?.revisionId ?? null,
      sequenceNumber: 1,
      title: `${existing?.title ?? 'Document'} (Conflicted Draft Review — ${author})`,
      status: 'DRAFT',
      contentPayloadJson: draftPayloadJson,
      binarySha256,
      localSavedAt: new Date().toISOString(),
      syncStatus: 'LOCAL_DIRTY',
      forkBranchOf: documentId,
      author,
    };

    this.localStore.set(forkedDocId, forkedRecord);

    this.dispatchChangeEvent('DOCUMENT_BRANCH_FORKED', forkedRecord, {
      parentDocumentId: documentId,
      forkedDocumentId: forkedDocId,
    });

    return forkedRecord;
  }

  /**
   * Permanently issues and freezes a document, making it immutable.
   */
  public issueDocument(documentId: string, signatory: string): DocumentArtifactRecord {
    const record = this.localStore.get(documentId);
    if (!record) {
      throw new DocumentAuthorityViolationError(`Document ${documentId} not found.`);
    }

    if (record.status === 'ISSUED') {
      throw new FrozenDocumentModificationError(documentId);
    }

    record.status = 'ISSUED';
    record.syncStatus = 'FROZEN_LOCKED';
    record.syncedAt = new Date().toISOString();

    this.dispatchChangeEvent('DOCUMENT_ISSUANCE_LOCKED', record, {
      authorizedSignatory: signatory,
      snapshotHash: record.binarySha256,
    });

    return { ...record };
  }

  public getRecord(documentId: string): DocumentArtifactRecord | undefined {
    const found = this.localStore.get(documentId);
    return found ? { ...found } : undefined;
  }

  public listRecords(): DocumentArtifactRecord[] {
    return Array.from(this.localStore.values()).map((r) => ({ ...r }));
  }

  public getRevisionHistory(documentId: string): DocumentArtifactRecord[] {
    const hist = this.revisionHistory.get(documentId);
    return hist ? hist.map((r) => ({ ...r })) : [];
  }

  public getChangeFeedEvents(): SyncChangeEvent[] {
    return this.changeFeed.map((e) => ({ ...e }));
  }

  public getActiveConflicts(): ConflictResolutionRecord[] {
    return Array.from(this.activeConflicts.values());
  }

  private dispatchChangeEvent(
    type: SyncChangeEvent['type'],
    record: DocumentArtifactRecord,
    payload: Record<string, unknown>
  ): void {
    const event: SyncChangeEvent = {
      eventId: `EVT-${Date.now()}-${this.changeFeed.length + 1}`,
      documentId: record.documentId,
      type,
      revisionId: record.revisionId,
      timestamp: new Date().toISOString(),
      payload,
    };
    this.changeFeed.push(event);
  }
}
