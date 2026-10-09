/**
 * Server side of snapshot bootstrap (M03-T05): bounded, deterministic,
 * consistent snapshots over injected sources.
 *
 * `openSnapshot` materializes rows and tombstones and reads the watermark
 * inside ONE BEGIN IMMEDIATE transaction — concurrent writes during
 * bootstrap cannot change what the pages will contain (materialized design,
 * pinned by test). `readPage` streams deterministic pages with a byte cap;
 * a single oversized row is delivered alone (feed precedent — no starvation).
 * `sweepSnapshots` enforces explicit retention: swept snapshots keep their
 * manifest row with state='swept' so stale client cursors surface typed
 * `resync_required` — the ADR-0011 "410 Gone" analogue — never a silent
 * range skip.
 */

import {
  RepositoryError,
  repositoryError,
  SNAPSHOT_SERVICE_METHODS,
  type OpenSnapshotInput,
  type SnapshotManifestInfo,
  type SnapshotPage,
  type SnapshotRow,
  type SnapshotSource,
} from "./contract.js";
import { SNAPSHOT_PRAGMAS, mapSqliteError, withImmediateTransaction, type SqlDriver } from "./driver.js";
import { migrate, type MigrateOptions } from "./migrations.js";

export interface OpenSnapshotServiceOptions extends MigrateOptions {
  busyTimeoutMs?: number;
}

export interface OpenedSnapshotService {
  service: SnapshotService;
  currentVersion: number;
}

export function openSnapshotService(driver: SqlDriver, options: OpenSnapshotServiceOptions = {}): OpenedSnapshotService {
  try {
    driver.exec(SNAPSHOT_PRAGMAS.journalMode);
    driver.exec(SNAPSHOT_PRAGMAS.synchronous);
    driver.exec(SNAPSHOT_PRAGMAS.foreignKeys);
    driver.exec(`PRAGMA busy_timeout=${Math.max(0, Math.floor(options.busyTimeoutMs ?? 2_000))}`);
  } catch (e) {
    throw e instanceof RepositoryError ? e : mapSqliteError(e);
  }
  const { currentVersion } = migrate(driver, { extraMigrations: options.extraMigrations });
  return { service: new SnapshotService(driver), currentVersion };
}

const DEFAULT_MAX_OBJECTS = 100_000;
const DEFAULT_MAX_BYTES = 262_144;
/** Fixed per-row envelope overhead (ord/domain/id/op columns + JSON framing). */
const PER_ROW_OVERHEAD = 64;

export class SnapshotService {
  constructor(private readonly driver: SqlDriver) {}

