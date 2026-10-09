/**
 * Minimal ambient declarations for the Node built-ins this package uses
 * (mirrors packages/platform_contracts/types/node-shims.d.ts approach:
 * pin-free, no @types/node dependency for a zero-install CI check).
 */

declare module "node:test" {
  function test(name: string, fn: () => void | Promise<void>): void;
  export default test;
}

declare module "node:assert/strict" {
  function ok(value: unknown, message?: string): void;
  function equal(actual: unknown, expected: unknown, message?: string): void;
  function deepEqual(actual: unknown, expected: unknown, message?: string): void;
  function match(value: string, regexp: RegExp, message?: string): void;
  function throws(fn: () => unknown, predicateOrMessage?: RegExp | string | ((err: unknown) => boolean), message?: string): void;
  export = { ok, equal, deepEqual, match, throws };
}
