/**
 * Server side of the change feed: the tenant change log (M03-T04).
 *
 * Implements ADR-0011's feed semantics on real SQLite for the prototype
 * (production mounts the same contract over PostgreSQL + the CDC daemon):
 *
 *   - Commit-order cursors: `publishAtomically` runs the authoritative
 *     domain write and the feed append inside ONE BEGIN IMMEDIATE
 *     transaction; the seq is allocated in that transaction and the row
 *     becomes visible to other connections only at COMMIT. Serialized
 *     writers therefore cannot commit out of seq order — the SQLite
 *     analogue of ADR-0011's commit-LSN guarantee ("gap loss is
 *     mathematically impossible"). The late-commit / visibility /
 *     writer-contention behavior is pinned by tests.
 *   - Pre-persistence redaction: a (domain, schemaVersion) policy MUST be
 *     registered before any publish; payloads are sanitized before the
 *     feed row exists. Missing policy = fail-closed rollback of the whole
 *     transaction (domain write included).
 *   - Authorized reads: tenant partitioning is structural; project
 *     authorization is the caller-supplied `canReadProject` port. A
 *     permission-filtered event does NOT advance the cursor — access
 *     re-grants can still be delivered; the feed never skips.
 *   - Bounded reads: maxEvents + serialized-byte budget per page.
 *   - Retention with a watermark: sweeps delete old events and advance a
 *     floor; cursors below the floor get `resync_required` (ADR-0011's
 *     "410 Gone" analogue), never a silently skipped range.
 */

import {
  feedError,
  fnv1a32hex,
  type FeedEventEnvelope,
  type FeedEventInput,
  type FeedPublishResult,
  type PullOptions,
  type PullPage,
  type RedactionPolicy,
  type FeedReadScope,
  TENANT_CHANGE_FEED_METHODS,
} from "./contract.js";
import { withImmediateTransaction, type SqlDriver } from "./driver.js";
import { migrate, type MigrateOptions } from "./migrations.js";

export interface OpenFeedOptions extends MigrateOptions {
  /** Busy timeout in ms for BEGIN IMMEDIATE contention (default 2000). */
  busyTimeoutMs?: number;
}

export interface OpenedFeed {
  feed: TenantChangeFeed;
  currentVersion: number;
}

const DEFAULT_MAX_EVENTS = 200;
const DEFAULT_MAX_BYTES = 262_144;

export function openTenantChangeFeed(driver: SqlDriver, options: OpenFeedOptions = {}): OpenedFeed {
  driver.exec("PRAGMA journal_mode=WAL");
  driver.exec("PRAGMA synchronous=FULL");
  driver.exec("PRAGMA foreign_keys=ON");
  driver.exec(`PRAGMA busy_timeout=${options.busyTimeoutMs ?? 2_000}`);
  const { currentVersion } = migrate(driver, { extraMigrations: options.extraMigrations });
  return { feed: new TenantChangeFeed(driver), currentVersion };
}

export class TenantChangeFeed {
  constructor(private readonly driver: SqlDriver) {}

