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

// --- Tests will be added in subsequent tasks ---

console.log('\n=== SunSmart Unit Tests ===\n');
// (test blocks inserted per task)
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
