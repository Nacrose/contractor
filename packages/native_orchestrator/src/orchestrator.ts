/**
 * Client orchestrator (M03-T07) — the drain policy above the outbox.
 *
 * A drain pass:
 *   1. recovers lost acknowledgements (in-flight ops are requeued — the
 *      server's op-id ledger makes the replay idempotent),
 *   2. walks the due batch oldest-first and dispatches only ops whose
 *      `dependsOnOpIds` are ALL accepted (prerequisites are never
 *      overtaken; a terminally failed prerequisite marks the dependent
 *      dependency_blocked),
 *   3. dispatches one envelope per op through the transport — network
 *      throws map to bounded FULL-jitter retry backoff; typed outcomes
 *      land per the v3 §5.3 table,
 *   4. never deletes pending work: the only terminal states are accepted,
 *      rejected, and dependency_blocked (all preserving the record).
 *
 * Foreground drains always run (no OS scheduler needed). Background drains
 * consult the ExecutionEnvironmentPort first and skip cleanly when
 * constraints are unmet. Push hints (`hintAvailable`) only START a drain —
 * they coalesce while a drain is running, cannot fabricate outcomes, and
 * cannot bypass backoff accounting (due-time is still honored).
 */

import {
  AuthEventSink,
  DigestPort,
  ExecutionEnvironmentPort,
  ORCHESTRATION_POLICY,
  PendingOperationSource,
  RandomPort,
  SyncOutcome,
  SyncTransportPort,
} from "./contract.js";
import { buildEnvelope } from "./envelope.js";

export interface OrchestratorOptions {
  source: PendingOperationSource;
  transport: SyncTransportPort;
  digest: DigestPort;
  random: RandomPort;
  now?: () => number;
  /** Which opIds are locally accepted (dependency gate input). */
  isAccepted?: (accountId: string, opId: string) => boolean;
  authEvents?: AuthEventSink;
  environment?: ExecutionEnvironmentPort;
  /** Device identity for envelopes (M03-T02 registration id). */
  deviceId: string;
  maxAttempts?: number;
  backoffBaseMs?: number;
  backoffCapMs?: number;
  /** Batch cap per drain pass. */
  batchLimit?: number;
}

export interface DrainResult {
  dispatched: string[];
  accepted: string[];
  previouslyAccepted: string[];
  conflicts: string[];
  rejected: string[];
  blocked: string[];
  retrying: string[];
  skippedForDependencies: string[];
  stoppedFor: "revoked" | "authentication_required" | null;
}

export class Orchestrator {
  private readonly source: PendingOperationSource;
  private readonly transport: SyncTransportPort;
  private readonly digest: DigestPort;
  private readonly random: RandomPort;
  private readonly now: () => number;
  private readonly isAccepted: (accountId: string, opId: string) => boolean;
  private readonly authEvents: AuthEventSink | null;
  private readonly environment: ExecutionEnvironmentPort | null;
  readonly deviceId: string;
  private readonly maxAttempts: number;
  private readonly backoffBaseMs: number;
  private readonly backoffCapMs: number;
  private readonly batchLimit: number;
  private draining = false;

  constructor(options: OrchestratorOptions) {
    for (const [name, port] of [["source", options.source], ["transport", options.transport], ["digest", options.digest], ["random", options.random]] as const) {
      if (!port) throw new Error(`missing required orchestrator port: ${name}`);
    }
    if (!options.digest || options.digest.algorithm !== "sha-256") {
      throw new Error("orchestrator requires a real sha-256 DigestPort");
    }
    if (!options.deviceId) throw new Error("orchestrator requires the device identity");
    this.source = options.source;
    this.transport = options.transport;
    this.digest = options.digest;
    this.random = options.random;
    this.now = options.now ?? Date.now;
    this.isAccepted = options.isAccepted ?? ((_a, _o) => false);
    this.authEvents = options.authEvents ?? null;
    this.environment = options.environment ?? null;
    this.deviceId = options.deviceId;
    this.maxAttempts = options.maxAttempts ?? ORCHESTRATION_POLICY.maxAttempts;
    this.backoffBaseMs = options.backoffBaseMs ?? ORCHESTRATION_POLICY.backoffBaseMs;
    this.backoffCapMs = options.backoffCapMs ?? ORCHESTRATION_POLICY.backoffCapMs;
    this.batchLimit = options.batchLimit ?? 32;
  }

  /** FULL jitter: delay = random() * min(cap, base * 2^attempt). */
  private jitterDelayMs(attempt: number): number {
    const ceiling = Math.min(this.backoffCapMs, this.backoffBaseMs * 2 ** attempt);
    return Math.floor(this.random.next() * ceiling);
  }

  private emptyResult(): DrainResult {
    return { dispatched: [], accepted: [], previouslyAccepted: [], conflicts: [], rejected: [], blocked: [], retrying: [], skippedForDependencies: [], stoppedFor: null };
  }

  /**
   * Lost-ack recovery: ops left `in_flight` by a crash/network death are
   * requeued for replay. The server ledger dedupes; nothing is lost or
   * double-applied.
   */
  private recoverInFlight(accountId: string): void {
    for (const op of this.source.listInFlight(accountId)) {
      this.source.requeue(op.opId, null);
    }
  }

