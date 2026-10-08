# Contractor

> Rewrite of [Construction_Manager](https://github.com/Nacrose/Construction_Manager) — the contractor operations platform for civil & infrastructure contractors, JVs, and builders operating under Nepal / South Asian standards (DoR, DUDBC, NEA, FIDIC-derived contracts).

**Status:** planning / scaffold — no application code yet.

---

## Why a rewrite (charter)

The original codebase is functionally deep and security-mature, but carries compounding structural costs that motivated a clean start:

1. **Router monoliths** — 60 tRPC routers with ~900 hand-rolled authorization call sites; the centralized `createDomainRouter` pipeline existed but saw adoption by only 5 routers (~30–40% of router LOC was repeated scaffolding).
2. **Inverted test pyramid** — 152 mock-Prisma unit suites vs only 3 live-database integration suites; for a multi-tenant financial app, mock tests alone are not proof of isolation or persistence correctness.
3. **Single 5,777-line Prisma schema** (176 models) — correctness was well-governed (RLS tracker + drift gates), but velocity, reviewability, and onboarding degraded with scale.
4. **Permanent build patches** — the Prisma d.ts Decimal rewrite coupled every build to generator internals.
5. **Client monoliths** — 2,000-line canvas/markup components with 38–55 hook weaves on the most actively developed feature.

## Non-negotiables carried forward

These disciplines from Construction_Manager are **binding** on this rewrite (see `docs/adr/`):

- **Multi-tenant RLS from day one** — every scoped table gets a policy in its founding migration, never retrofitted.
- **Fail-loud financial guards** (ADR-0001) — no silent financial fallbacks; ledger arithmetic stays in exact `Decimal`.
- **Shrink-only ratchets** (ADR-0003) — debt metrics are measured and may only improve.
- **Centralized authorization** — `createDomainRouter`-style declarative pipelines are the *default*, not an opt-in; hand-rolled assert call sites are a ratchet against.
- **Migrations are the single source of truth** — no runtime DDL patches, ever.

## Rules for this rewrite

- Integration tests against a real PostgreSQL are **first-class**, not a trailing phase. Money paths (IPC, payroll, BOQ, ledger) require live-DB coverage before merge.
- `prisma/schema/` is **multi-file** from the first commit, partitioned by domain.
- Components get an extracted state model before they exceed ~500 lines.
- ADRs are written *before* implementation for any architectural decision — the 9 inherited ADRs remain in force unless superseded by a new one referencing them.

## Suggested first milestones

- [ ] Tech-stack ratification (or reaffirmation) of Next.js / tRPC / Prisma versions — new ADR-0010
- [ ] Monorepo/package layout and `prisma/schema/` multi-file partitioning
- [ ] Auth + org/project tenancy skeleton with RLS baseline and live-DB CI gate
- [ ] First vertical slice (recommend: BOQ or daily report) through all layers
