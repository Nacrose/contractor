/**
 * Minimal ambient declarations for Node built-ins in native_scheduling.
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
  export function throws(
    fn: () => unknown,
    predicateOrMessage?: RegExp | string | ((err: unknown) => boolean) | (new (...args: never[]) => Error),
    message?: string
  ): void;
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
