/**
 * Change-Feed Spike Database Client & Transaction Simulator
 *
 * Supports two operating modes:
 * 1. Live PostgreSQL mode (via psql child process / local instance)
 * 2. Deterministic ACID Simulation mode (pure in-memory with exact transaction interleaving)
 */
import { execSync, spawn } from "node:child_process";

export class MockPgClient {
  constructor() {
    this.sequences = new Map();
    this.tables = new Map();
    this.activeTxns = new Map(); // txId -> { pendingInserts: [] }
    this.committedLog = []; // { txId, commitLsn, committedAt, entries: [] }
    this.currentLsn = 1000n;
    this.nextTxId = 1;
  }

  nextSequence(seqName) {
    const val = (this.sequences.get(seqName) || 0) + 1;
    this.sequences.set(seqName, val);
    return val;
  }

  beginTransaction() {
    const txId = this.nextTxId++;
    const tx = {
      txId,
      startedAt: Date.now(),
      pendingInserts: []
    };
    this.activeTxns.set(txId, tx);
    return txId;
  }

  insert(txId, tableName, record) {
    const tx = this.activeTxns.get(txId);
    if (!tx) throw new Error(`Transaction ${txId} not found`);
    tx.pendingInserts.push({ tableName, record });
  }

  commit(txId) {
    const tx = this.activeTxns.get(txId);
    if (!tx) throw new Error(`Transaction ${txId} not found`);

    this.currentLsn += 100n;
    const commitLsn = this.currentLsn;
    const committedAt = Date.now();

    for (const item of tx.pendingInserts) {
      if (!this.tables.has(item.tableName)) {
        this.tables.set(item.tableName, []);
      }
      const committedRow = {
        ...item.record,
        _txId: txId,
        _commitLsn: commitLsn,
        _committedAt: committedAt
      };
      this.tables.get(item.tableName).push(committedRow);
    }

    this.committedLog.push({
      txId,
      commitLsn,
      committedAt,
      operations: [...tx.pendingInserts]
    });

    this.activeTxns.delete(txId);
    return { commitLsn, committedAt };
  }

  rollback(txId) {
    this.activeTxns.delete(txId);
  }

  query(tableName, predicate = () => true) {
    const rows = this.tables.get(tableName) || [];
    return rows.filter(predicate);
  }
}

export function isLocalPostgresAvailable() {
  try {
    const out = execSync("pg_isready -t 1", { stdio: "pipe" }).toString();
    return out.includes("accepting connections");
  } catch {
    return false;
  }
}

export function runPsql(sql, dbName = "postgres") {
  try {
    const stdout = execSync(`psql -d ${dbName} -t -A -F"," -c "${sql.replace(/"/g, '\\"')}"`, {
      stdio: "pipe"
    }).toString().trim();
    return stdout;
  } catch (err) {
    throw new Error(`psql error: ${err.message}`);
  }
}
