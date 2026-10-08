# M01 cross-language semantics parity

## Result

The shared semantic fixtures pass in the Dart prototype and in an independent JavaScript reference runner. This verifies the decimal, geometry-tolerance, and Nepal calendar contracts for those two executable implementations.

This is **not** a pass of the requested FFI/Wasm/server parity gate. The repository does not contain executable Rust FFI, Wasm kernel, or server TypeScript implementations for these semantics. The similarly named benchmark adapters in the prototype delegate to the same Dart kernel, so their matching outputs cannot be counted as independent parity evidence. The missing targets leave cross-language parity unproven and block adoption of a multi-language kernel. M01-T16 must apply the precommitted cross-language fallback: use one authoritative implementation and record the row as triggered, subject to the owner architecture decision at M01-T17.

## Executed evidence

The fixture source is [`fixtures/platform-parity/semantics/cross-language.json`](../../../fixtures/platform-parity/semantics/cross-language.json). It defines exact decimal strings at scale 2, absolute per-axis geometry comparison at epsilon `0.00001 mm`, date-only preservation, explicit UTC instant conversion to `Asia/Kathmandu` (UTC+05:45), Nepal Sunday–Friday workdays, `(from, to]` workday differences, and task duration including a working start date.

| Implementation | Command | Result |
| --- | --- | --- |
| JavaScript fixture runner | `node scripts/test-semantic-parity.mjs` | PASS: 5 decimal, 4 geometry, 2 date, 1 calendar cases |
| Dart prototype | `flutter test test/semantic_parity_test.dart` from `prototype/construction_client/` | PASS: 12 tests; exercises the exact decimal parser, existing geometry tolerance, CPM calendar, and shared fixture values |
| Repository protocol linter | `node scripts/lint-protocol.mjs` | PASS: all 12 milestone files and 118 task definitions valid |
| Whitespace validation | `git diff --check` | PASS |

The JavaScript runner is an independent implementation of the fixture contracts, not the absent server TypeScript candidate. It uses `BigInt` for exact scaled decimals and UTC arithmetic with the fixture's explicit Kathmandu offset; it does not depend on host timezone configuration.

## Target inventory and limits

- **Dart:** present. The test calls the current prototype's decimal helper, `TolerancePolicy.isCoincident`, and `CpmCalendar.workingDaysBetween`, and checks the inclusive task-duration convention.
- **JavaScript:** present as a standalone fixture runner and reference semantics implementation. This is not evidence for the production server candidate.
- **Rust FFI:** absent from the repository; no Rust source or build manifest is present for these candidate kernels.
- **Wasm kernel:** absent as an independent kernel. A Flutter web build is not evidence of a separate Rust/Wasm implementation.
- **Server TypeScript kernel:** absent from the tracked repository. The benchmark classes named `ServerCpmSimulatedKernel` and `RustCpmBridgeSimulatedKernel` call the same Dart inner kernel; analogous Rust-named CAD and worksheet benchmark adapters also delegate to Dart. These wrappers cannot establish independent cross-language equivalence.

Therefore no claim is made that decimal, geometry, or date behavior is identical across FFI, Wasm, and server targets. The report supplies reproducible fixture evidence for available implementations and records the failed multi-language adoption gate for M01-T16 and the M01 owner decision. No production cutover is implied.
