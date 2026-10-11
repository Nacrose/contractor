/**
 * Safe Browser Drafts/Queues Drain and Migration Tooling (M05-T07).
 *
 * Implements explicit export/import and safe draining of existing browser
 * storage systems:
 *   1. cm-field-outbox (IndexedDB v3: outbox, drafts, queries)
 *   2. cm-offline-v2 (IndexedDB v2 legacy queue)
 *
 * Invariants (v3 §6 M05 bullet 5):
 *   - Operation IDs and idempotency keys (clientUuid) preserved INTACT.
 *   - Server-side dedup treats migrated submissions identically to originals (no double-post).
 *   - No blanket IndexedDB deletion: per-store, per-record disposition
 *     (drained -> archived/removed only after server acknowledgment; pending -> retained).
 *   - Idempotent and resumable: re-running after process crash causes 0 loss and 0 duplicates.
 */

export type FieldWorkflowType =
  | "daily_report"
  | "attendance"
  | "expense"
  | "material_delivery";

export interface BrowserOutboxRecord {
  id: string;
  clientUuid: string;
  userId: string;
  tenantId?: string;
  type: FieldWorkflowType;
  status: "pending" | "syncing" | "synced" | "failed";
  payload: Record<string, unknown>;
  createdAt: number;
  updatedAt?: number;
  lastError?: string;
  receipt?: {
    serverSeq: number;
    id: string;
    deduplicated?: boolean;
  };
}

export interface BrowserDraftRecord {
  id: string;
  userId: string;
  type: FieldWorkflowType;
  payload: Record<string, unknown>;
  updatedAt: number;
}

export interface BrowserQueryRecord {
  hash: string;
  queryKey: string;
  data: unknown;
  savedAt: number;
}

export interface LegacyOfflineRecord {
  id: string;
  userId: string;
  url: string;
  method: string;
  body?: string;
  status: "queued" | "discarded" | "drained";
  createdAt: number;
}

export interface BrowserDrainBundle {
  version: "cm-field-drain-v1";
  exportedAt: string;
  summary: {
    outboxCount: number;
    draftsCount: number;
    queriesCount: number;
    legacyQueueCount: number;
  };
  outbox: BrowserOutboxRecord[];
  drafts: BrowserDraftRecord[];
  queries: BrowserQueryRecord[];
  legacyQueue: LegacyOfflineRecord[];
}

export type DispositionAction =
  | "acknowledged_and_archived"
  | "retained_pending"
  | "skipped_already_synced"
  | "converted_to_outbox"
  | "discarded_stale"
  | "legacy_mapped_and_drained";

export interface DrainDisposition {
  recordId: string;
  store: "outbox" | "drafts" | "queries" | "legacy_queue";
  action: DispositionAction;
  reason: string;
  serverReceipt?: {
    serverSeq: number;
    id: string;
    deduplicated?: boolean;
  };
}

/**
 * Storage contract representing IndexedDB browser databases.
 */
export interface BrowserStorageEngine {
  // cm-field-outbox (outbox store)
  getOutbox(): Promise<BrowserOutboxRecord[]>;
  updateOutboxStatus(
    id: string,
    status: BrowserOutboxRecord["status"],
    receipt?: BrowserOutboxRecord["receipt"]
  ): Promise<void>;
  deleteOutbox(id: string): Promise<void>;

  // cm-field-outbox (drafts store)
  getDrafts(): Promise<BrowserDraftRecord[]>;
  saveDraft(draft: BrowserDraftRecord): Promise<void>;
  deleteDraft(id: string): Promise<void>;

  // cm-field-outbox (queries store)
  getQueries(): Promise<BrowserQueryRecord[]>;
  deleteQuery(hash: string): Promise<void>;

  // cm-offline-v2 (queue store)
  getLegacyQueue(): Promise<LegacyOfflineRecord[]>;
  updateLegacyQueueStatus(id: string, status: LegacyOfflineRecord["status"]): Promise<void>;
}

