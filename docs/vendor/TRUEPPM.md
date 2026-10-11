# Vendor registry — TruePPM

> Selected by the owner in [ADR-0017](../adr/0017-trueppm-scheduling-integration.md). Implementation belongs to [M09](../plans/milestones/M09-scheduling-engine.md). This registry declares the direction; it is not an effective build lockfile.

## Dependency and pin status

| Component | Upstream | Intended use | Effective pin |
|---|---|---|---|
| TruePPM OSS application | [Canonical repository](https://gitlab.com/trueppm/trueppm) | Full workspace and supported focused views | None — resolve and verify in M09-W01/W04 |
| `trueppm-scheduler` | Same repository; [package](https://pypi.org/project/trueppm-scheduler/) | Server calculation through Contractor adapter | None — resolve and execute in M09-W01 |

License checked 2026-10-12: repository [Apache-2.0](https://gitlab.com/trueppm/trueppm/-/raw/main/LICENSE). At the chosen immutable release, inspect component/dependency licenses, distribute the license and applicable NOTICE/attribution, and identify modified files if any. Our integration keeps upstream source unmodified. Proprietary enterprise modules are excluded under ADR-0014.

## Initial capability watchlist

Documentation snapshot checked 2026-10-12; verify against the actual selected release. This table is not execution evidence.

| Area | Published current state | Contractor follow-up |
|---|---|---|
| Release maturity | 0.4 beta line | Qualify chosen releases; do not track `main` |
| Resource leveling | Not implemented | Link W09 fixture/issue and recheck delivery |
| Date constraints | Start-no-earlier-than only | Map contractual requirements before cutover |
| Time granularity | Whole working-day durations; calendar-day lags | Verify required hour/date conventions |
| P6 exchange | Planned | Track construction exchange fixtures |
| Schedule UI scale | Comfortable around 2,000 tasks | Measure the existing 10k/50k target |
| Cost/EVM | Not implemented | Keep Contractor financial services authoritative |
| Governance | Multi-tenancy and approval chains outside OSS core | Enforce Contractor boundaries on every edit path |

Sources: [limitations](https://docs.trueppm.com/overview/what-it-does-not-do/), [scheduler conventions](https://docs.trueppm.com/features/scheduler/), [roadmap](https://docs.trueppm.com/overview/roadmap/). These are published claims; no adoption fixture has been run by this amendment. M09-W09 expands the matrix with tested release, upstream issue, local fixture, workflow impact, disposition and next verification. Selection remains TruePPM as those capabilities develop.

## Update contract — M09-W08

- Implement `scripts/update-trueppm <release>` or document the chosen equivalent. It does not exist yet. Reuse shared release machinery from M06-T12 where practical.
- Record app/engine compatibility, release tags, immutable source revisions, package/container/artifact hashes, lockfiles and runtime versions in machine-readable build inputs; mirror effective pins here in the same pin-bump PR. Do not assume independently published artifacts with similar version numbers are compatible.
- Check available releases during active integration and before M09/M10 gates. Read API, modeling, schema, migration and license changes; refresh the watchlist. This does not create a scheduled monitoring job.
- Run actual engine fixtures, both UI modes, authorization/tenant boundaries, progress idempotency, domain bridge, previous-release schedules and ratified performance checks before promotion. Explain date/float changes; do not silently recalculate issued baselines with a new engine.
- Demonstrate at least one two-release upgrade and restore. Preserve prior artifacts and compatible database/operation checkpoints; test migration and restoration before permitting incompatible writes. Record unsupported downgrade cases.
- Keep adapters outside upstream; retain the working pin when an upgrade fails and register required integration work. No automatic production promotion merely because a release exists.

## Change log

| Date | Change |
|---|---|
| 2026-10-12 | Owner selected TruePPM. M09 amended for app/engine integration, updates and capability delivery; no effective pin or implementation claimed. |
