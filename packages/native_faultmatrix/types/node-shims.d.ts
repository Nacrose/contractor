/**
 * Minimal ambient declarations for the Node built-ins and globals this
 * package uses (pin-free, no @types/node dependency for a zero-install CI
 * check — mirrors the other packages' node-shims pattern).
 *
 * Runtime requirement: `node:sqlite` needs Node >= 22.5 (unflagged >= 23.4).
 * CI runs this check on Node 24 via a dedicated setup-node step.
 */

declare module "node:test" {
  function test(name: string, fn: () => void | Promise<void>): void;
  export default test;
}

declare module "node:assert/strict" {
  function ok(value: unknown, message?: string): void;
  function equal(actual: unknown, expected: unknown, message?: string): void;
  function notEqual(actual: unknown, expected: unknown, message?: string): void;
  function deepEqual(actual: unknown, expected: unknown, message?: string): void;
  function match(value: string, regexp: RegExp, message?: string): void;
  function doesNotMatch(value: string, regexp: RegExp, message?: string): void;
  function throws(fn: () => unknown, predicateOrMessage?: RegExp | string | ((err: unknown) => boolean), message?: string): void;
  function rejects(
    fn: Promise<unknown> | (() => Promise<unknown>),
    predicateOrMessage?: RegExp | string | ((err: unknown) => boolean) | (new (...args: never[]) => Error),
    message?: string,
  ): Promise<void>;
  export = { ok, equal, notEqual, deepEqual, match, doesNotMatch, throws, rejects };
}

declare module "node:sqlite" {
  export interface StatementResult {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  }
  export interface StatementSync {
    run(...params: unknown[]): StatementResult;
    all(...params: unknown[]): Record<string, unknown>[];
    get(...params: unknown[]): Record<string, unknown> | undefined;
  }
  export class DatabaseSync {
    constructor(path: string, options?: { open?: boolean });
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
  export class SqliteError extends Error {
    /** Node-level error code, e.g. `ERR_SQLITE_ERROR`. */
    code: string;
    /** SQLite result code number (5=BUSY, 6=LOCKED, 11=CORRUPT, 13=FULL, 19=CONSTRAINT, 26=NOTADB). */
    errcode: number;
    /** SQLite result code message. */
    errstr: string;
  }
}

declare module "node:fs" {
  export function mkdtempSync(prefix: string): string;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
  export function openSync(path: string, flags: string): number;
  export function readSync(fd: number, buffer: Uint8Array, offset: number, length: number, position: number | null): number;
  export function writeSync(fd: number, buffer: Uint8Array, offset?: number, length?: number, position?: number | null): number;
  export function fsyncSync(fd: number): void;
  export function closeSync(fd: number): void;
  export function renameSync(from: string, to: string): void;
  export function statSync(path: string): { size: number; isFile(): boolean };
  export function unlinkSync(path: string): void;
  export function existsSync(path: string): boolean;
  export function rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void;
  export function readdirSync(path: string): string[];
  export function readFileSync(path: string): Uint8Array;
  export function writeFileSync(path: string, data: Uint8Array | string): void;
}

declare module "node:crypto" {
  export interface Hash {
    update(data: Uint8Array): Hash;
    digest(encoding: "hex"): string;
  }
  export function createHash(algorithm: string): Hash;
}

declare module "node:path" {
  export function join(...segments: string[]): string;
  export function dirname(path: string): string;
  export function basename(path: string): string;
}

declare module "node:url" {
  export function fileURLToPath(url: string): string;
}

declare module "node:os" {
  export function tmpdir(): string;
}

declare module "node:child_process" {
  export interface ChildProcess {
    pid?: number;
    stdout: { on(event: "data", listener: (chunk: string | Uint8Array) => void): void };
    stderr: { on(event: "data", listener: (chunk: string | Uint8Array) => void): void };
    on(event: string, listener: (...args: unknown[]) => void): void;
    kill(signal?: string): boolean;
  }
  export function spawn(command: string, args: string[], options?: { cwd?: string }): ChildProcess;
}

// Global `process` surface used by the crash-recovery tests only.
declare var process: {
  version: string;
  execPath: string;
  argv: string[];
  pid: number;
  env: Record<string, string | undefined>;
  cwd(): string;
  exit(code?: number): never;
  kill(pid: number, signal?: string): boolean;
};

// Globals used by the tests and the crash child (Node built-ins).
declare var TextEncoder: {
  new (): { encode(input: string): Uint8Array };
};
declare function setTimeout(handler: () => void, timeout: number): unknown;
declare function clearTimeout(id: unknown): void;
declare function setInterval(handler: () => void, timeout: number): unknown;
declare function clearInterval(id: unknown): void;

declare module "pg" {
  export class Client {
    constructor(opts?: Record<string, unknown>);
    connect(): Promise<void>;
    query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
    end(): Promise<void>;
  }
}

declare module "node:module" {
  export function createRequire(filename: string | URL): (id: string) => unknown;
}

declare module "pg" {
  export class Client {
    constructor(opts?: Record<string, unknown>);
    connect(): Promise<void>;
    query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
    end(): Promise<void>;
  }
}