/**
 * Server dispatch port for draining items through the authoritative adapter endpoints.
 */
export interface ServerDrainPort {
  dispatchAttendance(op: BrowserOutboxRecord): Promise<{ serverSeq: number; id: string; deduplicated?: boolean }>;
  dispatchSiteExpense(op: BrowserOutboxRecord): Promise<{ serverSeq: number; id: string; deduplicated?: boolean }>;
  dispatchMaterialDelivery(op: BrowserOutboxRecord): Promise<{ serverSeq: number; id: string; deduplicated?: boolean }>;
  dispatchDailyReport(op: BrowserOutboxRecord): Promise<{ serverSeq: number; id: string; deduplicated?: boolean }>;
}

/**
 * In-memory reference implementation of BrowserStorageEngine for test verification
 * and spec compliance.
 */
export class InMemoryBrowserStorageEngine implements BrowserStorageEngine {
  private outboxStore = new Map<string, BrowserOutboxRecord>();
  private draftsStore = new Map<string, BrowserDraftRecord>();
  private queriesStore = new Map<string, BrowserQueryRecord>();
  private legacyQueueStore = new Map<string, LegacyOfflineRecord>();

  constructor(initial?: {
    outbox?: BrowserOutboxRecord[];
    drafts?: BrowserDraftRecord[];
    queries?: BrowserQueryRecord[];
    legacyQueue?: LegacyOfflineRecord[];
  }) {
    if (initial?.outbox) {
      for (const item of initial.outbox) this.outboxStore.set(item.id, { ...item });
    }
    if (initial?.drafts) {
      for (const item of initial.drafts) this.draftsStore.set(item.id, { ...item });
    }
    if (initial?.queries) {
      for (const item of initial.queries) this.queriesStore.set(item.hash, { ...item });
    }
    if (initial?.legacyQueue) {
      for (const item of initial.legacyQueue) this.legacyQueueStore.set(item.id, { ...item });
    }
  }

  async getOutbox(): Promise<BrowserOutboxRecord[]> {
    return Array.from(this.outboxStore.values()).map((r) => ({ ...r }));
  }

  async updateOutboxStatus(
    id: string,
    status: BrowserOutboxRecord["status"],
    receipt?: BrowserOutboxRecord["receipt"]
  ): Promise<void> {
    const existing = this.outboxStore.get(id);
    if (!existing) return;
    this.outboxStore.set(id, {
      ...existing,
      status,
      receipt: receipt ?? existing.receipt,
      updatedAt: Date.now(),
    });
  }

  async deleteOutbox(id: string): Promise<void> {
    this.outboxStore.delete(id);
  }

  async getDrafts(): Promise<BrowserDraftRecord[]> {
    return Array.from(this.draftsStore.values()).map((r) => ({ ...r }));
  }

  async saveDraft(draft: BrowserDraftRecord): Promise<void> {
    this.draftsStore.set(draft.id, { ...draft });
  }

  async deleteDraft(id: string): Promise<void> {
    this.draftsStore.delete(id);
  }

  async getQueries(): Promise<BrowserQueryRecord[]> {
    return Array.from(this.queriesStore.values()).map((r) => ({ ...r }));
  }

  async deleteQuery(hash: string): Promise<void> {
    this.queriesStore.delete(hash);
  }

  async getLegacyQueue(): Promise<LegacyOfflineRecord[]> {
    return Array.from(this.legacyQueueStore.values()).map((r) => ({ ...r }));
  }

  async updateLegacyQueueStatus(id: string, status: LegacyOfflineRecord["status"]): Promise<void> {
    const existing = this.legacyQueueStore.get(id);
    if (!existing) return;
    this.legacyQueueStore.set(id, { ...existing, status });
  }
}

