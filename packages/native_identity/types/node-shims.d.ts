/**
 * Minimal ambient declarations for the Node built-ins and globals this
 * package uses (mirrors packages/native_adapter/types/node-shims.d.ts:
 * pin-free, no @types/node dependency for a zero-install CI check).
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
  function throws(fn: () => unknown, predicateOrMessage?: RegExp | string | ((err: unknown) => boolean), message?: string): void;
  function rejects(
    fn: Promise<unknown> | (() => Promise<unknown>),
    predicateOrMessage?: RegExp | string | ((err: unknown) => boolean) | (new (...args: never[]) => Error),
    message?: string,
  ): Promise<void>;
  export = { ok, equal, notEqual, deepEqual, match, throws, rejects };
}

// Global URL/URLSearchParams ambient surface (Node built-ins used by the
// system-browser sign-in contract; only the members this package touches).
declare class URLSearchParams {
  get(name: string): string | null;
  set(name: string, value: string): void;
}

declare class URL {
  constructor(url: string | URL, base?: string | URL);
  readonly protocol: string;
  readonly host: string;
  readonly pathname: string;
  readonly searchParams: URLSearchParams;
  toString(): string;
}
