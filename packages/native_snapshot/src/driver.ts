/**
 * SQLite driver port and error mapping (M03-T05; mirrors the M03-T03/T04
 * driver verbatim by design — one structural SqlDriver port per zero-dep
 * package).
 *
 * The port mirrors the `node:sqlite` DatabaseSync surface structurally so
 * the package has zero dependencies and the tests run against REAL SQLite
 * (Node built-in). The app mount binds the same shape to its native driver
 * (e.g. sqflite_common_ffi / Drift underneath) without changing this code.
 *
 * Durability policy (carried over from the M01-T13 engine rig): WAL paired
 * with synchronous=FULL — WAL alone is NOT durability evidence — plus
 * foreign_keys=ON and a bounded busy_timeout.
 */

import { RepositoryError, repositoryError } from "./contract.js";

export interface SqlStatement {
  run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  all(...params: unknown[]): Record<string, unknown>[];
  get(...params: unknown[]): Record<string, unknown> | undefined;
}

export interface SqlDriver {
  exec(sql: string): void;
  prepare(sql: string): SqlStatement;
}

export const SNAPSHOT_PRAGMAS = {
  journalMode: "PRAGMA journal_mode=WAL",
  synchronous: "PRAGMA synchronous=FULL",
  foreignKeys: "PRAGMA foreign_keys=ON",
} as const;

/**
 * Map a driver error to a typed repository kind. SQLite result codes:
 * 5=BUSY, 6=LOCKED, 11=CORRUPT, 13=FULL, 19=CONSTRAINT, 26=NOTADB.
 * `errcode` may be an EXTENDED code (e.g. 787 = FK constraint); mask with
 * 0xff to reach the primary code before mapping.
 */
export function mapSqliteError(e: unknown): RepositoryError {
  const err = e as { errcode?: number; code?: string; message?: string };
  const rawCode = typeof err?.errcode === "number" ? err.errcode : undefined;
  const errcode = rawCode === undefined ? undefined : rawCode & 0xff;
  const message = typeof err?.message === "string" ? err.message : String(e);
  switch (errcode) {
    case 5:
      return repositoryError("busy", "SQLite busy: another writer holds the database beyond busy_timeout.", { sqlite: message });
    case 6:
      return repositoryError("locked", "SQLite locked: a competing connection holds the needed lock.", { sqlite: message });
    case 11:
      return repositoryError("corrupt", "SQLite reported database corruption.", { sqlite: message });
    case 13:
      return repositoryError("full", "SQLite database or disk is full; the write was not acknowledged.", { sqlite: message });
    case 19:
      return repositoryError("constraint", "SQLite constraint violation.", { sqlite: message });
    case 26:
      return repositoryError("notadb", "File is not a SQLite database (header invalid); treating as corruption.", { sqlite: message });
    default:
      return repositoryError("internal", `SQLite driver error: ${message}`);
  }
}

/**
 * Run `fn` inside BEGIN IMMEDIATE ... COMMIT, rolling back on any throw.
 * `onTxOpen` (if provided) is called after BEGIN and before fn — used by
 * the crash-recovery child to signal "transaction is open" to the parent.
 * Returns fn's result; rethrows mapped RepositoryErrors after rollback.
 */
export function withImmediateTransaction<T>(
  driver: SqlDriver,
  fn: () => T,
  onTxOpen?: () => void,
): T {
  driver.exec("BEGIN IMMEDIATE");
  onTxOpen?.();
  try {
    const result = fn();
    driver.exec("COMMIT");
    return result;
  } catch (e) {
    try {
      driver.exec("ROLLBACK");
    } catch {
      // A killed/corrupted connection may not even roll back; the reopen
      // path (integrity check + WAL recovery) is the recovery boundary.
    }
    throw e instanceof RepositoryError ? e : mapSqliteError(e);
  }
}

/** True when the driver already sits inside our explicit transaction. */
export class TxGuard {
  private depth = 0;
  enter(): void {
    if (this.depth > 0) {
      throw repositoryError("misconfigured", "Nested transaction attempted; an operation is already in progress.");
    }
    this.depth += 1;
  }
  exit(): void {
    this.depth = Math.max(0, this.depth - 1);
  }
  get active(): boolean {
    return this.depth > 0;
  }
}
