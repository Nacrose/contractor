# ADR-0010: Evolve in place over greenfield rewrite; adopt the native/web platform plan (v3)

- Date: 2026-10-08 (Asia/Kathmandu)
- Status: **Accepted** (owner-directed)
- Supersedes: the conflicting commitments of the greenfield-rewrite charter in `README.md` (scaffold commit `7773842`)
- Companion: [native-web-platform-plan-v3.md](../plans/native-web-platform-plan-v3.md) (§1.1, §4) · [AI-Agent Execution Protocol](../rules/AI-AGENT-EXECUTION-PROTOCOL.md) · [Master Execution Plan](../plans/EXECUTION-PLAN.md)

## Context

The `contractor` repository was scaffolded (commit `7773842`) as a clean-slate Next.js/tRPC/Prisma rewrite of `Construction_Manager`, with a charter README and inherited ADRs 0001–0009. A separately reviewed and iterated implementation plan (platform plan v3, three review rounds) selected a different direction: **cross-platform installed apps + web via Flutter, local SQLite, shared calculation kernels, and evolution in place of the existing server** — no backend-language rewrite, no wholesale repository move.

The v3 plan marked the charter supersession as *proposed*, pending verification of this repository's actual state (v3 §1.1). Verification has now been performed (2026-10-08) as `M00-T01`.

## Verification findings (M00-T01)

- History: exactly one commit (`7773842` — scaffold: README charter, .gitignore, inherited ADRs). No application code, no CI, no branches beyond `main`; working tree clean at verification.
- Documentation: ADRs 0001–0009 present under `docs/adr/`; **stray duplicate copies** at `docs/0001–0009.md` identified as scaffold cruft and removed in the bootstrap PR (canonical set: `docs/adr/`).
- Charter: README carried the greenfield charter, its binding rules, and "Suggested first milestones" anticipating an ADR-0010 tech-stack ratification.
- ⚠️ **Repository visibility was PUBLIC at verification time.** Flagged to the owner; the charter and this program assume private while the product is pre-release. Recommend switching to private in repository settings unless deliberate.
- Repository identities (for the v3 §4 cross-repository execution contract):
  - `Construction_Manager` — server, PostgreSQL access, React application, existing CI and backup systems. Remains the server home.
  - `contractor` — this repository; monorepo home for `apps/`, `packages/`, `crates/`, `fixtures/`, `benchmarks/` per v3 §4.

## Decision

1. **Adopt the native/web platform plan v3** as the normative program; its contracts, milestones and exit gates bind all implementation.
2. **Evolve in place**: extend the existing `Construction_Manager` backend and clients; no backend-language rewrite; the server repository does not move.
3. **This repository is repurposed** as the monorepo home for the Flutter application, shared packages, kernels, fixtures and benchmarks (v3 §4), created only when the owning milestone needs them.
4. **Charter supersession completed** per v3 §1.1: the README charter is amended to reference the plan and the execution register; its greenfield-specific commitments lapse here.
5. **Charter carry-over** — the following remain binding (now applying to `Construction_Manager` maintenance and all new server code): fail-loud financial guards (ADR-0001), shrink-only ratchets (ADR-0003), centralized authorization as default, migrations as single source of truth, live-DB money-path coverage before merge, ADR-before-implementation for architectural decisions, multi-tenant RLS from day one for any new scoped table.
6. **Lapsed charter items**: greenfield multi-file `prisma/schema/` partitioning *for this repository* (moot — no Prisma here), and greenfield tech-stack ratification (superseded by the plan's own kernel-governance and M01 gate).
7. **Execution method**: all work proceeds through the AI-Agent Execution Protocol and the Master Execution Plan register, starting at M00.

## Consequences

- Inherited ADRs 0001–0009 remain in force for server-side work; this ADR amends only the repository-purpose decision recorded in the README charter.
- The README "Why a rewrite" analysis is retained as historical context — its findings (router monoliths, inverted test pyramid, schema scale, build patches, client monoliths) remain valid improvement targets, now pursued under the plan's maintenance posture and milestones rather than a clean-room rebuild.
- Progress is tracked exclusively in `docs/plans/EXECUTION-PLAN.md` and its milestone files via PR-driven checkbox ticks.
