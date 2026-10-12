/**
 * Minimal ambient declarations for Node built-ins in native_workbook.
 * Follows the zero-install repository pattern.
 */

declare module "node:test" {
  export function test(name: string, fn: () => void | Promise<void>): void;
  export default test;
}

declare module "node:assert/strict" {
  export function ok(value: unknown, message?: string): asserts value;
  export function equal(actual: unknown, expected: unknown, message?: string): void;
  export function notEqual(actual: unknown, expected: unknown, message?: string): void;
  export function deepEqual(actual: unknown, expected: unknown, message?: string): void;
  export function match(value: string, regexp: RegExp, message?: string): void;
  export function doesNotMatch(value: string, regexp: RegExp, message?: string): void;
  export function throws(fn: () => unknown, predicateOrMessage?: RegExp | string | ((err: unknown) => boolean), message?: string): void;
  export function rejects(
    fn: Promise<unknown> | (() => Promise<unknown>),
    predicateOrMessage?: RegExp | string | ((err: unknown) => boolean) | (new (...args: never[]) => Error),
    message?: string,
  ): Promise<void>;
  const assert: {
    ok: typeof ok;
    equal: typeof equal;
    notEqual: typeof notEqual;
    deepEqual: typeof deepEqual;
    match: typeof match;
    doesNotMatch: typeof doesNotMatch;
    throws: typeof throws;
    rejects: typeof rejects;
  };
  export default assert;
}

declare module "node:fs" {
  export function readFileSync(path: string): Buffer;
  export function readFileSync(path: string, encoding: string): string;
  export function writeFileSync(path: string, data: Uint8Array | string): void;
  export function readdirSync(path: string): string[];
  export function existsSync(path: string): boolean;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
}

declare module "node:path" {
  export function join(...segments: string[]): string;
  export function resolve(...segments: string[]): string;
  export function dirname(path: string): string;
  export function basename(path: string): string;
}

declare module "node:url" {
  export function fileURLToPath(url: string): string;
}

declare module "node:crypto" {
  export interface Hash {
    update(data: string | Uint8Array): Hash;
    digest(encoding: string): string;
  }
  export function createHash(algorithm: string): Hash;
}

declare module "node:zlib" {
  export function deflateRawSync(buf: Uint8Array | Buffer): Buffer;
  export function inflateRawSync(buf: Uint8Array | Buffer): Buffer;
}

interface Buffer extends Uint8Array {
  readUInt16LE(offset: number): number;
  readUInt32LE(offset: number): number;
  writeUInt16LE(value: number, offset: number): number;
  writeUInt32LE(value: number, offset: number): number;
  copy(target: Buffer | Uint8Array, targetStart?: number, sourceStart?: number, sourceEnd?: number): number;
  toString(encoding?: string, start?: number, end?: number): string;
  subarray(start?: number, end?: number): Buffer;
}

declare const Buffer: {
  alloc(size: number): Buffer;
  from(str: string, encoding?: string): Buffer;
  from(buffer: ArrayBufferLike, byteOffset?: number, length?: number): Buffer;
  concat(list: readonly (Uint8Array | Buffer)[], totalLength?: number): Buffer;
};

