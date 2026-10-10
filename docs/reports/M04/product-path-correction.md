# M04 daily-log product path correction

- **Status:** M04-T03 implementation prerequisite identified; product-repo approval requested.
- **Date:** 2026-10-10.
- **Plan amendment:** corrects the M04-T01 path report and clarifies M04-T03's authoritative route and cross-repository prerequisite.

## Discovery

The M04-T01 report says the daily-report router is unmounted and directs the Flutter daily-log workflow through `fieldSubmission.submit`. That does not match the current Construction_Manager product checkout inspected at commit `05922456`:

- `src/server/routers/_app.ts` mounts `workflowRouter`.
- `src/server/routers/workflow.ts` mounts `dailyReportRouter` as `workflow.dailyReport`.
- `src/server/routers/daily-report.ts` exposes `createFieldReport`.
- `src/lib/field-entry-builders.ts` builds daily-log submissions for `workflow.dailyReport.createFieldReport`.
- `fieldSubmission.create` accepts `material_inward`, `site_expense`, and `labour_log`, not daily reports.

The existing daily-report procedure owns validation, project permission revalidation in the transaction, `clientUuid` idempotency, report and normalized child-row writes, photo registration, audit, and the office event. M03 packages define the adapter, feed, and sync engine in contractor, but the product checkout has no mounted operation endpoint that applies the daily-report write through those contracts and publishes the feed event atomically.

## Required implementation sequence

1. Obtain explicit user approval before any Construction_Manager edit, as required by that repo's `.agents/AGENTS.md`.
2. In a separate product-repo PR, add a server binding for the existing `workflow.dailyReport.createFieldReport` service to the M03 sync operation. Preserve server identity and permission revalidation, `clientUuid` idempotency, existing domain validation/side effects, and atomic M03 feed emission. Add server evidence for accepted and replayed requests, permission revocation, and change-feed visibility. Do not redirect to `fieldSubmission.create`.
3. In M04-T03's contractor PR, bind the shared Flutter workflow to that operation and demonstrate acceptance visible in the current web app and a second client.
4. In M04-T04, route photo bytes through M03-T06 staging/finalization/registration and verify that incomplete transfers are not represented as complete.

## Decision boundary

The current M04 plan's outcome and acceptance criteria remain unchanged. This correction records which existing procedure owns the daily-log behavior and the integration prerequisite needed to satisfy the already-ratified sync and visibility criteria. It does not reduce scope or change the authoritative product rules.

## Read-only evidence

Inspected only; no Construction_Manager files were modified.

- Checkout: `/private/tmp/construction-manager-m02-t04`, branch `codex/m02-t05-save-sync`, commit `05922456`, clean at inspection.
- Mount: `src/server/routers/_app.ts:77`, `src/server/routers/workflow.ts:9-12`.
- Daily-log procedure/schema: `src/server/routers/daily-report.ts:102-127`, `1024-1221`.
- Current Flutter/web daily-log payload builder: `src/lib/field-entry-builders.ts:515-590`.
- Distinct field-submission schema/route: `src/server/routers/field-submission.ts:371-461`.
- Contractor M03 audited feed domains: `docs/reports/M03/sync-feed-pilot.md:39-42`.