export interface DrainOptions {
  /** If set, simulate a hard crash/failure after acknowledging this many items. */
  crashAfterCount?: number;
  /** Max age in ms for retaining queries cache (default 7 days = 604800000 ms). */
  queryRetentionMs?: number;
  /** If true, delete outbox records after server acknowledgement; if false, retain with status='synced'. */
  purgeAcknowledgedOutbox?: boolean;
}

/**
 * The Browser Drain Engine coordinates safe migration from IndexedDB.
 */
export class BrowserDrainEngine {
  /**
   * Export complete browser state into a portable, versioned bundle.
   */
  static async exportBundle(store: BrowserStorageEngine): Promise<BrowserDrainBundle> {
    const outbox = await store.getOutbox();
    const drafts = await store.getDrafts();
    const queries = await store.getQueries();
    const legacyQueue = await store.getLegacyQueue();

    return {
      version: "cm-field-drain-v1",
      exportedAt: new Date().toISOString(),
      summary: {
        outboxCount: outbox.length,
        draftsCount: drafts.length,
        queriesCount: queries.length,
        legacyQueueCount: legacyQueue.length,
      },
      outbox,
      drafts,
      queries,
      legacyQueue,
    };
  }

  /**
   * Execute safe drain of all pending mutations to the server.
   *
   * Adheres strictly to the per-record disposition rule:
   *   - Acknowledged only after server receipt is received.
   *   - If an error or crash occurs, unacknowledged records remain pending in IndexedDB.
   *   - Re-running the drain replays safely because operationId / clientUuid are intact.
   */
  static async executeSafeDrain(
    store: BrowserStorageEngine,
    server: ServerDrainPort,
    options: DrainOptions = {}
  ): Promise<DrainDisposition[]> {
    const dispositions: DrainDisposition[] = [];
    const outboxItems = await store.getOutbox();
    let acknowledgedCount = 0;

    // 1. Process Outbox Store
    for (const item of outboxItems) {
      if (item.status === "synced") {
        dispositions.push({
          recordId: item.id,
          store: "outbox",
          action: "skipped_already_synced",
          reason: "Item was already synced in a prior session; skipping redundant dispatch",
          serverReceipt: item.receipt,
        });
        continue;
      }

      // Check simulated crash limit
      if (options.crashAfterCount !== undefined && acknowledgedCount >= options.crashAfterCount) {
        throw new Error(`[SimulatedCrash] Process crashed after acknowledging ${acknowledgedCount} items`);
      }

      try {
        let receipt: { serverSeq: number; id: string; deduplicated?: boolean };
        switch (item.type) {
          case "attendance":
            receipt = await server.dispatchAttendance(item);
            break;
          case "expense":
            receipt = await server.dispatchSiteExpense(item);
            break;
          case "material_delivery":
            receipt = await server.dispatchMaterialDelivery(item);
            break;
          case "daily_report":
            receipt = await server.dispatchDailyReport(item);
            break;
          default:
            throw new Error(`Unknown outbox workflow type: ${(item as any).type}`);
        }

        // Server acknowledged! Update state atomically per-record
        if (options.purgeAcknowledgedOutbox) {
          await store.deleteOutbox(item.id);
        } else {
          await store.updateOutboxStatus(item.id, "synced", receipt);
        }

        acknowledgedCount++;
        dispositions.push({
          recordId: item.id,
          store: "outbox",
          action: "acknowledged_and_archived",
          reason: receipt.deduplicated
            ? "Server recognized idempotent duplicate; acknowledged and archived"
            : "Server successfully accepted submission; acknowledged and archived",
          serverReceipt: receipt,
        });
      } catch (err: any) {
        // Unacknowledged! Keep in IndexedDB with pending status
        await store.updateOutboxStatus(item.id, "failed");
        dispositions.push({
          recordId: item.id,
          store: "outbox",
          action: "retained_pending",
          reason: `Dispatch failed: ${err.message || String(err)}; retained for retry`,
        });
      }
    }

    // 2. Process Drafts Store (Retained by default; zero wholesale deletion)
    const drafts = await store.getDrafts();
    for (const draft of drafts) {
      dispositions.push({
        recordId: draft.id,
        store: "drafts",
        action: "retained_pending",
        reason: "Draft form state retained intact in IndexedDB for user review or native client import",
      });
    }

    // 3. Process Queries Store (Prune stale read caches older than retention window)
    const queries = await store.getQueries();
    const maxAge = options.queryRetentionMs ?? 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    for (const q of queries) {
      if (now - q.savedAt > maxAge) {
        await store.deleteQuery(q.hash);
        dispositions.push({
          recordId: q.hash,
          store: "queries",
          action: "discarded_stale",
          reason: `Stale read cache entry (${Math.round((now - q.savedAt) / 86400000)} days old) evicted per LRU policy`,
        });
      } else {
        dispositions.push({
          recordId: q.hash,
          store: "queries",
          action: "retained_pending",
          reason: "Fresh read query snapshot retained until PWA decommission",
        });
      }
    }

    // 4. Process Legacy Queue Store (cm-offline-v2)
    const legacyQueue = await store.getLegacyQueue();
    for (const legacy of legacyQueue) {
      if (legacy.status === "drained") {
        dispositions.push({
          recordId: legacy.id,
          store: "legacy_queue",
          action: "skipped_already_synced",
          reason: "Legacy write already drained previously",
        });
        continue;
      }

      // Check if URL maps to a known field endpoint that can be translated
      const mapped = tryMapLegacyRecord(legacy);
      if (mapped) {
        try {
          const receipt = await server.dispatchSiteExpense(mapped);
          await store.updateLegacyQueueStatus(legacy.id, "drained");
          dispositions.push({
            recordId: legacy.id,
            store: "legacy_queue",
            action: "legacy_mapped_and_drained",
            reason: `Legacy endpoint ${legacy.url} translated to field envelope and drained`,
            serverReceipt: receipt,
          });
        } catch (err: any) {
          dispositions.push({
            recordId: legacy.id,
            store: "legacy_queue",
            action: "retained_pending",
            reason: `Legacy write translation failed to drain: ${err.message}; retained in queue`,
          });
        }
      } else {
        // Unknown or unsupported legacy write - retain safely, no blanket deletion!
        dispositions.push({
          recordId: legacy.id,
          store: "legacy_queue",
          action: "retained_pending",
          reason: "Legacy write lacks universal idempotency schema; retained for manual user inspection",
        });
      }
    }

    return dispositions;
  }

