# M04-T08 daily-report rule parity progress

- **Status:** code-level comparison prepared; full T08 acceptance remains open.
- **Compared product checkout:** `/private/tmp/construction-manager-m02-t04`, commit `05922456` (2026-10-10 inspection).
- **Compared Flutter path:** `prototype/construction_client/lib/workflows/daily_report_workflow.dart` and `daily_report_screen.dart` on `m04-t06-restore`.
- **Sources:** product `src/lib/field-entry-builders.ts` (daily-report row predicates and `reportCanSend`) and `src/server/routers/daily-report.ts` (`FieldReportCreateSchema`, `parseFieldSection`, `createFieldReport`).

## Rules compared

| Rule | Current product behavior | Flutter workflow behavior | Result |
|---|---|---|---|
| Project and date | Requires project and `YYYY-MM-DD` date in `reportCanSend`; server validates date format | Requires non-empty project and the same date format | Preserved |
| At least one report entry | Any user-entered recognized row cell, non-empty problems/safety/remarks, or photo | Same recognized section cells or notes; registered photos count as report content | Preserved at the local draft boundary |
| Blank row defaults | `skill=unskilled` and `ownership=owned` alone do not count | Skill and ownership are excluded from content detection | Preserved |
| Section structure | Each supplied section is a JSON array of at most 200 objects and at most 200,000 characters | Each section is encoded as a JSON array and checked against both limits | Preserved |
| Free-text limits | Weather fields max 40; problems, safety notes, remarks max 8,000 | Same character limits | Preserved |
| Numeric limits | Max/min temperature −60..70; rainfall 0..5000 | Same inclusive ranges; finite numeric parse required | Preserved |
| Photo count/size | Up to 6 photos; each file size up to 10 MiB; JPEG/PNG capture; server also validates allowed MIME | Up to 6 registered photos; picker accepts JPEG/PNG; each file is bounded at 10 MiB | Preserved for capture; live server MIME check awaits product binding |
| Photo wire contract | Existing route expects `{fileName,fileType,fileSize,data}` inline base64 photo records | M03-T06 workflow emits `{attachmentId,receipt,digest,fileSize}` references | **Known integration difference:** product server binding/schema must be updated under the approved M04 prerequisite before sync can pass; do not fall back to inline byte upload |
| Section editing | Product builder presents typed row fields and normalizes them into the procedure's section JSON shape | Shared Flutter screen currently accepts JSON arrays in section text fields | **User-flow difference:** accepted by the server's structural parser, but editing UX and normalization are not at parity yet |
| Submission and visibility | Product procedure revalidates project permission, enforces `clientUuid` idempotency, writes normalized rows/photos, and emits the office event | Contractor outbox uses the same procedure name and a stable UUID; product M03 sync/feed binding is absent | **Acceptance blocked:** no server acceptance or second-device visibility evidence |

## Evidence and remaining work

The Flutter model now checks the product-side limits above and has unit coverage for recognized row content, numeric range rejection, and the six-photo cap. Local checks do not demonstrate server behavior. T08 still needs the structured row editor to match the current form behavior, the approved product sync/photo binding, native and web recorded workflow sessions, complete fault/restore/telemetry reports, a parity fixture against the live product route, and explicit owner verification. This progress report does not claim M04-T08 complete.
