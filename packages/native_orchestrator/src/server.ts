/**
 * Server-side sync service (M03-T07) — the authoritative half of the
 * command path: validate envelope, REVALIDATE claims, answer duplicates
 * from the op-id ledger, apply through the domain port, emit exactly the
 * eight typed outcomes.
 *
 * Order matters and is tested:
 *   1. structural + digest validation (tampered payload → rejected)
 *   2. authority revalidation (stale/revoked claims → revoked /
 *      authentication_required — regardless of what the client claimed)
 *   3. op-id ledger (duplicate delivery → previously_accepted, same receipt
 *      — the idempotency boundary that makes client replays safe)
 *   4. dependency check server-side (unmet prerequisites → dependency_blocked)
 *   5. domain apply (conflict surfaced typed; acceptance carries serverSeq)
 */

import {
  DomainApplyPort,
  ServerAuthorityPort,
  ServerOpLedgerPort,
  SyncEnvelope,
  SyncOutcome,
  outcome,
} from "./contract.js";
import { validateEnvelope } from "./envelope.js";
import { DigestPort } from "./contract.js";

export interface ServerSyncServiceOptions {
  digest: DigestPort;
  authority: ServerAuthorityPort;
  ledger: ServerOpLedgerPort;
  domain: DomainApplyPort;
  /** Server-side dependency truth: which opIds are accepted. */
  isAccepted(opId: string): boolean;
  now?: () => number;
}

export class ServerSyncService {
  private readonly digest: DigestPort;
  private readonly authority: ServerAuthorityPort;
  private readonly ledger: ServerOpLedgerPort;
  private readonly domain: DomainApplyPort;
  private readonly isAccepted: (opId: string) => boolean;
  private readonly now: () => number;

  constructor(options: ServerSyncServiceOptions) {
    if (!options.digest || options.digest.algorithm !== "sha-256") {
      throw new Error("server sync requires a real sha-256 DigestPort");
    }
    for (const [name, port] of [["authority", options.authority], ["ledger", options.ledger], ["domain", options.domain]] as const) {
      if (!port) throw new Error(`missing required server port: ${name}`);
    }
    this.digest = options.digest;
    this.authority = options.authority;
    this.ledger = options.ledger;
    this.domain = options.domain;
    this.isAccepted = options.isAccepted;
    this.now = options.now ?? Date.now;
  }

  /** One envelope in — exactly one typed outcome out. Never throws for bad input. */
  apply(raw: unknown): SyncOutcome {
    const validated = validateEnvelope(raw, this.digest);
    if (!validated.ok) {
      const e = raw as Partial<SyncEnvelope> | null;
      return outcome("rejected", e?.opId ?? "", { detail: `invalid envelope: ${validated.reason}` });
    }
    const env = validated.envelope;

    // Claims are revalidated authoritatively — client claims never trusted.
    const auth = this.authority.revalidate({ accountId: env.accountId, deviceId: env.deviceId, claims: env.scopeClaims });
    if (!auth.ok) {
      return outcome(auth.kind, env.opId, { detail: auth.detail });
    }

    // Idempotency: a redelivered opId answers with the ORIGINAL receipt.
    const prior = this.ledger.lookup(env.opId);
    if (prior) {
      return outcome("previously_accepted", env.opId, { receipt: prior.receipt, serverSeq: prior.serverSeq });
    }

    // Server-side dependency check: prerequisites enforced at the authority.
    for (const dep of env.dependsOnOpIds) {
      if (!this.isAccepted(dep)) {
        return outcome("dependency_blocked", env.opId, { detail: `prerequisite not accepted: ${dep}` });
      }
    }

    const applied = this.domain.apply(env);
    if (!applied.accepted) {
      return outcome("conflict", env.opId, { detail: applied.conflict });
    }
    const receipt = `rcp-${env.opId}-${applied.serverSeq}`;
    this.ledger.record(env.opId, receipt, applied.serverSeq);
    return outcome("accepted", env.opId, { receipt, serverSeq: applied.serverSeq });
  }
}
