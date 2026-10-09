import { readFile } from 'node:fs/promises';
import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import {
  DateOnlySchema,
  ExactDecimalSchema,
  UtcInstantSchema,
} from '../gen/typescript/contractor/platform/contracts/v1/semantics_pb.js';

type DecimalCase = {
  id: string;
  input: string;
  expectedScaled?: string;
  reject?: boolean;
};

type DateCase = {
  id: string;
  kind: 'date-only' | 'utc-instant';
  input: string;
  expectedDate: string;
};

function expectEqual(actual: unknown, expected: unknown, context: string): void {
  if (actual !== expected) {
    throw new Error(`${context}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function expectThrows(action: () => unknown, context: string): void {
  try {
    action();
  } catch {
    return;
  }
  throw new Error(`${context}: expected rejection`);
}

function parseScaledInteger(input: string, scale: number): bigint {
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(input);
  if (!match) throw new TypeError(`invalid decimal: ${input}`);
  const [, sign, whole, rawFraction = ''] = match;
  if (rawFraction.length > scale && /[^0]/u.test(rawFraction.slice(scale))) {
    throw new RangeError(`decimal is inexact at scale ${scale}: ${input}`);
  }
  const magnitude = BigInt(`${whole}${rawFraction.slice(0, scale).padEnd(scale, '0')}`);
  return sign === '-' ? -magnitude : magnitude;
}

function utcInstantToDateOnly(input: string, offsetMinutes: number): string {
  if (!input.endsWith('Z')) throw new Error(`UTC instant must have a Z suffix: ${input}`);
  const instant = new Date(input);
  if (Number.isNaN(instant.valueOf())) throw new Error(`invalid UTC instant: ${input}`);
  return new Date(instant.valueOf() + offsetMinutes * 60_000).toISOString().slice(0, 10);
}

const fixture = JSON.parse(
  await readFile('../../fixtures/platform-parity/semantics/cross-language.json', 'utf8'),
);
const scale = fixture.contracts.money.scale as number;
const decimalCases = fixture.decimalCases as DecimalCase[];

for (const row of decimalCases) {
  if (row.reject) {
    expectThrows(() => parseScaledInteger(row.input, scale), row.id);
    continue;
  }
  expectEqual(parseScaledInteger(row.input, scale).toString(), row.expectedScaled, row.id);
  const decoded = fromBinary(
    ExactDecimalSchema,
    toBinary(ExactDecimalSchema, create(ExactDecimalSchema, { value: row.input })),
  );
  expectEqual(decoded.value, row.input, `${row.id} Protobuf round-trip`);
}

const offsetMinutes = fixture.contracts.calendar.utcOffsetMinutes as number;
const dateCases = fixture.dateCases as DateCase[];
for (const row of dateCases) {
  if (row.kind === 'date-only') {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(row.input)) throw new Error(`${row.id}: invalid date-only form`);
    expectEqual(
      new Date(`${row.input}T00:00:00.000Z`).toISOString().slice(0, 10),
      row.input,
      `${row.id} valid calendar date`,
    );
    const decoded = fromBinary(
      DateOnlySchema,
      toBinary(DateOnlySchema, create(DateOnlySchema, { isoDate: row.input })),
    );
    expectEqual(decoded.isoDate, row.input, `${row.id} Protobuf round-trip`);
    expectEqual(decoded.isoDate, row.expectedDate, row.id);
  } else {
    expectEqual(utcInstantToDateOnly(row.input, offsetMinutes), row.expectedDate, row.id);
    const decoded = fromBinary(
      UtcInstantSchema,
      toBinary(UtcInstantSchema, create(UtcInstantSchema, { rfc3339Utc: row.input })),
    );
    expectEqual(decoded.rfc3339Utc, row.input, `${row.id} Protobuf round-trip`);
  }
}

console.log(`PASS TypeScript Protobuf semantics (${decimalCases.length} decimal, ${dateCases.length} date cases)`);
