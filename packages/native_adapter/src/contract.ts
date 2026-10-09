/**
 * Versioned native-facing adapter contract (M03-T01).
 *
 * Goal (M03 register, protocol R9): expose existing domain services to native
 * clients through the pinned platform_contracts version WITHOUT binding the
 * native interface to tRPC internals, and demonstrably preserve every guard
 * that tRPC middleware provides today (authentication, authorization, tenant
 * scoping, validation, rate limits, side-effect guards) at the adapter
 * boundary.
 *
 * Sources of truth for the guard inventory:
 *   - docs/reports/M00/inventory-routers.md (M00-T07, app commit 7d80083e):
 *     79 routers, 711 procedures, 2,025 assert* call sites, createDomainRouter
 *     pipeline (proc.member/write/admin/manager + capabilityGuard +
 *     financialGuard), withIdempotency on 16 financial-critical routers.
 *   - v3 §4 (target boundaries), §5.1 (engineering document contract), §9
 *     (one owner per shared contract).
 *
 * Hard rules:
 *   - No business rule or permission check may move into client state; the
 *     adapter re-derives nothing — it routes through the SAME server guards.
 *   - No new server-side domain feature is introduced here (M03-T01). Follow-up
 *     feature tasks must name their change-feed integration and Flutter-parity
 *     path (standing constraint 3).
 */

import { SemVer, compareVersions, parseVersion } from "./version.js";

// ---------------------------------------------------------------------------
// Error taxonomy — transport-neutral, with the tRPC code each error maps to
// when mounted in the app (string literals only; no tRPC import).
// ---------------------------------------------------------------------------

export type AdapterErrorCode =
  | "version_unsupported"
  | "malformed_envelope"
  | "unknown_operation"
  | "unauthorized"
  | "forbidden"
  | "validation_failed"
  | "rate_limited"
  | "locked"
  | "conflict"
  | "not_found"
  | "internal";

/**
 * The tRPC error code each adapter error maps to when mounted in the
 * Construction_Manager app. Recorded here so the mapping is explicit and
 * reviewable — the adapter itself never imports tRPC.
 */
export const TRPC_CODE_MAP: Record<AdapterErrorCode, string> = {
  version_unsupported: "BAD_REQUEST",
  malformed_envelope: "BAD_REQUEST",
  unknown_operation: "NOT_FOUND",
  unauthorized: "UNAUTHORIZED",
  forbidden: "FORBIDDEN",
  validation_failed: "BAD_REQUEST",
  rate_limited: "TOO_MANY_REQUESTS",
  locked: "CONFLICT",
  conflict: "CONFLICT",
  not_found: "NOT_FOUND",
  internal: "INTERNAL_SERVER_ERROR",
};

export interface AdapterError {
  code: AdapterErrorCode;
  message: string;
  /** Machine-readable detail for clients; must never carry secrets or tenant data of other scopes. */
  detail?: Record<string, string>;
  trpcCode: string;
}

export function adapterError(code: AdapterErrorCode, message: string, detail?: Record<string, string>): AdapterError {
  return { code, message, detail, trpcCode: TRPC_CODE_MAP[code] };
}

// ---------------------------------------------------------------------------
// Request/response envelope
// ---------------------------------------------------------------------------

export interface AdapterRequest {
  /** Protocol version the client was built against (pinned platform_contracts release, `MAJOR.MINOR.PATCH`). */
  protocolVersion: string;
  /** Namespaced operation id, `router.procedure` (e.g. `fieldSubmission.submit`). */
  operationId: string;
  /** Caller identity evidence — resolved by the identity stage; never trusted from the payload. */
  auth: AdapterAuth;
  /**
   * Durable client request identity. REQUIRED for mutations: it is the
   * idempotency key carrier preserving `withIdempotency` semantics (M00-T07:
   * 16 financial-critical routers).
   */
  requestId?: string;
  /** Operation payload — schema comes from the pinned platform_contracts release. */
  payload?: unknown;
}

export interface AdapterAuth {
  authenticated: boolean;
  /** Session-derived tenant (organization) scope; server-derived, never client-asserted. */
  organizationId?: string;
  userId?: string;
}

export type AdapterResponseKind = "ok" | "error";

export interface AdapterOk {
  kind: "ok";
  operationId: string;
  /** Exact-decimal values cross as strings/scaled ints per platform_contracts semantics. */
  result: unknown;
}

export interface AdapterFailure {
  kind: "error";
  operationId: string;
  error: AdapterError;
}

export type AdapterResult = AdapterOk | AdapterFailure;

// ---------------------------------------------------------------------------
// Guard pipeline — the ordered, named stages that preserve server-side guards
// ---------------------------------------------------------------------------

/**
 * Ordered guard stages of the adapter boundary. The order is FIXED and mirrors
 * the effective evaluation order in the app's tRPC middleware + router guards
 * (M00-T07 §2). `filter` marks whether a guard runs for a given operation —
 * the pipeline never reorders.
 */
export const GUARD_ORDER = [
  "identity",
  "tenantScope",
  "rateLimit",
  "projectMembership",
  "projectPermission",
  "capability",
  "inputReferences",
  "delegation",
  "financial",
  "fiscalLock",
  "idempotency",
] as const;

export type GuardName = (typeof GUARD_ORDER)[number];

