/**
 * Reference adapter factory (M03-T01): wires the ordered guard pipeline and
 * dispatches ONLY to named authoritative services. This module is the
 * boundary contract the Construction_Manager app will mount; the app maps
 * each operationId to its existing tRPC procedure's service call — the
 * adapter never re-implements business rules.
 *
 * No tRPC import. No Prisma import. No domain import.
 */

import {
  AdapterAuth,
  AdapterError,
  AdapterRequest,
  AdapterResult,
  Guard,
  GuardContext,
  GuardName,
  GUARD_ORDER,
  OperationMap,
  adapterError,
  resolveVersion,
  validateEnvelope,
  VersionPolicy,
} from "./contract.js";

export interface NativeAdapterConfig {
  /** Served platform_contracts versions (exact pins). */
  versionPolicy: VersionPolicy;
  /** Operation registry — every entry names its authoritative service. */
  operations: OperationMap;
  /** Available guard implementations; stages without an implementation fail closed. */
  guards: Record<GuardName, Guard>;
  /**
   * Dispatch to the EXISTING authoritative service for the operation.
   * In the app mount this is a call into the same service function the tRPC
   * procedure invokes — never a client-side re-implementation.
   */
  dispatch: (args: { operationId: string; service: string; request: AdapterRequest; resolvedVersion: string }) => Promise<unknown>;
}

export interface NativeAdapter {
  /** Handle one adapter request end-to-end. Never throws — returns typed results. */
  handle(request: AdapterRequest): Promise<AdapterResult>;
  /** Introspection for tests/mounts: effective guard order for an operation. */
  effectiveGuardChain(operationId: string): GuardName[] | null;
}

function isGuardOrdered(names: GuardName[]): boolean {
  const positions = names.map((n) => GUARD_ORDER.indexOf(n));
  return positions.every((p, i) => p !== -1 && (i === 0 || positions[i - 1] !== -1 && positions[i - 1] < p));
}

export function createNativeAdapter(config: NativeAdapterConfig): NativeAdapter {
  if (config.versionPolicy.supported.length === 0) {
    throw new Error("Adapter misconfiguration: versionPolicy.supported must not be empty.");
  }
  for (const [opId, binding] of Object.entries(config.operations)) {
    if (binding.guards.length === 0) {
      throw new Error(`Adapter misconfiguration: operation '${opId}' must declare at least the identity guard.`);
    }
    if (!binding.guards.includes("identity")) {
      throw new Error(`Adapter misconfiguration: operation '${opId}' must include the identity guard.`);
    }
    if (!isGuardOrdered(binding.guards)) {
      throw new Error(
        `Adapter misconfiguration: operation '${opId}' declares guards out of pipeline order: ${binding.guards.join(", ")}`,
      );
    }
    if (!binding.service || typeof binding.service !== "string") {
      throw new Error(`Adapter misconfiguration: operation '${opId}' must name its authoritative service.`);
    }
  }

  const guardChainCache = new Map<string, GuardName[]>();
  for (const [opId, binding] of Object.entries(config.operations)) {
    const chain = GUARD_ORDER.filter((stage) => binding.guards.includes(stage));
    guardChainCache.set(opId, chain);
  }

  return {
    effectiveGuardChain(operationId: string): GuardName[] | null {
      return guardChainCache.get(operationId) ?? null;
    },

    async handle(request: AdapterRequest): Promise<AdapterResult> {
      // 1. Structural envelope validation (validation boundary).
      const malformed = validateEnvelope(request);
      if (malformed) return { kind: "error", operationId: request?.operationId ?? "(unknown)", error: malformed };

      // 2. Protocol version compatibility — exact-pin resolution.
      const resolved = resolveVersion(request.protocolVersion, config.versionPolicy);
      if (!resolved.ok) return { kind: "error", operationId: request.operationId, error: resolved.error };
      const resolvedVersion = `${resolved.version.major}.${resolved.version.minor}.${resolved.version.patch}`;

      // 3. Operation registry lookup.
      const binding = config.operations[request.operationId];
      if (!binding) {
        return {
          kind: "error",
          operationId: request.operationId,
          error: adapterError("unknown_operation", `Operation '${request.operationId}' is not registered on this adapter.`),
        };
      }

      // 4. Mutations must carry a durable request identity (idempotency key carrier).
      if (binding.kind === "mutation" && !request.requestId) {
        return {
          kind: "error",
          operationId: request.operationId,
          error: adapterError("malformed_envelope", "Mutations require a durable requestId (idempotency key carrier)."),
        };
      }

      // 5. Run the operation's guard stages in FIXED pipeline order.
      const ctx: GuardContext = { request, resolvedVersion: resolved.version };
      const chain = guardChainCache.get(request.operationId)!;
      for (const stage of chain) {
        const guard = config.guards[stage];
        if (!guard) {
          // Fail closed: a declared stage without an implementation blocks dispatch.
          return {
            kind: "error",
            operationId: request.operationId,
            error: adapterError("internal", `Guard stage '${stage}' has no implementation; failing closed.`),
          };
        }
        const outcome = await guard.check(ctx);
        if (!outcome.ok) {
          return { kind: "error", operationId: request.operationId, error: outcome.error };
        }
      }

      // 6. Dispatch to the named authoritative service.
      try {
        const result = await config.dispatch({ operationId: request.operationId, service: binding.service, request, resolvedVersion });
        return { kind: "ok", operationId: request.operationId, result };
      } catch (e) {
        const err: AdapterError =
          e instanceof Error && (e as AdapterError & Error).code && typeof (e as AdapterError & Error).code === "string"
            ? (e as unknown as AdapterError)
            : adapterError("internal", "Authoritative service execution failed.");
        return { kind: "error", operationId: request.operationId, error: err };
      }
    },
  };
}

/** Convenience guard builders used by tests and the future app mount. */
export function guardFrom(name: GuardName, check: (ctx: GuardContext) => AdapterError | null): Guard {
  return {
    name,
    check: (ctx) => {
      const err = check(ctx);
      return err ? { ok: false, error: err } : { ok: true };
    },
  };
}

/** Standard identity guard: rejects unauthenticated callers before anything else runs. */
export const identityGuard: Guard = guardFrom("identity", (ctx) => {
  const auth: AdapterAuth = ctx.request.auth;
  if (!auth.authenticated) {
    return adapterError("unauthorized", "Authentication required; the native adapter accepts session-derived identity only.");
  }
  return null;
});

/** Standard tenant guard: tenant scope is server-derived and mandatory once authenticated. */
export function tenantScopeGuard(expectedOrganizationId: string): Guard {
  return guardFrom("tenantScope", (ctx) => {
    if (ctx.request.auth.organizationId !== expectedOrganizationId) {
      return adapterError("forbidden", "Caller is not scoped to the requested organization (tenant scoping preserved at the boundary).");
    }
    return null;
  });
}

/** Standard rate-limit guard: demonstrates typed rejection before dispatch. */
export function rateLimitGuard(remaining: () => number): Guard {
  return guardFrom("rateLimit", () => {
    if (remaining() <= 0) {
      return adapterError("rate_limited", "Rate limit exceeded; retry after the advertised window.");
    }
    return null;
  });
}