  /**
   * Summarizes the results of a drain run.
   */
  static summarize(dispositions: DrainDisposition[]) {
    return {
      total: dispositions.length,
      acknowledgedAndArchived: dispositions.filter((d) => d.action === "acknowledged_and_archived").length,
      retainedPending: dispositions.filter((d) => d.action === "retained_pending").length,
      skippedAlreadySynced: dispositions.filter((d) => d.action === "skipped_already_synced").length,
      discardedStale: dispositions.filter((d) => d.action === "discarded_stale").length,
      legacyMappedAndDrained: dispositions.filter((d) => d.action === "legacy_mapped_and_drained").length,
    };
  }
}

function tryMapLegacyRecord(legacy: LegacyOfflineRecord): BrowserOutboxRecord | null {
  if (legacy.url.includes("siteExpense.create") || legacy.url.includes("pettyCash.create")) {
    let parsedBody: Record<string, unknown> = {};
    try {
      if (legacy.body) parsedBody = JSON.parse(legacy.body);
    } catch {
      return null;
    }

    return {
      id: `legacy-${legacy.id}`,
      clientUuid: parsedBody.clientUuid ? String(parsedBody.clientUuid) : `legacy-uuid-${legacy.id}`,
      userId: legacy.userId,
      type: "expense",
      status: "pending",
      payload: parsedBody,
      createdAt: legacy.createdAt,
    };
  }
  return null;
}