  /**
   * Materialize one consistent snapshot. Rows, tombstones and the watermark
   * are read and persisted inside one transaction; the materialized object
   * set is immutable afterwards. Bounded memory at open via `maxObjects`
   * (typed `misconfigured` over the cap — nothing persists).
   */
  openSnapshot(input: OpenSnapshotInput): SnapshotManifestInfo {
    if (!input.tenantId || typeof input.tenantId !== "string") {
      throw repositoryError("misconfigured", "tenantId is required.");
    }
    if (!Array.isArray(input.sources) || input.sources.length === 0) {
      throw repositoryError("misconfigured", "At least one SnapshotSource is required.");
    }
    const maxObjects = Math.max(1, Math.floor(input.maxObjects ?? DEFAULT_MAX_OBJECTS));
    const now = Date.now();
    const snapshotId = `snap_${now.toString(36)}_${Math.floor(Math.random() * 0xffffffff).toString(36)}`;

    return withImmediateTransaction(this.driver, () => {
      // Watermark INSIDE the same transaction as materialization (consistent
      // state + watermark — the acceptance line).
      const watermark = input.watermark.currentSeq(input.tenantId);
      if (!Number.isFinite(watermark) || watermark < 0) {
        throw repositoryError("misconfigured", `Watermark port returned an invalid seq (${watermark}).`);
      }

      // Deterministic materialization order: domain ASC, then entityId ASC,
      // then deletes after upserts for the same id (a scope-removed id that
      // also re-appears cannot exist, but the tiebreak keeps the order total).
      const sources = [...input.sources].sort((a, b) => (a.domain < b.domain ? -1 : a.domain > b.domain ? 1 : 0));
      const staged: Array<Omit<SnapshotRow, "ord">> = [];
      let tombstoneCount = 0;
      for (const source of sources) {
        if (!source.domain || typeof source.domain !== "string") {
          throw repositoryError("misconfigured", "SnapshotSource.domain must be a non-empty string.");
        }
        const rows = source.readRows(input.tenantId, input.projectId) ?? [];
        for (const r of rows) {
          if (!r.entityId || typeof r.payload !== "string") {
            throw repositoryError("misconfigured", `Source '${source.domain}' returned a malformed row (entityId/payload).`);
          }
          staged.push({ domain: source.domain, entityId: r.entityId, op: "upsert", payload: r.payload });
        }
        const tombstones = source.readTombstones(input.tenantId, input.projectId) ?? [];
        for (const id of tombstones) {
          if (!id || typeof id !== "string") {
            throw repositoryError("misconfigured", `Source '${source.domain}' returned a malformed tombstone id.`);
          }
          staged.push({ domain: source.domain, entityId: id, op: "delete", payload: null });
          tombstoneCount += 1;
        }
      }
      staged.sort((a, b) =>
        a.domain !== b.domain
          ? a.domain < b.domain
            ? -1
            : 1
          : a.entityId !== b.entityId
            ? a.entityId < b.entityId
              ? -1
              : 1
            : a.op === b.op
              ? 0
              : a.op === "upsert"
                ? -1
                : 1,
      );
      if (staged.length > maxObjects) {
        throw repositoryError("misconfigured", `Snapshot exceeds maxObjects=${maxObjects} (got ${staged.length}); refusing unbounded materialization.`, {
          maxObjects: String(maxObjects),
          actual: String(staged.length),
        });
      }

      this.driver
        .prepare(
          `INSERT INTO snapshot_manifest (snapshot_id, tenant_id, project_id, watermark, object_count, tombstone_count, state, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 'open', ?)`,
        )
        .run(snapshotId, input.tenantId, input.projectId, watermark, staged.length, tombstoneCount, now);
      const insert = this.driver.prepare(
        `INSERT INTO snapshot_object (snapshot_id, ord, domain, entity_id, op, payload) VALUES (?, ?, ?, ?, ?, ?)`,
      );
      for (let i = 0; i < staged.length; i++) {
        const s = staged[i];
        insert.run(snapshotId, i, s.domain, s.entityId, s.op, s.payload);
      }

      return {
        snapshotId,
        tenantId: input.tenantId,
        projectId: input.projectId,
        watermark,
        objectCount: staged.length,
        tombstoneCount,
        createdAtMs: now,
      };
    });
  }

