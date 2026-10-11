# M04 daily-log product path correction

- **Status:** current product route identified; M03-T01 adapter conformance and live acceptance remain open.
- **Date:** 2026-10-11 update to the 2026-10-10 correction.
- **Plan amendment:** corrects the M04-T01 path report and tracks the current product route against the already-ratified M03 adapter, feed, and Flutter acceptance criteria. No scope is reduced.

## Discovery

The original M04-T01 report said the daily-report router was unmounted and directed the Flutter daily-log workflow through `fieldSubmission.submit`. That did not match the product checkout inspected at commit `05922456`:

- `src/server/routers/_app.ts` mounts `workflowRouter`.
- `src/server/routers/workflow.ts` mounts `dailyReportRouter` as `workflow.dailyReport`.
- `src/server/routers/daily-report.ts` exposes `createFieldReport`.
- `src/lib/field-entry-builders.ts` builds daily-log submissions for `workflow.dailyReport.createFieldReport`.
- `fieldSubmission.create` accepts `material_inward`, `site_expense`, and `labour_log`, not daily reports.

The existing daily-report procedure owns validation, project permission revalidation in the transaction, `clientUuid` idempotency, report and normalized child-row writes, photo registration, audit, and the office event. Product PR #165 now adds `POST /api/native/sync`; it validates its own sync envelope, creates a tRPC caller, and directly invokes `appRouter.workflow.dailyReport.createFieldReport`. That preserves the protected procedure's business and permission checks, but it does not mount the M03-T01 `@contractor/native-adapter` contract: there is no exact `platform_contracts` version resolution, adapter registry entry, or declared ordered guard chain in that route.

Product PR #166 separately prepares the scoped change-feed pull/snapshot surface and the pgoutput CDC worker. The worker persists report projections using PostgreSQL commit LSNs after reading committed WAL. The route and feed code are local draft work and have not been proven through a live authenticated Flutter session. The server route therefore exists, but M04-T03's M03 adapter conformance and server acceptance criteria remain open.

## Required implementation sequence

1. Obtain explicit user approval before any Construction_Manager edit, as required by that repo's `.agents/AGENTS.md`.
2. In the product-repo PR stack, reconcile the existing `/api/native/sync` binding with the ratified M03-T01 adapter boundary, or submit an owner-approved `[PLAN-AMEND]` that preserves M03 contract guarantees. Preserve server identity and permission revalidation, `clientUuid` idempotency, existing domain validation/side effects, and commit-LSN ordered CDC delivery. Add server evidence for accepted and replayed requests, permission revocation, and change-feed visibility. Do not redirect to `fieldSubmission.create`.
3. In M04-T03's contractor PR, bind the shared Flutter workflow to that operation and demonstrate acceptance visible in the current web app and a second client.
4. In M04-T04, route photo bytes through M03-T06 staging/finalization/registration and verify that incomplete transfers are not represented as complete.

## Decision boundary

The current M04 plan's outcome and acceptance criteria remain unchanged. This correction records which existing procedure owns the daily-log behavior and the integration prerequisite needed to satisfy the already-ratified sync and visibility criteria. It does not reduce scope or change the authoritative product rules.

## Read-only evidence

Inspected only; no Construction_Manager files were modified.

- Current inspected product worktree: `/private/tmp/construction-manager-m03-native-auth`, branch `codex/m04-resumable-photo-upload`; source files include `src/app/api/native/sync/route.ts`, `src/server/sync-feed/worker.ts`, `src/server/routers/daily-report.ts`, and `src/server/routers/workflow.ts`.
- Remote PR state could not be refreshed during this report update because GitHub API access is unavailable; the last recorded checkpoint lists Construction_Manager PRs #165–#167 and #170 as draft and unmerged.
- Mount: `src/server/routers/_app.ts:77`, `src/server/routers/workflow.ts:9-12`.
- Daily-log procedure/schema: `src/server/routers/daily-report.ts:102-127`, `1024-1221`.
- Current Flutter/web daily-log payload builder: `src/lib/field-entry-builders.ts:515-590`.
- Distinct field-submission schema/route: `src/server/routers/field-submission.ts:371-461`.
- Contractor M03 audited feed domains: `docs/reports/M03/sync-feed-pilot.md:39-42`.
