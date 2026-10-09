import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const fixturePath = new URL('../fixtures/platform-parity/semantics/cross-language.json', import.meta.url);
const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));

function parseScaledInteger(input, scale) {
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(input);
  if (!match) throw new TypeError(`invalid decimal: ${input}`);
  const [, sign, whole, rawFraction = ''] = match;
  if (rawFraction.length > scale && /[^0]/.test(rawFraction.slice(scale))) {
    throw new RangeError(`decimal is inexact at scale ${scale}: ${input}`);
  }
  const fraction = rawFraction.slice(0, scale).padEnd(scale, '0');
  const magnitude = BigInt(`${whole}${fraction}`);
  return sign === '-' ? -magnitude : magnitude;
}

function isCoincident(a, b, epsilon) {
  return Math.abs(a[0] - b[0]) <= epsilon && Math.abs(a[1] - b[1]) <= epsilon;
}

function dateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new TypeError(`invalid date-only value: ${value}`);
  const check = new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10);
  if (check !== value) throw new RangeError(`invalid calendar date: ${value}`);
  return value;
}

function utcInstantToDateOnly(value, offsetMinutes) {
  if (!value.endsWith('Z')) throw new TypeError(`instant must be explicit UTC: ${value}`);
  const instant = new Date(value);
  if (Number.isNaN(instant.valueOf())) throw new TypeError(`invalid instant: ${value}`);
  return new Date(instant.valueOf() + offsetMinutes * 60_000).toISOString().slice(0, 10);
}

function weekday(dateString) {
  return new Date(`${dateString}T00:00:00.000Z`).getUTCDay() || 7;
}

function workdaysBetween(from, to, workDays) {
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const finish = Date.parse(`${to}T00:00:00.000Z`);
  if (start > finish) return -workdaysBetween(to, from, workDays);
  let count = 0;
  for (let cursor = start + 86_400_000; cursor <= finish; cursor += 86_400_000) {
    const day = new Date(cursor).getUTCDay() || 7;
    if (workDays.includes(day)) count++;
  }
  return count;
}

for (const item of fixture.decimalCases) {
  if (item.reject) {
    assert.throws(() => parseScaledInteger(item.input, fixture.contracts.money.scale));
  } else {
    assert.equal(parseScaledInteger(item.input, fixture.contracts.money.scale).toString(), item.expectedScaled);
  }
}

for (const item of fixture.geometryCases) {
  assert.equal(
    isCoincident(item.a, item.b, fixture.contracts.geometry.epsilon),
    item.expectedCoincident,
    item.id,
  );
}

for (const item of fixture.dateCases) {
  const result = item.kind === 'date-only'
    ? dateOnly(item.input)
    : utcInstantToDateOnly(item.input, fixture.contracts.calendar.utcOffsetMinutes);
  assert.equal(result, item.expectedDate, item.id);
}

for (const item of fixture.calendarCases) {
  const between = workdaysBetween(
    item.from,
    item.to,
    fixture.contracts.calendar.workingDaysOfWeek,
  );
  const inclusiveDuration = between + Number(
    fixture.contracts.calendar.workingDaysOfWeek.includes(weekday(item.from)),
  );
  assert.equal(between, item.expectedWorkingDaysBetween, item.id);
  assert.equal(inclusiveDuration, item.expectedInclusiveTaskDuration, item.id);
}

console.log(
  `PASS shared semantics fixtures (${fixture.decimalCases.length} decimal, ` +
    `${fixture.geometryCases.length} geometry, ${fixture.dateCases.length} date, ` +
    `${fixture.calendarCases.length} calendar)`,
);
