# Contractor

> Native + web platform program for [Construction_Manager](https://github.com/Nacrose/Construction_Manager) — the contractor operations platform for civil & infrastructure contractors, JVs, and builders operating under Nepal / South Asian standards (DoR, DUDBC, NEA, FIDIC-derived contracts).

**Status:** governance bootstrap merged · program executing under the [Master Execution Plan](docs/plans/EXECUTION-PLAN.md) — currently at **M00** (inventory, fixtures, baseline).

## Active documents

| Document | Role |
|---|---|
| [Master Execution Plan](docs/plans/EXECUTION-PLAN.md) | **Single backlog.** Every task is a checkbox; every checkbox is ticked by the pull request that completes it. |
| [AI-Agent Execution Protocol](docs/rules/AI-AGENT-EXECUTION-PROTOCOL.md) | **Binding rule.** One task → one PR → one tick. Naming, PR body contract, Definition of Done, owner-only gates. |
| [Platform plan v3](docs/plans/native-web-platform-plan-v3.md) | The program itself: outcome, contracts, milestones M00–M11, performance budgets, verification matrix. |
| [ADR-0010](docs/adr/0010-progressive-extension-over-greenfield-rewrite.md) | Pivot decision: evolve in place over greenfield rewrite. |
| [ADRs 0001–0009](docs/adr/) | Inherited from Construction_Manager; remain in force for server-side work. |

## How this repository works

Work is **plan-driven and PR-driven**. An agent (or human) picks the lowest-numbered unticked task whose dependencies are met, implements it on a named branch, opens a pull request titled `[<TASK-ID>] type: summary`, and that same PR ticks the task in the plan with its PR number. Gates between milestones require the owner's explicit approval. No work outside the register; no tick without evidence. See the [protocol](docs/rules/AI-AGENT-EXECUTION-PROTOCOL.md).

## Historical charter (superseded in part by ADR-0010)

The original scaffold charter below motivated this repository. Its greenfield-rewrite direction was superseded by [ADR-0010](docs/adr/0010-progressive-extension-over-greenfield-rewrite.md) after the platform plan review; its findings remain valid and its non-negotiables carry forward into server-side work.

### Why a rewrite (original charter findings)

The original codebase is functionally deep and security-mature, but carries compounding structural costs that motivated a clean start:

1. **Router monoliths** — 60 tRPC routers with ~900 hand-rolled authorization call sites; the centralized `createDomainRouter` pipeline existed but saw adoption by only 5 routers (~30–40% of router LOC was repeated scaffolding).
2. **Inverted test pyramid** — 152 mock-Prisma unit suites vs only 3 live-database integration suites; for a multi-tenant financial app, mock tests alone are not proof of isolation or persistence correctness.
3. **Single 5,777-line Prisma schema** (176 models) — correctness was well-governed (RLS tracker + drift gates), but velocity, reviewability, and onboarding degraded with scale.
4. **Permanent build patches** — the Prisma d.ts Decimal rewrite coupled every build to generator internals.
5. **Client monoliths** — 2,000-line canvas/markup components with 38–55 hook weaves on the most actively developed feature.

### Non-negotiables carried forward

These disciplines from Construction_Manager are **binding** on all server-side work under the new program (see `docs/adr/`):

- **Multi-tenant RLS from day one** — every scoped table gets a policy in its founding migration, never retrofitted.
- **Fail-loud financial guards** (ADR-0001) — no silent financial fallbacks; ledger arithmetic stays in exact `Decimal`.
- **Shrink-only ratchets** (ADR-0003) — debt metrics are measured and may only improve.
- **Centralized authorization** — `createDomainRouter`-style declarative pipelines are the *default*, not an opt-in; hand-rolled assert call sites are a ratchet against.
- **Migrations are the single source of truth** — no runtime DDL patches, ever.
