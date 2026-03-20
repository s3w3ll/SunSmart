const assert = require('assert');
const path = require('path');

// Stub browser globals so app.js can be required without errors
global.document = { addEventListener: () => {} };
global.localStorage = {};

const {
  getActions,
  getNZLocalDate,
  getNZHourString,
  formatHour,
  getUVLevel,
  getCurrentUVI,
  getDailyPeak,
  getSunSmartWindow,
  getSunscreenTiming,
  isCacheValid,
} = require(path.join(__dirname, '..', 'app.js'));

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${e.message}`);
    failed++;
  }
}

console.log('\n=== SunSmart Unit Tests ===\n');

// ============================================================
// getActions()
// ============================================================
console.log('getActions()');

test('returns active=false when UVI < 3', () => {
  const result = getActions('primary', 2);
  assert.strictEqual(result.active, false);
  assert.deepStrictEqual(result.items, []);
});

test('returns active=true when UVI = 3', () => {
  const result = getActions('primary', 3);
  assert.strictEqual(result.active, true);
  assert.ok(result.items.length > 0, 'should have action items');
});

test('returns active=true when UVI = 8', () => {
  const result = getActions('ec', 8);
  assert.strictEqual(result.active, true);
});

test('EC policy includes babyCallout when active', () => {
  const result = getActions('ec', 4);
  assert.ok(result.babyCallout, 'EC should have babyCallout');
  assert.ok(result.babyCallout.includes('12 months'), 'callout should mention 12 months');
});

test('EC policy has no babyCallout when inactive', () => {
  const result = getActions('ec', 2);
  assert.strictEqual(result.babyCallout, undefined);
});

test('primary policy has no babyCallout', () => {
  const result = getActions('primary', 5);
  assert.strictEqual(result.babyCallout, undefined);
});

test('secondary policy has no babyCallout', () => {
  const result = getActions('secondary', 6);
  assert.strictEqual(result.babyCallout, undefined);
});

test('EC items include written parental permission note', () => {
  const result = getActions('ec', 4);
  const sunscreenItem = result.items.find(i => i.includes('parental permission'));
  assert.ok(sunscreenItem, 'EC should mention parental permission for sunscreen');
});

test('primary items include no-hat consequence', () => {
  const result = getActions('primary', 4);
  const hatItem = result.items.find(i => i.toLowerCase().includes('shade or indoors'));
  assert.ok(hatItem, 'primary should mention shade or indoors for no hat');
});

test('null UVI treated as 0 (inactive)', () => {
  const result = getActions('primary', null);
  assert.strictEqual(result.active, false);
});

test('unknown policyType returns inactive with no items', () => {
  const result = getActions('unknown', 5);
  assert.strictEqual(result.active, false);
  assert.deepStrictEqual(result.items, []);
});

// ============================================================
// UV Data Utilities
// ============================================================

// Helper: build a fake hourlyData with 24 hours (midnight to 11pm)
function makeHourlyData(uvValues) {
  const times = Array.from({ length: 24 }, (_, i) => {
    const h = String(i).padStart(2, '0');
    return `2026-03-20T${h}:00`;
  });
  return { time: times, uv_index: uvValues };
}

console.log('\ngetUVLevel()');
test('UVI 0 → low',       () => assert.strictEqual(getUVLevel(0), 'low'));
test('UVI 2 → low',       () => assert.strictEqual(getUVLevel(2), 'low'));
test('UVI 3 → moderate',  () => assert.strictEqual(getUVLevel(3), 'moderate'));
test('UVI 5 → moderate',  () => assert.strictEqual(getUVLevel(5), 'moderate'));
test('UVI 6 → high',      () => assert.strictEqual(getUVLevel(6), 'high'));
test('UVI 7 → high',      () => assert.strictEqual(getUVLevel(7), 'high'));
test('UVI 8 → very-high', () => assert.strictEqual(getUVLevel(8), 'very-high'));
test('UVI 10 → very-high',() => assert.strictEqual(getUVLevel(10), 'very-high'));
test('UVI 11 → extreme',  () => assert.strictEqual(getUVLevel(11), 'extreme'));
test('null → low',        () => assert.strictEqual(getUVLevel(null), 'low'));

console.log('\nformatHour()');
test('06:00 → 6:00am',  () => assert.strictEqual(formatHour('2026-03-20T06:00'), '6:00am'));
test('12:00 → 12:00pm', () => assert.strictEqual(formatHour('2026-03-20T12:00'), '12:00pm'));
test('13:00 → 1:00pm',  () => assert.strictEqual(formatHour('2026-03-20T13:00'), '1:00pm'));
test('00:00 → 12:00am', () => assert.strictEqual(formatHour('2026-03-20T00:00'), '12:00am'));

console.log('\ngetNZLocalDate()');
test('returns YYYY-MM-DD string', () => {
  const result = getNZLocalDate(Date.now());
  assert.match(result, /^\d{4}-\d{2}-\d{2}$/);
});

console.log('\ngetDailyPeak()');
test('finds peak UVI and time', () => {
  const uvs = Array(24).fill(0);
  uvs[13] = 9.5;
  const data = makeHourlyData(uvs);
  const peak = getDailyPeak(data);
  assert.strictEqual(peak.value, 9.5);
  assert.strictEqual(peak.time, '2026-03-20T13:00');
});
test('returns null when all UVI 0', () => {
  const data = makeHourlyData(Array(24).fill(0));
  assert.strictEqual(getDailyPeak(data), null);
});

console.log('\ngetSunSmartWindow()');
test('returns correct window for hours ≥ 3', () => {
  const uvs = Array(24).fill(0);
  uvs[10] = 3.1; uvs[11] = 5; uvs[12] = 6; uvs[13] = 4; uvs[16] = 3.0;
  const data = makeHourlyData(uvs);
  const w = getSunSmartWindow(data);
  assert.strictEqual(w.start, '2026-03-20T10:00');
  assert.strictEqual(w.end,   '2026-03-20T16:00');
});
test('returns null when no hours ≥ 3', () => {
  const data = makeHourlyData(Array(24).fill(1));
  assert.strictEqual(getSunSmartWindow(data), null);
});
test('treats null UVI as 0 (below threshold)', () => {
  const uvs = Array(24).fill(null);
  uvs[10] = 4;
  const data = makeHourlyData(uvs);
  const w = getSunSmartWindow(data);
  assert.strictEqual(w.start, '2026-03-20T10:00');
  assert.strictEqual(w.end,   '2026-03-20T10:00');
});

console.log('\ngetSunscreenTiming()');
test('applyBy is 20 min before first ≥ 3 hour', () => {
  const uvs = Array(24).fill(0);
  uvs[10] = 4;
  const data = makeHourlyData(uvs);
  const timing = getSunscreenTiming(data);
  const expected = new Date('2026-03-20T10:00').getTime() - 20 * 60 * 1000;
  assert.strictEqual(timing.applyBy.getTime(), expected);
});
test('reapply markers every 2h from first active hour', () => {
  const uvs = Array(24).fill(0);
  uvs[10] = 4; uvs[11] = 5; uvs[12] = 5; uvs[13] = 4;
  const data = makeHourlyData(uvs);
  const timing = getSunscreenTiming(data);
  // Active window 10:00–13:00 → reapply at 10:00 and 12:00 = 2 entries
  assert.strictEqual(timing.reapplyTimes.length, 2);
  const firstReapply = timing.reapplyTimes[0].getTime();
  const firstActive  = new Date('2026-03-20T10:00').getTime();
  assert.strictEqual(firstReapply, firstActive, 'first reapply should be at first active hour');
});
test('returns null when no active hours', () => {
  const data = makeHourlyData(Array(24).fill(0));
  assert.strictEqual(getSunscreenTiming(data), null);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
