# ADR-0017: Adopt TruePPM for scheduling with upstream release updates

- **Status:** Accepted selection (owner directive); implementation and cutover pending M09
- **Date:** 2026-10-12
- **Deciders:** Repository owner, chat directive: "nope use trueppm, it will be updated as we develop our app"
- **Related:** [ADR-0013](0013-m01-platform-stack-decision.md), [ADR-0014](0014-open-source-only-dependency-posture.md), [M09](../plans/milestones/M09-scheduling-engine.md), [TruePPM registry](../vendor/TRUEPPM.md)

## Context

The earlier M09 plan evolved the existing TypeScript CPM implementation and a governed client preview. The owner has selected TruePPM and intends to adopt its releases while Contractor is developed. This replaces further scheduler selection and a custom CPM rewrite with upstream integration. It changes the scheduling direction in ADR-0013; other engine and platform decisions remain in force.

## Decision

1. **Adopt TruePPM's open-source application and engine.** Use its full scheduling workspace for full editing and focused upstream views for embedded workflows where supported. M09 proves actual hosting surfaces; selection does not certify an embeddable UI SDK.
2. **Use pinned TruePPM as the target server calculation authority.** Start with the independently distributed Python package behind a Contractor service adapter. Clients submit typed proposals and display accepted revisions; any preview is explicitly reconciled. Avoid a new independent TypeScript/Dart calculation implementation. Current production CPM remains the migration reference until verified cutover, then is retired.
3. **Keep construction domain authority in Contractor.** Identity, tenant isolation, authorization, progress posting, approvals, BoQ/RA rates, cash-flow and baseline issuance remain behind existing services. Prove every upstream edit respects those boundaries. Scope upstream persistence deliberately; do not introduce competing schedule stores or assume upstream application permissions enforce Contractor policy.
4. **Track upstream without forking.** Keep adapters and domain extensions outside upstream source. Pin app/engine releases immutably, qualify upgrades against construction fixtures and both UI modes, and demonstrate data restore as well as artifact rollback. The update command and effective pins are planned M09-W08 work, not existing tooling.
5. **Develop alongside upstream capabilities.** M09-W09 links release-specific gaps to Contractor workflows and reassesses them as releases arrive. A roadmap informs sequencing but is not a guarantee. Do not silently discard contractual semantics or performance targets. Resolve blockers upstream or through a separate owner scope amendment while retaining TruePPM as the selected integration.
6. **Consume OSS components only.** The repository's [Apache-2.0 license](https://gitlab.com/trueppm/trueppm/-/raw/main/LICENSE) permits commercial redistribution subject to its terms. Carry required notices and audit exact dependencies under ADR-0014; proprietary enterprise modules are outside this adoption.

## Consequences

- M09 integrates and qualifies TruePPM instead of evolving a bespoke CPM kernel.
- The standalone engine introduces a Python runtime/service boundary; M09 must evidence packaging, failure handling and deployment rather than assume an in-process TypeScript replacement.
- Full and focused experiences share task identity, revision and approval semantics. Missing UI hooks must be resolved explicitly without an upstream fork.
- Adoption is decided now; production readiness and existing milestone gates are evidenced later. No task is completed, dependency installed or production engine switched by this planning amendment.

## Evidence

- Owner directive above, recorded 2026-10-12.
- [Scheduler documentation](https://docs.trueppm.com/features/scheduler/) — independently distributed engine and modeling conventions.
- [Capability limitations](https://docs.trueppm.com/overview/what-it-does-not-do/) and [roadmap](https://docs.trueppm.com/overview/roadmap/) — inputs to the version-specific register, not release commitments by Contractor.
