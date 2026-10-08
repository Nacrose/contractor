#!/usr/bin/env python3
"""Exercise SQLite crash/durability behavior on the current host OS.

This is an engine-level proof rig. It does not claim to exercise a Flutter
SQLite plugin or the product's eventual persistence adapter.
"""

from __future__ import annotations

import os
import platform
import signal
import sqlite3
import subprocess
import sys
import tempfile
import time
from pathlib import Path


def connect(path: Path, *, timeout: float = 0.2) -> sqlite3.Connection:
    db = sqlite3.connect(path, timeout=timeout)
    db.execute("PRAGMA foreign_keys = ON")
    db.execute("PRAGMA journal_mode = WAL")
    db.execute("PRAGMA synchronous = FULL")
    db.execute(f"PRAGMA busy_timeout = {int(timeout * 1000)}")
    return db


def initialize(path: Path) -> None:
    with connect(path) as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS local_mutations (
              account_id TEXT NOT NULL,
              mutation_id TEXT NOT NULL,
              payload TEXT NOT NULL,
              PRIMARY KEY (account_id, mutation_id)
            );
            CREATE TABLE IF NOT EXISTS pending_operations (
              account_id TEXT NOT NULL,
              operation_id TEXT NOT NULL,
              payload TEXT NOT NULL,
              PRIMARY KEY (account_id, operation_id)
            );
            CREATE TABLE IF NOT EXISTS schema_version (
              version INTEGER NOT NULL
            );
            """
        )
        if db.execute("SELECT COUNT(*) FROM schema_version").fetchone()[0] == 0:
            db.execute("INSERT INTO schema_version VALUES (1)")


def wait_for(path: Path, process: subprocess.Popen[str]) -> None:
    deadline = time.monotonic() + 10
    while not path.exists():
        if process.poll() is not None:
            raise RuntimeError(f"child exited before ready: {process.returncode}")
        if time.monotonic() >= deadline:
            process.kill()
            raise TimeoutError(f"child did not create readiness marker: {path}")
        time.sleep(0.01)


def kill_child(process: subprocess.Popen[str]) -> None:
    process.send_signal(signal.SIGKILL)
    process.wait(timeout=10)


def child_uncommitted(db_path: Path, marker: Path) -> None:
    db = connect(db_path)
    db.execute("BEGIN IMMEDIATE")
    db.execute(
        "INSERT INTO local_mutations VALUES ('acct-a', 'uncommitted', 'draft')"
    )
    marker.touch()
    time.sleep(60)


def child_committed(db_path: Path) -> None:
    db = connect(db_path)
    db.execute("BEGIN IMMEDIATE")
    db.execute(
        "INSERT INTO local_mutations VALUES ('acct-a', 'saved', 'value')"
    )
    db.execute(
        "INSERT INTO pending_operations VALUES ('acct-a', 'op-saved', 'value')"
    )
    db.commit()
    # This output models the save acknowledgement boundary: only after commit.
    print("SAVE_ACK_AFTER_COMMIT", flush=True)
    time.sleep(60)


def child_interrupted_migration(db_path: Path, marker: Path) -> None:
    db = connect(db_path)
    db.execute("BEGIN EXCLUSIVE")
    db.execute("ALTER TABLE local_mutations ADD COLUMN migrated INTEGER DEFAULT 0")
    db.execute("CREATE TABLE interrupted_migration_marker (value TEXT)")
    marker.touch()
    time.sleep(60)


def run_child(mode: str, db_path: Path, marker: Path | None = None) -> None:
    if mode == "uncommitted":
        assert marker is not None
        child_uncommitted(db_path, marker)
    elif mode == "committed":
        child_committed(db_path)
    elif mode == "migration":
        assert marker is not None
        child_interrupted_migration(db_path, marker)
    else:
        raise ValueError(mode)


def spawn(mode: str, db_path: Path, marker: Path | None = None) -> subprocess.Popen[str]:
    args = [sys.executable, str(Path(__file__).resolve()), "--child", mode, str(db_path)]
    if marker is not None:
        args.append(str(marker))
    return subprocess.Popen(args, stdout=subprocess.PIPE, text=True)


def test_process_kill_rolls_back_open_transaction(root: Path) -> None:
    db_path = root / "mid-transaction.sqlite"
    marker = root / "transaction-open"
    initialize(db_path)
    process = spawn("uncommitted", db_path, marker)
    wait_for(marker, process)
    kill_child(process)

    with connect(db_path) as db:
        count = db.execute(
            "SELECT COUNT(*) FROM local_mutations WHERE mutation_id='uncommitted'"
        ).fetchone()[0]
        assert count == 0, f"uncommitted row survived SIGKILL: {count}"
        assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"


def test_acknowledged_commit_survives_process_kill(root: Path) -> None:
    db_path = root / "acknowledged.sqlite"
    initialize(db_path)
    process = spawn("committed", db_path)
    assert process.stdout is not None
    line = process.stdout.readline().strip()
    assert line == "SAVE_ACK_AFTER_COMMIT", f"unexpected child output: {line!r}"
    kill_child(process)

    with connect(db_path) as db:
        mutation = db.execute(
            "SELECT payload FROM local_mutations WHERE account_id='acct-a' AND mutation_id='saved'"
        ).fetchone()
        operation = db.execute(
            "SELECT payload FROM pending_operations WHERE account_id='acct-a' AND operation_id='op-saved'"
        ).fetchone()
        assert mutation == ("value",), f"committed mutation missing: {mutation}"
        assert operation == ("value",), f"atomic pending operation missing: {operation}"
        assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"


def test_interrupted_transactional_migration_recovers(root: Path) -> None:
    db_path = root / "migration.sqlite"
    marker = root / "migration-open"
    initialize(db_path)
    process = spawn("migration", db_path, marker)
    wait_for(marker, process)
    kill_child(process)

    with connect(db_path) as db:
        columns = {row[1] for row in db.execute("PRAGMA table_info(local_mutations)")}
        assert "migrated" not in columns, f"partial migration committed: {columns}"
        table = db.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='interrupted_migration_marker'"
        ).fetchone()
        assert table is None, "partial migration table survived"
        assert db.execute("SELECT version FROM schema_version").fetchone() == (1,)
        assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"


def test_busy_handling_and_retry(root: Path) -> None:
    db_path = root / "busy.sqlite"
    initialize(db_path)
    first = connect(db_path)
    second = connect(db_path, timeout=0.05)
    first.execute("BEGIN IMMEDIATE")
    first.execute("INSERT INTO local_mutations VALUES ('acct-a', 'lock-owner', 'x')")
    saw_busy = False
    try:
        second.execute(
            "INSERT INTO local_mutations VALUES ('acct-a', 'blocked', 'x')"
        )
    except sqlite3.OperationalError as error:
        saw_busy = "locked" in str(error).lower() or "busy" in str(error).lower()
    finally:
        first.commit()
    assert saw_busy, "contending writer did not report SQLITE_BUSY/LOCKED"

    second.execute(
        "INSERT INTO local_mutations VALUES ('acct-a', 'retried', 'x')"
    )
    second.commit()
    assert second.execute(
        "SELECT COUNT(*) FROM local_mutations WHERE mutation_id='retried'"
    ).fetchone()[0] == 1
    first.close()
    second.close()


def test_account_scoped_keys_and_pending_operation(root: Path) -> None:
    db_path = root / "account-isolation.sqlite"
    initialize(db_path)
    with connect(db_path) as db:
        db.execute("BEGIN IMMEDIATE")
        db.execute(
            "INSERT INTO local_mutations VALUES ('acct-a', 'same-id', 'private-a')"
        )
        db.execute(
            "INSERT INTO local_mutations VALUES ('acct-b', 'same-id', 'private-b')"
        )
        db.execute(
            "INSERT INTO pending_operations VALUES ('acct-a', 'outbox-a', 'private-a')"
        )
        db.commit()
        rows = db.execute(
            "SELECT payload FROM local_mutations WHERE account_id='acct-a' AND mutation_id='same-id'"
        ).fetchall()
        assert rows == [("private-a",)], f"account scope leaked: {rows}"
        pending = db.execute(
            "SELECT payload FROM pending_operations WHERE account_id='acct-a' AND operation_id='outbox-a'"
        ).fetchone()
        assert pending == ("private-a",), f"pending operation missing: {pending}"


def test_sqlite_full_error_preserves_previous_work(root: Path) -> None:
    db_path = root / "full.sqlite"
    initialize(db_path)
    with connect(db_path) as db:
        db.execute(
            "INSERT INTO pending_operations VALUES ('acct-a', 'existing', 'must remain')"
        )
        db.commit()
        db.execute("CREATE TABLE IF NOT EXISTS disk_pressure (payload BLOB)")
        db.commit()
        initial_pages = db.execute("PRAGMA page_count").fetchone()[0]
        db.execute(f"PRAGMA max_page_count = {initial_pages + 3}")
        db.execute("BEGIN IMMEDIATE")
        failed = False
        try:
            for _ in range(100):
                db.execute("INSERT INTO disk_pressure VALUES (?)", (os.urandom(8192),))
            db.commit()
        except sqlite3.DatabaseError as error:
            failed = "full" in str(error).lower()
            db.rollback()
        assert failed, "page-limit pressure did not produce SQLITE_FULL"
        assert db.execute(
            "SELECT payload FROM pending_operations WHERE operation_id='existing'"
        ).fetchone() == ("must remain",)
        assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"


def run() -> None:
    with tempfile.TemporaryDirectory(prefix="sqlite-durability-") as temp:
        root = Path(temp)
        tests = [
            test_process_kill_rolls_back_open_transaction,
            test_acknowledged_commit_survives_process_kill,
            test_interrupted_transactional_migration_recovers,
            test_busy_handling_and_retry,
            test_account_scoped_keys_and_pending_operation,
            test_sqlite_full_error_preserves_previous_work,
        ]
        for test in tests:
            test(root)
            print(f"PASS {test.__name__}")

    with tempfile.TemporaryDirectory(prefix="sqlite-config-") as temp:
        path = Path(temp) / "config.sqlite"
        db = connect(path)
        journal = db.execute("PRAGMA journal_mode").fetchone()[0]
        synchronous = db.execute("PRAGMA synchronous").fetchone()[0]
        assert journal.lower() == "wal"
        assert synchronous == 2  # SQLite numeric value for FULL.
        print(f"PASS journal_mode={journal.upper()} synchronous=FULL ({synchronous})")
        print(f"SQLite {sqlite3.sqlite_version}; {platform.platform()}; {platform.machine()}")
        db.close()


if __name__ == "__main__":
    if len(sys.argv) >= 4 and sys.argv[1] == "--child":
        run_child(sys.argv[2], Path(sys.argv[3]), Path(sys.argv[4]) if len(sys.argv) > 4 else None)
    else:
        run()