  /**
   * Read one bounded, deterministic page after `afterOrd`. Page boundaries
   * are a pure function of the immutable object list and the byte cap, so
   * repeated reads (duplicate delivery) return identical pages.
   */
  readPage(snapshotId: string, afterOrd: number, options: { maxBytes?: number } = {}): SnapshotPage {
    if (!snapshotId || typeof snapshotId !== "string") {
      throw repositoryError("misconfigured", "snapshotId is required.");
    }
    if (!Number.isFinite(afterOrd) || afterOrd < -1) {
      throw repositoryError("misconfigured", `Invalid afterOrd ${afterOrd}.`);
    }
    const maxBytes = Math.max(PER_ROW_OVERHEAD + 1, Math.floor(options.maxBytes ?? DEFAULT_MAX_BYTES));

    const m = this.driver
      .prepare(
        `SELECT snapshot_id, tenant_id, project_id, watermark, object_count, tombstone_count, state, created_at
         FROM snapshot_manifest WHERE snapshot_id = ?`,
      )
      .get(snapshotId) as Record<string, unknown> | undefined;
    if (!m) {
      // Unknown snapshot id = invalid/expired cursor: typed rebootstrap signal.
      throw repositoryError("resync_required", `Snapshot '${snapshotId}' is unknown; a rebootstrap is required.`, { snapshotId });
    }
    if (m.state === "swept") {
      throw repositoryError("resync_required", `Snapshot '${snapshotId}' has been swept (retention); a rebootstrap is required.`, { snapshotId });
    }

    const rows = this.driver
      .prepare(
        `SELECT ord, domain, entity_id, op, payload FROM snapshot_object
         WHERE snapshot_id = ? AND ord >= ? ORDER BY ord ASC`,
      )
      .all(snapshotId, afterOrd) as Array<Record<string, unknown>>;

    const page: SnapshotRow[] = [];
    let bytes = 0;
    let last = afterOrd;
    for (const r of rows) {
      const payload = r.payload === null || r.payload === undefined ? null : String(r.payload);
      const rowBytes = PER_ROW_OVERHEAD + String(r.entity_id).length + String(r.domain).length + (payload?.length ?? 0);
      if (page.length > 0 && bytes + rowBytes > maxBytes) break;
      page.push({ ord: Number(r.ord), domain: String(r.domain), entityId: String(r.entity_id), op: String(r.op) as "upsert" | "delete", payload });
      bytes += rowBytes;
      last = Number(r.ord);
    }
    const nextAfterOrd = page.length === 0 ? afterOrd : last + 1;
    return {
      snapshotId,
      tenantId: String(m.tenant_id),
      projectId: m.project_id === null || m.project_id === undefined ? null : String(m.project_id),
      watermark: Number(m.watermark),
      firstOrd: page.length === 0 ? -1 : page[0].ord,
      rows: page,
      nextAfterOrd,
      hasMore: page.length === 0 ? false : nextAfterOrd <= Number(m.object_count) - 1,
      approxBytes: bytes,
    };
  }

  /** Manifest info for a snapshot (server-side completeness gate input). */
  manifestInfo(snapshotId: string): SnapshotManifestInfo {
    const m = this.driver
      .prepare(
        `SELECT snapshot_id, tenant_id, project_id, watermark, object_count, tombstone_count, state, created_at
         FROM snapshot_manifest WHERE snapshot_id = ?`,
      )
      .get(snapshotId) as Record<string, unknown> | undefined;
    if (!m) {
      throw repositoryError("not_found", `Snapshot '${snapshotId}' does not exist.`, { snapshotId });
    }
    return {
      snapshotId: String(m.snapshot_id),
      tenantId: String(m.tenant_id),
      projectId: m.project_id === null || m.project_id === undefined ? null : String(m.project_id),
      watermark: Number(m.watermark),
      objectCount: Number(m.object_count),
      tombstoneCount: Number(m.tombstone_count),
      createdAtMs: Number(m.created_at),
    };
  }

  /**
   * Explicit snapshot retention. Objects of expired snapshots are deleted;
   * manifests remain as state='swept' tombstones so cursors into them get
   * typed `resync_required`. Only snapshots past the age cutoff are swept —
   * the open snapshot a device is currently consuming stays untouched unless
   * it too is past the cutoff (retention is the server's explicit policy;
   * clients recover via rebootstrap).
   */
  sweepSnapshots(options: { olderThanMs: number; nowMs: number }): { swept: number } {
    if (!Number.isFinite(options.olderThanMs) || options.olderThanMs < 0) {
      throw repositoryError("misconfigured", "olderThanMs must be a non-negative number.");
    }
    return withImmediateTransaction(this.driver, () => {
      const cutoff = options.nowMs - options.olderThanMs;
      const swept = this.driver
        .prepare(`UPDATE snapshot_manifest SET state = 'swept' WHERE state = 'open' AND created_at <= ?`)
        .run(cutoff);
      this.driver
        .prepare(
          `DELETE FROM snapshot_object WHERE snapshot_id IN (SELECT snapshot_id FROM snapshot_manifest WHERE state = 'swept')`,
        )
        .run();
      return { swept: Number(swept.changes) };
    });
  }

  /** Structural pin: the service surface has exactly these methods (no domain writers). */
  static get surface(): readonly string[] {
    return SNAPSHOT_SERVICE_METHODS;
  }
}

export type { SnapshotSource };