/** Mapping of each stage to the app guard(s) it preserves (see guard-inventory report). */
export const GUARD_APP_MAPPING: Record<GuardName, string> = {
  identity: "session authentication (protectedProcedure / session middleware)",
  tenantScope: "assertOrganizationPermissionOrAdmin / isOrgAdmin",
  rateLimit: "server-side rate-limit middleware (declared stage; must remain server-enforced)",
  projectMembership: "assertProjectMember",
  projectPermission: "assertProjectPermissionOrModuleEdit / assertProjectPermissionOrModuleView",
  capability: "capabilityGuard (active OrganizationPolicyVersion)",
  inputReferences: "assertInputReferences (foreign-key tenancy validation)",
  delegation: "assertDelegation (delegated spending approval authority)",
  financial: "financialGuard (approval limits)",
  fiscalLock: "assertNotLocked (fiscal year boundary lock)",
  idempotency: "withIdempotency (durable command deduplication)",
};

export interface GuardContext {
  request: AdapterRequest;
  /** Resolved protocol version (only set after compatibility passes). */
  resolvedVersion?: SemVer;
  /** Parsed project scope from the payload, when the operation is project-scoped. */
  projectId?: string;
}

export type GuardOutcome = { ok: true } | { ok: false; error: AdapterError };

export interface Guard {
  name: GuardName;
  check(ctx: GuardContext): GuardOutcome | Promise<GuardOutcome>;
}

export type OperationKind = "query" | "mutation";

/**
 * One adapter operation = one binding to an EXISTING authoritative service.
 * The binding cannot exist without naming the service: this is the structural
 * guarantee that no business rule moves into client state.
 */
export interface OperationBinding {
  kind: OperationKind;
  /** Authoritative server service/engine executed on dispatch (M00-T07 §4 mapping). */
  service: string;
  /** Stages that MUST run for this operation, in GUARD_ORDER (subset check enforced). */
  guards: GuardName[];
}

/** Operation registry: operationId -> binding. Seeded from M00-T07 §3/§4 exemplars. */
export type OperationMap = Record<string, OperationBinding>;

// ---------------------------------------------------------------------------
// Envelope + compatibility validation
// ---------------------------------------------------------------------------

const OPERATION_ID_RE = /^[a-z][A-Za-z0-9]*(\.[a-z][A-Za-z0-9]*){1,3}$/;

/** Structural envelope validation — rejects malformed input before any dispatch. */
export function validateEnvelope(request: AdapterRequest): AdapterError | null {
  if (!request || typeof request !== "object") {
    return adapterError("malformed_envelope", "Request must be an object.");
  }
  if (parseVersion(request.protocolVersion) === null) {
    return adapterError("malformed_envelope", "protocolVersion must be a MAJOR.MINOR.PATCH string.", {
      got: String(request.protocolVersion),
    });
  }
  if (typeof request.operationId !== "string" || !OPERATION_ID_RE.test(request.operationId)) {
    return adapterError("malformed_envelope", "operationId must be namespaced as `router.procedure`.", {
      got: String(request.operationId),
    });
  }
  if (!request.auth || typeof request.auth !== "object" || typeof request.auth.authenticated !== "boolean") {
    return adapterError("malformed_envelope", "auth.authenticated must be provided by the identity stage.");
  }
  if (request.requestId !== undefined && (typeof request.requestId !== "string" || request.requestId.length === 0)) {
    return adapterError("malformed_envelope", "requestId must be a non-empty string when present.");
  }
  return null;
}

export interface VersionPolicy {
  /** Versions this deployment serves — each an exact platform_contracts pin. */
  supported: SemVer[];
  /**
   * Compatibility rule (recorded, testable):
   *  - Resolution is EXACT: a request resolves only against a declared
   *    supported version ("consumers pin an exact tag or commit" —
   *    platform_contracts release policy). The server may declare several
   *    versions of the same major simultaneously to give clients an upgrade
   *    window during rolling deploys.
   *  - Different major than every supported version -> rejected: breaking
   *    schema changes require a new major contract version and an explicit
   *    migration plan (release policy).
   *  - Unlisted minor/patch within a served major -> rejected with the served
   *    list; the client re-pins. No silent minor upgrading.
   */
}

/**
 * Resolve the requested protocol version against the policy.
 * Returns the resolved supported version, or a typed rejection.
 */
export function resolveVersion(requestedRaw: string, policy: VersionPolicy): { ok: true; version: SemVer } | { ok: false; error: AdapterError } {
  const requested = parseVersion(requestedRaw);
  if (!requested) {
    return { ok: false, error: adapterError("malformed_envelope", "protocolVersion must be a MAJOR.MINOR.PATCH string.") };
  }
  const exact = policy.supported.find((v) => compareVersions(v, requested) === 0);
  if (exact) return { ok: true, version: exact };

  const hasMajor = policy.supported.some((v) => v.major === requested.major);
  return {
    ok: false,
    error: adapterError(
      "version_unsupported",
      hasMajor
        ? `Contract ${requested.major}.${requested.minor}.${requested.patch} is not served by this deployment.`
        : `Unsupported contract major ${requested.major}; breaking changes require a client upgrade.`,
      {
        supported: policy.supported.map((v) => `${v.major}.${v.minor}.${v.patch}`).join(", "),
        rule: "resolution is exact-pin; no silent minor upgrading",
      },
    ),
  };
}
