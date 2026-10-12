/**
 * Ambient declarations for Node built-ins in native_documents (M12).
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
    predicateOrMessage?: RegExp | string | ((err: any) => boolean) | (new (...args: never[]) => Error),
    message?: string
  ): void;
  export function rejects(
    fn: Promise<unknown> | (() => Promise<unknown>),
    predicateOrMessage?: RegExp | string | ((err: any) => boolean) | (new (...args: never[]) => Error),
    message?: string
  ): Promise<void>;
  export function doesNotThrow(fn: () => unknown, message?: string): void;
  const assert: {
    ok: typeof ok;
    equal: typeof equal;
    notEqual: typeof notEqual;
    deepEqual: typeof deepEqual;
    match: typeof match;
    doesNotMatch: typeof doesNotMatch;
    throws: typeof throws;
    doesNotThrow: typeof doesNotThrow;
    rejects: typeof rejects;
  };
  export default assert;
}

declare module "node:crypto" {
  export interface Hash {
    update(data: string | any | Uint8Array): Hash;
    digest(encoding?: string): string;
  }
  export function createHash(algorithm: string): Hash;
  export function randomUUID(): string;
  export function randomBytes(size: number): any;
}
