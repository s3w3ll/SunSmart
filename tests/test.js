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

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
