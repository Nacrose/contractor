# M04-T08 daily-report rule parity progress

- **Status:** current code-level comparison updated; full T08 acceptance remains open.
- **Compared product checkout:** `/private/tmp/construction-manager-m03-native-auth`, branch `codex/m04-resumable-photo-upload`, commit `abd3196112bc1ca3fed531cadf93a95e5391959c`.
- **Compared Flutter checkout:** `prototype/construction_client/lib/workflows/daily_report_workflow.dart` and `daily_report_screen.dart`, branch `codex/m04-connected-host`, commit `ea5e4c414929b9c12e295ea31298298ae40499d7` before this parity follow-up.
- **Sources:** product `src/lib/field-entry-builders.ts` (`reportCanSend`, `buildFieldPayload`), `src/server/routers/daily-report.ts` (`FieldReportCreateSchema`, `parseFieldSection`, `createFieldReport`), and `src/server/services/daily-report-sync.ts` (`syncNormalizedTables`).

## Rules compared

| Rule | Current product behavior | Flutter behavior | Result |
|---|---|---|---|
| Project and date | Builder requires a project and `YYYY-MM-DD`; server schema checks the same format. | Draft requires a non-empty project and the same date format. | Preserved. Both validate the date's format rather than calendar validity. |
| At least one report entry | Any user-entered recognized row value, trimmed notes, or a photo makes the report non-empty. | Recognized row values, trimmed notes, or a registered photo make it non-empty. | Preserved after fixing the photo-only report case. |
| Blank row defaults | Default `skill=unskilled` and `ownership=owned` do not count as content. | The same selection defaults are excluded from the content predicate. | Preserved. |
| Section limits | Each section is a JSON array with at most 200 row objects and at most 200,000 encoded characters. | Applies the same row-count and encoded-length limits. | Preserved. The server validates array/object structure; its section parser does not impose row-field schemas. |
| Free-text limits | Weather fields max 40 characters; problems, safety notes, and remarks max 8,000. The builder trims the three note fields before sending. | Enforces the same limits and now trims/omits blank note fields at serialization. | Preserved. |
| Weather numbers | Temperatures −60..70; rainfall 0..5000, inclusive. | Enforces the same inclusive bounds and finite numeric values. | Preserved. |
| Section numbers | The builder converts typed number strings with `Number(value) || 0`; normalized tables store numeric values without additional field-specific bounds. | Typed controls reject non-finite values; valid numeric values are emitted in the same units and normalized row shapes. | Valid inputs are preserved. Flutter rejects malformed/non-finite values earlier instead of letting the legacy coercion turn invalid strings into zero. |
| Photo count and size | Server accepts up to 6 photos, each positive and no larger than 10 MiB. Inline images are MIME-checked; registered references require a non-empty attachment ID/receipt, a 64-hex digest, and the same byte limit. | Accepts up to 6 completed registered references, enforces ID/receipt/digest/size, and does not send incomplete transfers. | Preserved for the M03-T06 capture/register flow. The product schema also keeps inline-photo input available for existing clients; Flutter intentionally sends registered references. |
| Section row mapping | Builder emits the product's workforce, progress, equipment, received-material, and consumed-material keys/defaults. The server writes them through `syncNormalizedTables`. | The Flutter editor emits the same keys, defaults, nullable fields, numeric values, and sort order. The widget test now asserts serialized payloads for all five row types, including equipment ownership and material defaults. | Code-level shapes match. A live route fixture is still needed. |
| Server acceptance | `createFieldReport` rechecks project edit permission, deduplicates by `clientUuid`, writes normalized rows/photos, and keeps the existing office-side draft/review flow. | Uses the same procedure and stable UUID through the outbox; the product adapter is in the approved product PR stack. | Not yet demonstrated against a merged product route or live database. |

## Evidence and remaining work

The parity pass found and fixed two Flutter-only gaps: a report containing only a registered photo was rejected as empty, and registered-photo references were not locally checked against the server's ID/receipt/SHA-256 rules. The Flutter serializer now preserves the product builder's note trimming. A focused workflow test covers photo-only reports and malformed photo references. These code changes do not establish live server acceptance.

T08 remains open. The Flutter widget test now covers all five section row payloads, and the focused screen test passes. T08 still needs a parity fixture against the live product route, native and web recorded workflow sessions, complete T03–T07 evidence, and explicit owner verification. The product binding/auth PRs must be merged and used against the configured local database before server acceptance or second-device visibility can be claimed. This progress report does not claim M04-T08 complete.
