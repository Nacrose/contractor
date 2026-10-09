/**
 * Versioned sync envelope — build and structural validation (M03-T07).
 *
 * `buildEnvelope` is the CLIENT constructor (digest via the injected
 * fail-closed DigestPort). `validateEnvelope` is the SERVER gate: every
 * v3 §5.3 field is checked structurally and the digest is RECOMPUTED over
 * the received payload — a tampered payload can never reach a domain
 * apply. Validation failures map to typed `rejected`/invalid outcomes;
 * scope CLAIMS are NOT validated here beyond shape — their truth is the
 * ServerAuthorityPort's job (claims are revalidated, never trusted).
 */

import {
  DigestPort,
  SyncEnvelope,
  SYNC_PROTOCOL_VERSION,
  ScopeClaims,
  outcome,
  orchestrationError,
} from "./contract.js";

export function buildEnvelope(input: {
  opId: string;
  deviceId: string;
  accountId: string;
  kind: string;
  scopeClaims: ScopeClaims;
  payload: string;
  dependsOnOpIds?: string[];
  attempt: number;
  nowMs: number;
  digest: DigestPort;
}): SyncEnvelope {
  for (const [field, value] of [
    ["opId", input.opId], ["deviceId", input.deviceId], ["accountId", input.accountId], ["kind", input.kind],
  ] as const) {
    if (typeof value !== "string" || value.length === 0) {
      throw orchestrationError("invalid_envelope", `Envelope ${field} must be a non-empty string.`);
    }
  }
  if (!Number.isInteger(input.attempt) || input.attempt < 1) {
    throw orchestrationError("invalid_envelope", "Envelope attempt must be a positive integer.");
  }
  if (typeof input.payload !== "string") {
    throw orchestrationError("invalid_envelope", "Envelope payload must be a JSON string.");
  }
  return {
    syncProtocolVersion: SYNC_PROTOCOL_VERSION,
    opId: input.opId,
    deviceId: input.deviceId,
    accountId: input.accountId,
    kind: input.kind,
    scopeClaims: { ...input.scopeClaims },
    payloadDigest: input.digest.digest(input.payload),
    payload: input.payload,
    dependsOnOpIds: [...(input.dependsOnOpIds ?? [])],
    attempt: input.attempt,
    sentAtMs: input.nowMs,
  };
}

/** Structural + digest validation. Returns a rejected outcome on failure. */
export function validateEnvelope(raw: unknown, digest: DigestPort): { ok: true; envelope: SyncEnvelope } | { ok: false; reason: string } {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, reason: "envelope must be an object" };
  }
  const e = raw as Partial<SyncEnvelope>;
  if (e.syncProtocolVersion !== SYNC_PROTOCOL_VERSION) {
    return { ok: false, reason: `unsupported syncProtocolVersion: ${String(e.syncProtocolVersion)}` };
  }
  for (const field of ["opId", "deviceId", "accountId", "kind", "payload"] as const) {
    if (typeof e[field] !== "string" || (e[field] as string).length === 0) {
      return { ok: false, reason: `${field} must be a non-empty string` };
    }
  }
  if (typeof e.payloadDigest !== "string" || !/^[0-9a-f]{64}$/.test(e.payloadDigest)) {
    return { ok: false, reason: "payloadDigest must be sha-256 hex" };
  }
  if (typeof e.scopeClaims !== "object" || e.scopeClaims === null || typeof (e.scopeClaims as ScopeClaims).tenantId !== "string" || typeof (e.scopeClaims as ScopeClaims).role !== "string") {
    return { ok: false, reason: "scopeClaims must carry tenantId and role" };
  }
  if (!Array.isArray(e.dependsOnOpIds) || e.dependsOnOpIds.some((d) => typeof d !== "string")) {
    return { ok: false, reason: "dependsOnOpIds must be an array of opIds" };
  }
  if (!Number.isInteger(e.attempt) || (e.attempt as number) < 1) {
    return { ok: false, reason: "attempt must be a positive integer" };
  }
  // Server-side digest recompute — the integrity boundary before any apply.
  const observed = digest.digest(e.payload as string);
  if (observed !== e.payloadDigest) {
    return { ok: false, reason: "payload digest mismatch" };
  }
  return { ok: true, envelope: raw as SyncEnvelope };
}

/** The typed rejected outcome for an invalid envelope (opId may be unknown). */
export function invalidEnvelopeOutcome(reason: string): { kind: "rejected"; opId: string; detail: string } {
  return { kind: "rejected", opId: "", detail: `invalid envelope: ${reason}` };
}

export { outcome };