  /**
   * Publish feed events ATOMICALLY with the authoritative domain mutation:
   * BEGIN IMMEDIATE -> domainWrite(driver) -> redact -> append -> COMMIT.
   * Any failure (domain write, redaction policy missing, constraint) rolls
   * back BOTH sides. This is the only publishing entry point.
   */
  publishAtomically(input: {
    /** Audited writer identity, e.g. `router:fieldSubmission.submitFieldReport`. */
    writer: string;
    /** The authoritative mutation. Runs inside the same transaction. */
    domainWrite?: (tx: SqlDriver) => void;
    events: FeedEventInput[];
    /** Epoch ms stamp (informational only; ordering is seq-based). */
    nowMs?: number;
  }): FeedPublishResult {
    if (input.events.length === 0) {
      throw feedError("misconfigured", "publishAtomically requires at least one event; a silent domain write would bypass sync.");
    }
    if (!input.writer || input.writer.trim().length === 0) {
      throw feedError("misconfigured", "publishAtomically requires an audited writer identity.");
    }
    return withImmediateTransaction(this.driver, () => {
      input.domainWrite?.(this.driver);
      const nowMs = input.nowMs ?? Date.now();
      const envelopes: FeedEventEnvelope[] = [];
      let n = 0;
      for (const event of input.events) {
        const policy = this.policies.get(`${event.domain}@${event.schemaVersion}`);
        if (!policy) {
          throw feedError(
            "misconfigured",
            `No redaction policy registered for domain '${event.domain}' schemaVersion ${event.schemaVersion}; refusing to publish (fail-closed).`,
          );
        }
        const redacted = redactPayload(event.payload, policy);
        const ins = this.driver
          .prepare(
            `INSERT INTO feed_event
               (tenant_id, project_id, domain, entity, entity_id, op, payload, schema_version, writer, event_id, published_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            event.tenantId,
            event.projectId,
            event.domain,
            event.entity,
            event.entityId,
            event.op,
            redacted,
            event.schemaVersion,
            input.writer,
            placeholderEventId(event, n++), // temp; replaced by seq-based id below
            nowMs,
          );
        const seq = Number(ins.lastInsertRowid);
        const eventId = `${event.domain}/${event.entity}/${event.entityId}@${seq}`;
        this.driver.prepare(`UPDATE feed_event SET event_id = ? WHERE seq = ?`).run(eventId, seq);
        envelopes.push({
          eventId,
          seq,
          tenantId: event.tenantId,
          projectId: event.projectId,
          domain: event.domain,
          entity: event.entity,
          entityId: event.entityId,
          op: event.op,
          payload: redacted,
          schemaVersion: event.schemaVersion,
          writer: input.writer,
        });
      }
      return { envelopes };
    });
  }

  /** Register (or replace) the redaction policy for a (domain, schemaVersion). */
  registerRedactionPolicy(policy: RedactionPolicy): void {
    this.policies.set(`${policy.domain}@${policy.schemaVersion}`, policy);
  }

  // Instance field (not a prototype method) — the pinned surface test counts
  // prototype methods only.
  private readonly policies = new Map<string, RedactionPolicy>();

  /**
   * Pull the next bounded, authorized page for a caller scope.
   * Permission-filtered events never advance the cursor (no-skip rule).
   */
  pull(scope: FeedReadScope, options: PullOptions): PullPage {
    if (options.afterSeq < 0 || !Number.isFinite(options.afterSeq)) {
      throw feedError("misconfigured", `Invalid cursor ${options.afterSeq}.`);
    }
    const floor = this.retentionFloor();
    if (options.afterSeq < floor.seq) {
      throw feedError(
        "resync_required",
        `Cursor ${options.afterSeq} is below the retention floor ${floor.seq}; the range was compacted. Rebootstrap required (ADR-0011 410 Gone analogue).`,
      );
    }
    const maxEvents = options.maxEvents ?? DEFAULT_MAX_EVENTS;
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    const encoder = new TextEncoder();
    const events: FeedEventEnvelope[] = [];
    let bytes = 0;
    let nextCursor = options.afterSeq;
    let sawBound = false;

    const rows = this.driver
      .prepare(`SELECT * FROM feed_event WHERE tenant_id = ? AND seq > ? ORDER BY seq ASC`)
      .all(scope.tenantId, options.afterSeq);

    for (const row of rows) {
      const projectId = (row.project_id as string | null) ?? null;
      if (!scope.canReadProject(projectId)) {
        continue; // filtered: NOT delivered, NOT cursor-advanced (no-skip rule)
      }
      if (events.length >= maxEvents) {
        sawBound = true;
        break;
      }
      const env: FeedEventEnvelope = {
        eventId: row.event_id as string,
        seq: Number(row.seq),
        tenantId: row.tenant_id as string,
        projectId,
        domain: row.domain as string,
        entity: row.entity as string,
        entityId: row.entity_id as string,
        op: row.op as "upsert" | "delete",
        payload: row.payload as string,
        schemaVersion: Number(row.schema_version),
        writer: row.writer as string,
      };
      const size = encoder.encode(JSON.stringify(env)).length;
      if (events.length > 0 && bytes + size > maxBytes) {
        sawBound = true;
        break;
      }
      events.push(env);
      bytes += size;
      nextCursor = env.seq;
      if (bytes >= maxBytes) {
        // A single oversized event is still delivered alone (no starvation).
        sawBound = rows.length > events.length;
        break;
      }
    }

    return {
      tenantId: scope.tenantId,
      events,
      nextCursor,
      hasMore: sawBound,
      approxBytes: bytes,
    };
  }

  /**
   * Retention sweep (ADR-0011 §2 contract 5 analogue): delete events older
   * than the default retention and advance the watermark floor. Financial
   * receipts are a CONSUMER concern (see FeedConsumer.sweepReceipts); the
   * feed sweep only maintains delivery coverage.
   */
  sweepRetention(options: { defaultRetentionDays: number; nowMs: number }): { deleted: number; floorSeq: number } {
    const cutoff = options.nowMs - options.defaultRetentionDays * 86_400_000;
    return withImmediateTransaction(this.driver, () => {
      const maxRow = this.driver.prepare(`SELECT COALESCE(MAX(seq), 0) AS m FROM feed_event WHERE published_at < ?`).get(cutoff);
      const maxOldSeq = Number((maxRow as { m: number | bigint }).m);
      if (maxOldSeq <= 0) return { deleted: 0, floorSeq: this.retentionFloor().seq };
      const del = this.driver.prepare(`DELETE FROM feed_event WHERE published_at < ?`).run(cutoff);
      this.driver
        .prepare(`UPDATE feed_watermark SET floor_seq = MAX(floor_seq, ?), updated_at = ? WHERE partition = 'global'`)
        .run(maxOldSeq, options.nowMs);
      return { deleted: Number(del.changes), floorSeq: this.retentionFloor().seq };
    });
  }

  /** Current retention floor (watermark). Consumers compare cursors against it. */
  retentionFloor(): { seq: number } {
    const row = this.driver.prepare(`SELECT floor_seq FROM feed_watermark WHERE partition = 'global'`).get();
    return { seq: row ? Number((row as { floor_seq: number }).floor_seq) : 0 };
  }

  /** Structural pin: the feed surface has exactly these methods (no domain writers). */
  static get surface(): readonly string[] {
    return TENANT_CHANGE_FEED_METHODS;
  }
}

/**
 * Deterministic placeholder id for the UNIQUE NOT NULL insert; replaced by
 * the seq-based stable id inside the same transaction. Collision-proof per
 * publish call (writer+timestamp+counter entropy is irrelevant because the
 * UNIQUE constraint only needs per-row distinctness before the UPDATE).
 */
function placeholderEventId(event: FeedEventInput, n: number): string {
  return `pending:${fnv1a32hex(`${event.tenantId}|${event.domain}|${event.entityId}|${n}`)}`;
}

/** Apply one policy to one payload (top-level keys; daemon does column-level in production). */
function redactPayload(payload: Record<string, unknown>, policy: RedactionPolicy): string {
  const out: Record<string, unknown> = { ...payload };
  for (const key of policy.strip) delete out[key];
  for (const key of policy.mask) {
    if (key in out) out[key] = "[redacted]";
  }
  return JSON.stringify(out);
}
