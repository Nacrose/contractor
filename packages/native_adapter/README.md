# @contractor/native-adapter

Versioned native-facing API adapter contract (M03-T01). This package defines —
as pure TypeScript, with **zero runtime dependencies** — the boundary through
which native (Flutter) clients will call the existing Construction_Manager
domain services:

- **Operation envelope** — protocol version (exact-pin against
  `platform_contracts` releases), namespaced `operationId`, server-derived
  auth scope, durable `requestId` for mutations (the idempotency-key carrier).
- **Typed error taxonomy** — transport-neutral codes with the documented tRPC
  code each maps to when mounted (no tRPC import anywhere in this package).
- **Ordered guard pipeline** — the named stages that preserve, at the adapter
  boundary, every guard tRPC middleware provides today (identity, tenant
  scoping, rate limits, project membership/permission, capability, input
  reference tenancy, delegation, financial limits, fiscal locks, and
  `withIdempotency`). Pipeline order is fixed; mis-ordered or identity-less
  registries fail at construction; a declared stage without an implementation
  fails closed.
- **Operation registry discipline** — every operation binding MUST name the
  existing authoritative service it dispatches to. Seed exemplars in
  `src/registry.ts` are sourced from the M00-T07 router inventory.

## What this package is NOT

- Not a transport implementation (HTTP/tRPC mounting happens in the app).
- Not a domain feature. Financial arithmetic, permissions, and persistence
  remain in the existing services (v3 §4, §5.1; standing constraint 3).
- Not a client SDK — the Flutter side consumes generated
  `platform_contracts` bindings and speaks this envelope.

## Evidence

- Guard inventory and preservation mapping:
  [docs/reports/M03/adapter-guard-inventory.md](../../docs/reports/M03/adapter-guard-inventory.md)
- Contract tests: `npm run check` (compiles with pinned `typescript@5.9.3`,
  runs `node:test` suite covering supported/rejected versions, malformed
  input, authorization failures, and no-dispatch-on-rejection proofs).
