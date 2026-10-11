# M04-T08 daily-report rule parity progress

- **Status:** code-level comparison extended for the M04 field sections; full T08 acceptance remains open.
- **Compared product checkout:** `/private/tmp/construction-manager-m03-native-auth`, branch `codex/m04-resumable-photo-upload`, latest PR #170 commit `16408be2`.
- **Compared Flutter checkout:** `prototype/construction_client/lib/workflows/daily_report_workflow.dart` and `daily_report_screen.dart`, branch `codex/m04-connected-host`, latest PR #55 commit `c04eb897`.
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
| Section row mapping | Builder emits workforce, progress, equipment, received-material, consumed-material, site-visit, and meeting rows. Progress stores BOQ code/description, planned, batched, actual, and payable quantities; `syncNormalizedTables` writes the normalized relations. | Flutter now edits and serializes all seven sections. Progress includes BOQ code/description, location, planned, batched/placed, payable, and unit values. Visitor/meeting fields use the product relation names and preserve row order. Previously saved rows using `taskDescription`/`actualQty` are mapped when reopened. Widget coverage checks the emitted rows. | Field shapes and normalized targets match at code level. A live route fixture is still needed. |
| Server acceptance | Create and versioned update procedures recheck project edit permission, deduplicate by `clientUuid`, write normalized rows/photos, and keep the existing office-side draft/review flow. Office/native updates compare expected `updatedAt` before writing. | Uses create or versioned update operations with stable UUIDs through the outbox; a stale version is retained as a conflict for user-directed review. | Product PR #170 includes adapter binding and fixture tests, including office-save then stale-native-update rejection. It is open as a draft; no live database or device acceptance has been demonstrated. |

## Evidence and remaining work

The parity pass found and fixed two Flutter-only gaps: a report containing only a registered photo was rejected as empty, and registered-photo references were not locally checked against the server's ID/receipt/SHA-256 rules. The Flutter serializer now preserves the product builder's note trimming. A focused workflow test covers photo-only reports and malformed photo references. These code changes do not establish live server acceptance.

The parity follow-up adds `siteVisits` and `meetings` to the native sync payload and the existing product procedure schema. Product route tests verify they are forwarded and written through `syncNormalizedTables`; malformed section JSON is rejected before writes. These are fixture-level checks and do not establish live server acceptance.

T08 remains open. The Flutter widget coverage checks the expanded section payloads, and the full screen/workflow tests pass. T08 still needs a parity fixture against the live product route, native and web recorded workflow sessions, complete T03–T07 evidence, and explicit owner verification. Product PRs must be merged and used against the configured local database before server acceptance or second-device visibility can be claimed. This progress report does not claim M04-T08 complete.

Latest code checkpoint (2026-10-11): Contractor PR #55 (`c04eb897`) passes the
full Flutter suite (**219 tests**) and `flutter analyze --no-pub`. Product PR
#170 (`16408be2`) pins this client contract and adds versioned native edits;
the focused native-route, daily-report, and shared-adapter suite passes **106
tests across 8 files**, ESLint for the changed test passes, and `npx tsc
--noEmit` passes. The Webpack production
build generated all 73 routes before the final test-only commit. A fresh
remote check confirms both PRs are open drafts. These checks validate code and
fixtures only; live sign-in, project assignment, server acceptance, feed
visibility, and second-device parity remain open.