  /**
   * One foreground/background drain pass over the account's due batch.
   * Single-flight per orchestrator instance; hints coalesce onto the
   * running pass. Never throws wholesale — per-op failures become outcomes.
   */
  drain(accountId: string, options: { background?: boolean } = {}): DrainResult {
    const result = this.emptyResult();
    if (this.draining) return result; // coalesced: a running pass owns the queue
    if (options.background && this.environment) {
      const env = this.environment.suitableForBackgroundSync();
      if (!env.ok) return result; // constraints unmet — pending work untouched
    }
    this.draining = true;
    try {
      this.recoverInFlight(accountId);
      const due = this.source.listDue(accountId, this.now()).slice(0, this.batchLimit);
      for (const op of due) {
        if (result.stoppedFor) break; // auth stop: stop dispatching immediately
        if (op.state !== "pending") continue;
        // Bounded retries: an op that exhausted its attempt budget is
        // SUSPENDED — it stays pending (never dropped) but is no longer
        // auto-dispatched; the app's manual-retry surface takes over.
        if (op.attempts >= this.maxAttempts) continue;

        // Dependency gate: prerequisites are never overtaken.
        let blockedByFailure = false;
        let waitingOnPending = false;
        for (const dep of op.dependsOnOpIds) {
          if (this.isAccepted(accountId, dep)) continue;
          const depRec = this.source.getOp(accountId, dep);
          if (!depRec || depRec.state === "rejected" || depRec.state === "blocked" || depRec.state === "conflict") {
            blockedByFailure = true; // a failed prerequisite fails the chain terminally
          } else {
            waitingOnPending = true; // pending/in_flight prerequisite: NEVER overtake
          }
        }
        if (blockedByFailure) {
          this.source.markBlocked(op.opId, "prerequisite failed terminally");
          result.blocked.push(op.opId);
          continue;
        }
        if (waitingOnPending) {
          result.skippedForDependencies.push(op.opId);
          continue;
        }

        // Dispatch: markInFlight increments the attempt counter; the
        // envelope carries the updated count.
        const inFlight = this.source.markInFlight(op.opId);
        const envelope = buildEnvelope({
          opId: op.opId,
          deviceId: this.deviceId,
          accountId: op.accountId,
          kind: op.kind,
          scopeClaims: {
            tenantId: op.tenantId ?? op.accountId,
            projectId: op.projectId,
            role: op.role ?? "member",
          },
          payload: op.payload,
          dependsOnOpIds: op.dependsOnOpIds,
          attempt: inFlight.attempts,
          nowMs: this.now(),
          digest: this.digest,
        });
        result.dispatched.push(op.opId);

        let outcome: SyncOutcome;
        try {
          outcome = this.transport.send(envelope);
        } catch {
          // Network death → retryable with bounded FULL-jitter backoff.
          if (inFlight.attempts >= this.maxAttempts) {
            this.source.requeue(op.opId, null); // stays pending; manual retry surfaces
            result.retrying.push(op.opId);
            continue;
          }
          this.source.requeue(op.opId, this.now() + this.jitterDelayMs(inFlight.attempts));
          result.retrying.push(op.opId);
          continue;
        }

        switch (outcome.kind) {
          case "accepted": {
            this.source.recordAccepted(op.opId, outcome.receipt ?? `rcp-${op.opId}`, outcome.serverSeq);
            result.accepted.push(op.opId);
            break;
          }
          case "previously_accepted": {
            // Lost-ack replay: the ORIGINAL receipt is recorded once.
            this.source.recordAccepted(op.opId, outcome.receipt ?? `rcp-${op.opId}`, outcome.serverSeq);
            result.previouslyAccepted.push(op.opId);
            break;
          }
          case "conflict": {
            this.source.markConflict(op.opId, outcome.detail ?? "conflict");
            result.conflicts.push(op.opId);
            break;
          }
          case "rejected": {
            this.source.recordRejected(op.opId, outcome.detail ?? "rejected");
            result.rejected.push(op.opId);
            break;
          }
          case "revoked":
          case "authentication_required": {
            // Auth lifecycle: STOP dispatching; pending work is preserved.
            this.authEvents?.onAuthEvent(outcome.kind, op.opId);
            this.source.requeue(op.opId, null);
            result.stoppedFor = outcome.kind;
            break;
          }
          case "dependency_blocked": {
            // Server disagrees with local dependency view — trust the server.
            this.source.markBlocked(op.opId, outcome.detail ?? "dependency blocked server-side");
            result.blocked.push(op.opId);
            break;
          }
          case "retryable": {
            const delay = outcome.retryAfterMs ?? this.jitterDelayMs(inFlight.attempts);
            this.source.requeue(op.opId, inFlight.attempts >= this.maxAttempts ? null : this.now() + delay);
            result.retrying.push(op.opId);
            break;
          }
        }
      }
      return result;
    } finally {
      this.draining = false;
    }
  }

  /**
   * Push-notification hint: may START a drain, nothing more. While a drain
   * runs, hints coalesce (no re-entrancy). Returns null when coalesced.
   */
  hintAvailable(accountId: string): DrainResult | null {
    if (this.draining) return null;
    return this.drain(accountId);
  }

  /**
   * Background attempt: same policy as foreground PLUS the execution
   * environment gate. Foreground sync never requires this to have run.
   */
  drainInBackground(accountId: string): DrainResult {
    return this.drain(accountId, { background: true });
  }
}
