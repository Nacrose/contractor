# M04-T02: Flutter mount wiring of the M03 engine (identity, outbox, snapshot/bootstrap, orchestrator, health)

- **Task**: `M04-T02` — Flutter mount wiring of the M03 engine (this PR)
- **Depends on**: M03-T02, M03-T03, M03-T05, M03-T07, M03-T08 — all merged; M04-T01 (PR #44) — merged
- **Status**: Complete · **Output**: mount adapter code in `prototype/construction_client/` binding the M03 contract packages' ports to device implementations, with tests
- **Date**: 2026-10-09
- **Validation**: `flutter analyze` clean · `flutter test` **150/150 green** (41 new mount binding tests) · `flutter build web --wasm` green (conditional-import discipline verified for the web leg)

---

## 1. What the mount is

The M03 contract packages (`packages/native_*`, TypeScript, Node-tested) are the SEMANTIC AUTHORITY for the sync engine; the Flutter app cannot run them, so the mount mirrors their port shapes in Dart and binds device implementations to them. This is the composition root the M03 packages were designed for (v3 §5.2/§5.3, §6 M04 W02 substrate). Per the M02 `platform_contracts` generation pattern, the mirrors are structural only: **no package code is forked or edited, and the M03 suites keep pinning semantics** — mount tests verify the BINDING, not re-prove the packages (acceptance 1).

Everything lives in `prototype/construction_client/lib/mount/`:

| Module | Binds | TS authority (mirrored shape) |
|---|---|---|
| `ports.dart` | All port interfaces + typed errors + `MountSqliteDriver` | driver.ts, migrations.ts, credentials.ts, lifecycle.ts, attachment contract.ts:174-206, orchestrator contract.ts:47-245, observability contract.ts:43-177 |
| `sqlite_driver.dart` (+`_io`/`_stub`) | `SqlDriver` → package:sqlite3 (dart:ffi) | outbox driver.ts |
| `migrations.dart` | Versioned schema: TS baseline v1-v2 mirror + documented mount v3 extension | outbox migrations.ts |
| `outbox_repository.dart` | The durable local half (save boundary, transitions, retention) | outbox repository.ts |
| `pending_operation_source.dart` | `PendingOperationSource` adapter (orchestrator surface) 1:1 | orchestrator contract.ts:156-193 |
| `secure_store.dart` | `SecureCredentialStore` → OS keystore via method channel | identity credentials.ts |
| `system_browser.dart` | `SystemBrowserPort` → external browser (url_launcher) + deep-link sink | identity lifecycle.ts:80-85 |
| `object_store.dart` | `ObjectStore`/`SourceReaderPort`/`DigestPort` → device filesystem + REAL sha-256 | attachment contract.ts:174-206 |
| `sync_transport.dart` | `SyncTransportPort` → server routes (package:http) + `buildSyncEnvelope` | orchestrator contract.ts:200-213, envelope.ts:25-54 |
| `sync_health.dart` | `SyncHealthSource` → outbox binding + `buildDeviceSyncHealth` honesty rules | observability health.ts |
| `crash_sanitizer.dart` | Crash-report gate (vocabulary mirror, drop-first) | observability redaction.ts |
| `drain_triggers.dart` | Orchestrator drain triggers (launch/foreground/manual/background-gated) | orchestrator contract.ts + v3 §5.3 |
| `mount.dart` | `openMount` composition root | — |

## 2. Binding evidence, acceptance criterion by criterion

### Acceptance 1 — each port binding has a test honoring the port contract

Mount tests verify the BINDING (durability flags, fail-closed behaviors, redaction) against REAL engines, per the M03-T09 no-mocks-for-durability discipline:

- **SQLite driver** (`test/mount/sqlite_driver_test.dart`): real SQLite via dart:ffi on a temp file. `PRAGMA journal_mode` reads back `wal`, `synchronous` reads `2` (=FULL), `foreign_keys` reads `1`, bounded `busy_timeout` — the driver.ts durability policy is enforced at open, not assumed. Statement surface (run changes/lastInsertRowid, all, get, BLOB round-trip), typed error mapping (constraint=19, **notadb=26 raised during OPEN** because the pragmas run inside the factory), and close/reopen durability of a file-backed database.
- **Outbox + migrations** (`outbox_migrations_test.dart`, `outbox_repository_test.dart`, `pending_operation_source_test.dart`): REAL SQLite throughout. v1+v2 are a statement-for-statement mirror of outbox migrations.ts; the mount's v3 extension is exercised on a fresh database AND as an upgrade from a seeded v2 database (see §3); the save boundary commits domain write + pending op in ONE transaction and rolls back BOTH on failure; transitions record only from server outcomes; retention paths are the only deletions.
- **Secure store** (`secure_store_test.dart`): the Dart channel binding maps save/load/delete/wipeAll to `construction_client/secure_store` with ref+value args; **every channel failure (missing handler, OS error) becomes the typed fail-closed `CredentialStoreUnavailable` — tested on all four operations**; the binding declaration is an OS keystore id, never a file path.
- **System browser** (`system_browser_test.dart`): open() launches EXTERNALLY (the mode is pinned in the binding; a refused launch fail-closes — no WebView fallback exists); awaitCallback resolves the redirect from the host-fed sink, including the callback-before-await race and user-cancel-as-error.
- **Attachments** (`attachments_test.dart`): putBytes is durable-before-return (temp + flush + atomic rename on the same filesystem; a fresh store instance sees the bytes), renameBytes tolerates crash re-entry (source gone + destination present = no-op), unsafe keys (traversal/absolute/NUL) are rejected, listKeys honors prefixes and never surfaces `.tmp` staging artifacts; **sha-256 is REAL (FIPS 180-2 vectors: `sha256("")` and `sha256("abc")`), lowercase hex, no fallback digest path**.
- **Transport** (`sync_transport_test.dart`): a real loopback HTTP fixture proves all eight v3 §5.3 outcome kinds parse to typed outcomes, a typed body wins over the HTTP status (503 + typed retryable parses), the envelope JSON round-trips field-for-field, unparseable bodies THROW (never fabricate a kind), network death throws, and `buildSyncEnvelope` mirrors envelope.ts structural validation (empty ids, attempt < 1, digest via the injected fail-closed port).
- **Health** (`sync_health_test.dart`): the honesty rules are mirrored exactly — reason strings and their order match health.ts; a fresh rejection blocks `synced`, an old one stops blocking (default 24h), and `synced` is TRUE only for a clean device; `OutboxSyncHealthSource` derives health rows and per-scope cursors (tenant/project scopes from accepted rows' `server_seq`) from the real outbox.
- **Crash sanitizer** (`crash_sanitizer_test.dart`): the M03-T08 vocabulary re-pinned at the mount boundary — GitHub tokens/JWTs/Bearer/password assignments redacted, JSON bodies `[PAYLOAD]`-reduced, drop-first allow-list (`kCrashSafeAttributeKeys`), frames export only as COUNT, message redact-then-cap at 160, appVersion/schemaVersion capped at 32, unknown component → `native`, malformed context → typed error + minimal fallback shape.
- **Drain triggers** (`drain_triggers_test.dart`): launch/foreground(lifecycle-resumed)/manual start drains; the background gate refuses cleanly while the prototype environment is unsuitable (foreground sync carries the product until M05-T06, so every correctness property holds with background disabled); triggers coalesce while a drain runs; a drain crash does not escape the trigger layer.
- **Composition** (`mount_test.dart`): `openMount` wires the full bundle (migrations applied `[1,2,3]`, durability flags re-asserted, corrupt/garbage database fails OPEN typed), a missing transport is a typed misconfiguration (never a silent no-sync mount), and the composed pieces work together (save → source → envelope → health over one real database).

### Acceptance 2 — the outbox adapter implements `PendingOperationSource` 1:1 (blocked/conflict via documented schema extension), no translation-layer drift

The adapter (`OutboxPendingOperationSource`) implements the orchestrator contract's surface exactly: `listDue` (pending + time-eligible, **oldest first, WITHOUT dependency filtering** — the orchestrator owns the prerequisite policy and consults `getOp` for it, pinned by test against the orchestrator.ts call pattern), `listInFlight`, `getOp`, `markInFlight` (attempts increment), `recordAccepted(opId, receipt, serverSeq)`, `recordRejected`, `requeue` (null = immediately eligible), `markBlocked`, `markConflict`. Every orchestrator-visible field round-trips through the durable row: the "no drift" test asserts all 12+ fields (`opId, accountId, projectId, kind, payload, digest, dependsOnOpIds, state, attempts, nextAttemptAtMs, lastError, acceptedReceipt, serverSeq, tenantId, role`) after transitions. Dependency edges come from `op_dependency`; `dependsOnOpIds` are reassembled per record. Acceptance is terminal (a second `markInFlight` on an accepted op is a typed illegal transition); no outcome path deletes anything.

**The documented schema extension** (v3 `mount_orchestrator_states`): SQLite cannot ALTER a CHECK constraint, so v3 rebuilds `pending_op` with the six-value state CHECK (`blocked`, `conflict` added) plus `server_seq`, `tenant_id`, `role` columns. The rebuild preserves data: rows carry over, and **dependency edges are backed up and restored before the FK-cascading drops** — a plain `DROP TABLE pending_op` with foreign_keys=ON would cascade away every `op_dependency` row (the test proves edges survive the rebuild AND that the rebuilt child table still cascades, matching v2's definition exactly). The extension is the mount's app layer using the DOCUMENTED extension mechanism (`MigrateOptions.extraMigrations` equivalents — the mount owns v3 inside its set; the TS baseline stays byte-identical).

### Acceptance 3 — credentials never appear outside the secure store; crash paths route through the M03-T08 sanitizer

- The ONLY credential surface is `SecureCredentialStore` (4 logical refs, channel-bound). No mount module writes credential-bearing values anywhere else — the store exposes exactly the four channel operations plus the declared OS binding id. The fail-closed test proves a missing host handler or an OS error NEVER degrades to disk/SharedPreferences/SQLite (typed `CredentialStoreUnavailable` on every operation).
- Host bindings shipped for the sanctioned OS backends: **Android** (`MainActivity.kt` — Keystore-backed EncryptedSharedPreferences via `androidx.security:security-crypto`, `commit()` durability) and **iOS** (`AppDelegate.swift` — Keychain `kSecClassGenericPassword`, `ThisDeviceOnly`, never backup-synchronizable). Both fail the channel with `store_unavailable` on any OS error, which the Dart side maps to the same typed failure.
- Every Dart crash path reports through `crash_sanitizer.dart` — the M03-T08 vocabulary mirrored and re-pinned by tests (drop-first attributes, frame counts only, redact-then-cap message, payload-like content stripped, fail-safe fallback shape). `SanitizedCrashReport` is the only shape the mount produces for reporting.

### Acceptance 4 — the SAME M03 suites' contract shapes (structural pins intact); no package code forked or edited

`packages/native_*` is untouched by this diff (only `prototype/construction_client/`, hosts, pubspec, CI). The port mirrors cite their TS sources file+line (ports.dart doc comments); the eight outcome kinds, the 12-field record, the envelope fields, the migration statements, the redaction vocabulary, and the health reason strings are all mirrored 1:1 and pinned by the tests above against the same fixtures' semantics (real SQLite, real HTTP, real SHA-256). The M03 packages' own CI suites continue to run unchanged in the same workflow.

## 3. Platform binding matrix and recorded constraints

| Surface | Android | iOS | Linux desktop | Windows/macOS | Web |
|---|---|---|---|---|---|
| SQLite outbox | ffi driver + bundled engine (sqlite3_flutter_libs) | same | same | same | **FAIL-CLOSED stub** (constraint C1) |
| Secure credentials | Keystore handler (shipped) | Keychain handler (shipped) | **fail-closed** (C2) | fail-closed (C2) | fail-closed (C2) |
| System browser | external (Custom Tabs) | external (Safari) | external | external | in-place redirect |
| Attachment bytes | device filesystem | same | same | same | M04-T03 obligation (C1) |
| sha-256 | real (crypto pkg) | real | real | real | real (pure Dart) |
| Sync transport | package:http | same | same | same | same |
| Background drain | gated (ForegroundOnlyEnvironment) | gated | n/a | n/a | n/a |

- **C1 (web outbox)**: the web leg's browser outbox binding (IndexedDB/OPFS driver under the same `SqlDriver` shape) is a separate M04-T03 obligation — the vertical workflow must run the SAME code path on web, and its outbox driver is the piece that lands then. The stub refuses with the typed `misconfigured` kind; nothing pretends to be durable on web.
- **C2 (desktop credentials)**: Linux/Windows/macOS host handlers for the secure store are follow-up work (the M04 exit runs on Android + web per the ratified evidence profile). Until a handler exists the store fail-closes; there is no plaintext fallback on any platform, ever.
- **C3 (Dart transport shape)**: the TS `SyncTransportPort.send` is synchronous (the M03 fixtures were); Dart IO is async, so the Dart port is `Future<SyncOutcome> send(...)` — the one deliberate shape deviation, recorded here and in ports.dart. The throw-on-network-failure and typed-outcome disciplines are unchanged; the Dart orchestrator port (M04-T03) consumes the async shape.
- **C4 (background gate)**: `ForegroundOnlyEnvironment` marks background execution unsuitable until the M05-T06 OS scheduler adapters land. This is the conservative default, not a regression: foreground sync works without OS background scheduling (v3 §5.3), and M05-T06 pins the never-ran-background case.

## 4. CI notes (one justified workflow change)

The mount's binding tests drive REAL SQLite through package:sqlite3 (dart:ffi), which dlopens the system library on the CI VM; built apps bundle their own engine via `sqlite3_flutter_libs`, but `flutter test` on the runner needs `libsqlite3` present. The `lint_and_protocol` job gains one step installing `libsqlite3-dev` before the Flutter test step. New pub dependencies are the mount's own deliverables (not speculative): `sqlite3` + `sqlite3_flutter_libs` (driver + bundled engine), `crypto` (real sha-256), `http` (transport), `url_launcher` (external browser). CI otherwise picks the mount up automatically (analyze/test run on the existing paths; the Android APK and Linux desktop builds compile the new host handlers).

## 5. What M04-T03 consumes from here

- The mounted bundle (`openMount`) plus the outbox save boundary for the workflow's local-save contract (domain write + pending op together).
- `buildSyncEnvelope`/`envelopeFor` for dispatch; the Dart orchestrator port (drain policy over `PendingOperationSource` + the async transport) is T03's engine work — the drain triggers are already wired to take its drain callback.
- The web outbox driver binding (C1) so the SAME workflow path renders and runs on browser.
- The health surface (`healthSource(accountId:, tenantId:)` → `buildDeviceSyncHealth`) for the sync-status UI.

## 6. Repair record

- **PR #45 follow-up (Android R8)**: the release APK build's `minifyReleaseWithR8` failed with "Missing class com.google.errorprone.annotations.*" — Tink (pulled in by `androidx.security:security-crypto`) references those annotations at class level. Fixed by putting `com.google.errorprone:error_prone_annotations` on the release classpath (build.gradle.kts). No binding behavior changed; the keystore handler and its tests are untouched.
