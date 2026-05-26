// test-worker.js — Unit tests for Worker helper functions

function isWithinNotifyWindow(date) {
  const nzHour = parseInt(
    new Intl.DateTimeFormat('en-NZ', {
      timeZone: 'Pacific/Auckland',
      hour: 'numeric',
      hour12: false,
    }).format(date),
    10
  );
  return nzHour >= 9 && nzHour < 16;
}

function shouldNotify(lastUV, currentUV) {
  return lastUV < 3 && currentUV >= 3;
}

// ─────────────────────────────────────────────────
// Test cases
// ─────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    passed++;
    console.log(`✓ ${testName}`);
  } else {
    failed++;
    console.log(`✗ ${testName}`);
  }
}

// Test isWithinNotifyWindow
console.log('\n--- isWithinNotifyWindow ---');

// 9am NZST → should be true
const sep1_9am = new Date('2025-09-01T21:00:00Z'); // 9am NZST (UTC+12)
assert(isWithinNotifyWindow(sep1_9am) === true, '9am NZST is within window');

// 3:59pm NZST → should be true
const sep1_3_59pm = new Date('2025-09-01T03:59:00Z'); // 3:59pm NZST
assert(isWithinNotifyWindow(sep1_3_59pm) === true, '3:59pm NZST is within window');

// 4:00pm NZST → should be false
const sep1_4pm = new Date('2025-09-01T04:00:00Z'); // 4:00pm NZST
assert(isWithinNotifyWindow(sep1_4pm) === false, '4:00pm NZST is outside window');

// 8:59am NZST → should be false
const sep1_8_59am = new Date('2025-09-01T20:59:00Z'); // 8:59am NZST
assert(isWithinNotifyWindow(sep1_8_59am) === false, '8:59am NZST is outside window');

// Test shouldNotify
console.log('\n--- shouldNotify ---');

// UV crossing from 2.9 to 3.0 → should be true
assert(shouldNotify(2.9, 3.0) === true, 'UV crosses 3.0 threshold from below');

// UV crossing from 0 to 5 → should be true
assert(shouldNotify(0, 5) === true, 'UV goes from 0 to 5 (should notify)');

// UV stays at 3 → should be false
assert(shouldNotify(3, 3) === false, 'UV stays at 3 (no cross, no notify)');

// UV stays at 5 → should be false
assert(shouldNotify(5, 5) === false, 'UV stays at 5 (no cross, no notify)');

// UV drops from 4 to 2 → should be false
assert(shouldNotify(4, 2) === false, 'UV drops below 3 (no notify)');

// UV resets from 0 to 3 → should be true
assert(shouldNotify(0, 3) === true, 'UV goes from 0 to 3 (should notify)');

// ─────────────────────────────────────────────────
// Results
// ─────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
