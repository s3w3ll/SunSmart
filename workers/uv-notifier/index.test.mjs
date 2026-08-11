// Lightweight test for the Worker's pure NIWA adapter functions.
// Run with: node workers/uv-notifier/index.test.mjs
// (No test runner dependency — mirrors the style of tests/test.js.)

import assert from 'node:assert';
import { adaptNiwaCurrentUV, nzHourKey } from './index.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message}`);
    failed++;
  }
}

console.log('\nnzHourKey()');

test('formats NZ-local date+hour as YYYY-MM-DDTHH', () => {
  // 2026-08-05T23:00:00Z = 2026-08-06T11:00 NZST (+12h, no DST in August)
  assert.strictEqual(nzHourKey(new Date('2026-08-05T23:00:00Z')), '2026-08-06T11');
});

test('folds the 24:00 midnight edge case to 00 of the same nominal day', () => {
  // 2026-08-05T11:00:00Z = 2026-08-05T23:00 NZST; one hour later rolls into
  // 2026-08-06T00:00 NZST but Intl with hour: '2-digit' reports it as "24"
  // for the *previous* nominal day unless folded — this pins that behaviour.
  const justBeforeMidnightNZ = new Date('2026-08-05T11:59:00Z');
  const justAfterMidnightNZ = new Date('2026-08-05T12:01:00Z');
  assert.strictEqual(nzHourKey(justBeforeMidnightNZ), '2026-08-05T23');
  assert.strictEqual(nzHourKey(justAfterMidnightNZ), '2026-08-06T00');
});

console.log('\nadaptNiwaCurrentUV()');

const FIXTURE_NOW = new Date('2026-08-05T23:00:00Z'); // = 2026-08-06T11:00 NZST

const niwaFixture = {
  coord: 'EPSG:4326,-41.28,174.78',
  products: [
    {
      name: 'cloudy_sky_uv_index',
      values: [
        { time: '2026-08-05T22:00:00Z', value: 2.5 },  // 2026-08-06T10:00 NZST
        { time: '2026-08-05T23:00:00Z', value: 3.14 }, // 2026-08-06T11:00 NZST — matches FIXTURE_NOW
        { time: '2026-08-06T00:00:00Z', value: 3.6 },  // 2026-08-06T12:00 NZST
        { time: '2026-08-06T23:00:00Z', value: 9.9 },  // 2026-08-07T11:00 NZST — next day, must not match
      ],
    },
    {
      name: 'clear_sky_uv_index',
      values: [
        { time: '2026-08-05T23:00:00Z', value: 5.0 }, // deliberately different from cloudy
      ],
    },
  ],
};

test('picks the value matching the current NZ date+hour, rounded to 1dp', () => {
  assert.strictEqual(adaptNiwaCurrentUV(niwaFixture, FIXTURE_NOW), 3.1);
});

test('picks cloudy_sky_uv_index, not clear_sky_uv_index', () => {
  const result = adaptNiwaCurrentUV(niwaFixture, FIXTURE_NOW);
  assert.notStrictEqual(result, 5.0);
});

test('does not match a same-hour-number value from a different NZ calendar day', () => {
  // 2026-08-06T23:00:00Z is 2026-08-07T11:00 NZST — same "11" hour number as
  // FIXTURE_NOW's match, but a different day. A naive hour-only comparison
  // (the bug this replaces) would wrongly accept it.
  const tomorrowSameHour = new Date('2026-08-06T23:00:00Z');
  assert.strictEqual(adaptNiwaCurrentUV(niwaFixture, tomorrowSameHour), 9.9);
  assert.notStrictEqual(adaptNiwaCurrentUV(niwaFixture, FIXTURE_NOW), adaptNiwaCurrentUV(niwaFixture, tomorrowSameHour));
});

test('returns null when no value matches the current NZ hour', () => {
  const noMatch = new Date('2026-08-09T00:00:00Z');
  assert.strictEqual(adaptNiwaCurrentUV(niwaFixture, noMatch), null);
});

test('returns null when cloudy_sky_uv_index is missing', () => {
  const noProduct = { coord: 'x', products: [niwaFixture.products[1]] }; // clear_sky only
  assert.strictEqual(adaptNiwaCurrentUV(noProduct, FIXTURE_NOW), null);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exitCode = 1;
