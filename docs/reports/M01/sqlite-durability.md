# M01-T13: Native SQLite durability proof

**Status:** SQLite engine-level durability rig passes on the local macOS runner; native Flutter adapter integration remains unverified.

## Scope and environment

The tracked `prototype/construction_client` storage adapter is an in-memory browser implementation, and its `pubspec.yaml` has no native SQLite package. This task therefore adds a standalone SQLite engine test rig at [`prototype/construction_client/tool/sqlite_durability_harness.py`](../../../prototype/construction_client/tool/sqlite_durability_harness.py). It opens real on-disk databases using Python's standard `sqlite3` module and the host's native SQLite library. It does not claim to exercise Drift, `sqflite_common_ffi`, Flutter transaction callbacks, or a shipping app.

Local run environment:

- macOS 27.0, Apple Silicon arm64 (real Mac runner)
- Python 3.14.4; SQLite 3.50.4
- `PRAGMA journal_mode=WAL`, `PRAGMA synchronous=FULL` (SQLite value `2`), `busy_timeout=200 ms`, and foreign keys enabled for every connection
- Flutter SDK, Xcode, iOS simulator and Android device tools are unavailable in this environment; no mobile-device run is claimed

## Evidence

Run with:

```sh
python3 prototype/construction_client/tool/sqlite_durability_harness.py
```

Exit code: **0**. The local output was:

```text
PASS test_process_kill_rolls_back_open_transaction
PASS test_acknowledged_commit_survives_process_kill
PASS test_interrupted_transactional_migration_recovers
PASS test_busy_handling_and_retry
PASS test_account_scoped_keys_and_pending_operation
PASS test_sqlite_full_error_preserves_previous_work
PASS journal_mode=WAL synchronous=FULL (2)
SQLite 3.50.4; macOS-27.0-arm64-arm-64bit-Mach-O; arm64
```

The rig starts separate writer processes and sends `SIGKILL` while a transaction or schema migration is open. On reopening, SQLite rolls back the uncommitted row/DDL and passes `PRAGMA integrity_check`. In the acknowledged-save case, the child commits a local mutation and its pending operation in one transaction, prints the acknowledgement only after `commit()` returns, is killed immediately, and both rows remain after restart. The contention case observes a busy/locked error while another writer owns the transaction, then retries successfully after release. The account-key case verifies identical mutation IDs remain scoped by account.

Disk-full semantics are exercised with SQLite's `max_page_count` limit: the write returns `SQLITE_FULL`, the failed transaction is rolled back, previously committed pending work remains, and integrity checking passes. This simulates SQLite's full-database error path without filling the host disk.

The harness is also added to the existing protocol/code-quality CI job so the same on-disk checks run on a clean Linux GitHub Actions runner.

## Limits and follow-up

- The local test proves SQLite engine behavior, not the configuration or error propagation of a Flutter database package. The app's native repository must still set and verify its journal/synchronization policy, keep mutations and outbox rows in one transaction, and surface `SQLITE_FULL` before acknowledging a save.
- `max_page_count` covers SQLite's `SQLITE_FULL` behavior; a real OS-level `ENOSPC` condition and sudden power loss were not induced.
- Only one local macOS runner and the Linux CI runner are covered here. No physical iOS/Android device was available, and the Flutter app did not run against SQLite.
- WAL is paired with `synchronous=FULL`; WAL mode by itself is not treated as durability evidence.

