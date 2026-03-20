# SunSmart Webapp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a three-file static webapp (index.html / style.css / app.js) that shows NZ school staff their SunSmart UV obligations for the current day.

**Architecture:** Pure static site — no build step, no backend, no framework. All logic lives in `app.js`, organised into clearly named sections. Pure functions expose themselves via a conditional `module.exports` block so they can be unit-tested with Node.js. State persists in `localStorage`. A single `init()` function drives the boot sequence.

**Tech Stack:** HTML5, CSS3 (custom properties), Vanilla JS ES2020, Chart.js 4 + chartjs-plugin-annotation (CDN), Open-Meteo API (no key), Nominatim geocoding (no key).

---

## File Map

| File | Responsibility |
|------|----------------|
| `index.html` | App shell — semantic structure, CDN `<script>` tags, accessibility landmarks |
| `style.css` | Mobile-first layout, UV severity colour tokens as CSS custom properties, all component styles |
| `app.js` | Config, policy engine, UV utilities, cache/state, API calls, rendering, boot sequence |
| `tests/test.js` | Node.js unit tests for all pure logic functions |

---

## Task 1: Project Scaffold

**Files:**
- Create: `index.html`
- Create: `style.css`
- Create: `app.js`
- Create: `tests/test.js`

- [ ] **Step 1: Create `index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SunSmart UV — NZ Schools</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>

  <!-- Location selector (shown full-screen when no location saved) -->
  <div id="location-selector" class="location-selector hidden" role="main" aria-label="Location setup">
    <div class="location-selector__inner">
      <h1 class="app-title">☀️ SunSmart UV</h1>
      <p class="location-selector__prompt">Find your school's UV level</p>
      <div class="search-box">
        <input
          id="address-input"
          type="search"
          placeholder="Search suburb or school address…"
          autocomplete="off"
          aria-label="Search for your school address"
          aria-autocomplete="list"
          aria-controls="address-results"
        />
        <ul id="address-results" class="search-results hidden" role="listbox" aria-label="Address suggestions"></ul>
      </div>
      <div class="divider"><span>or</span></div>
      <button id="gps-btn" class="btn btn--secondary" type="button">
        📍 Use my current location
      </button>
      <p id="location-error" class="error-text hidden" role="alert"></p>
    </div>
  </div>

  <!-- Main app (shown after location is set) -->
  <main id="app" class="app hidden" aria-label="SunSmart UV dashboard">

    <!-- UV Data Card -->
    <section id="uv-card" class="uv-card" aria-label="UV index summary">
      <div class="uv-card__header">
        <span id="location-label" class="location-label"></span>
        <button id="change-location-btn" class="btn-link" type="button" aria-label="Change location">change</button>
      </div>
      <div class="uv-card__body">
        <div class="uv-card__index-wrap">
          <span class="uv-card__label">Forecast UV</span>
          <span id="uv-current" class="uv-card__index" aria-live="polite">–</span>
          <span id="uv-level" class="uv-card__level"></span>
        </div>
        <div class="uv-card__meta">
          <p id="uv-peak" class="uv-card__meta-line"></p>
          <p id="uv-window" class="uv-card__meta-line"></p>
          <p id="uv-window-note" class="uv-card__meta-note hidden">Protection may be required during this window</p>
        </div>
      </div>
      <p id="uv-stale-warning" class="stale-warning hidden" aria-live="polite"></p>
    </section>

    <!-- UV Chart -->
    <section class="chart-section" aria-label="UV index chart">
      <div class="chart-wrap">
        <canvas id="uv-chart" role="img" aria-label="UV index forecast chart"></canvas>
      </div>
      <details class="data-table-wrap">
        <summary class="data-table-toggle">View hourly data ▾</summary>
        <table id="uv-table" class="uv-table">
          <thead><tr><th>Time</th><th>UV Index</th></tr></thead>
          <tbody id="uv-table-body"></tbody>
        </table>
      </details>
    </section>

    <!-- Policy Action Panel -->
    <section class="policy-section" aria-label="SunSmart policy actions">

      <div class="policy-pills" role="group" aria-label="Select your policy type">
        <span class="policy-pills__label">Your policy type:</span>
        <div class="policy-pills__buttons">
          <button class="pill" data-policy="ec" type="button">Early Childhood</button>
          <button class="pill" data-policy="primary" type="button">Primary / Intermediate</button>
          <button class="pill" data-policy="secondary" type="button">Secondary</button>
        </div>
      </div>

      <div id="policy-prompt" class="policy-prompt hidden" role="status">
        Select your policy type to see required actions
      </div>

      <!-- Right Now checklist -->
      <div id="checklist-section" class="checklist-section hidden">
        <div id="checklist-status" class="checklist-status" role="status" aria-live="polite"></div>
        <div id="sunscreen-prompt" class="sunscreen-prompt hidden" role="alert"></div>
        <div id="baby-callout" class="baby-callout hidden" role="note"></div>
        <ul id="checklist" class="checklist" aria-label="SunSmart actions"></ul>
      </div>

      <!-- Timeline -->
      <details id="timeline-details" class="timeline-details hidden">
        <summary class="timeline-toggle">Plan your day ▾</summary>
        <div id="timeline" class="timeline" role="list" aria-label="Hourly SunSmart timeline"></div>
        <!-- Hour detail popup -->
        <div id="hour-detail" class="hour-detail hidden" aria-live="polite"></div>
      </details>

    </section>

    <!-- End of day / loading / error states -->
    <div id="end-of-day" class="status-banner status-banner--info hidden" role="status">
      Today's UV data complete — check back tomorrow.
    </div>
    <div id="loading-indicator" class="status-banner status-banner--loading hidden" role="status" aria-live="polite">
      Loading UV data…
    </div>
    <div id="api-error" class="status-banner status-banner--error hidden" role="alert">
      <span id="api-error-msg"></span>
      <button id="retry-btn" class="btn btn--small" type="button">Retry</button>
    </div>

  </main>

  <!-- CDN scripts — load Chart.js before app.js -->
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-annotation@3.0.1/dist/chartjs-plugin-annotation.min.js"></script>
  <script src="app.js"></script>

</body>
</html>
```

- [ ] **Step 2: Create `style.css`**

```css
/* ============================================================
   CSS CUSTOM PROPERTIES — UV severity colour palette
   ============================================================ */
:root {
  --uv-low:       #4caf50; /* 0-2  green   */
  --uv-moderate:  #ffc107; /* 3-5  yellow  */
  --uv-high:      #ff9800; /* 6-7  orange  */
  --uv-very-high: #f44336; /* 8-10 red     */
  --uv-extreme:   #9c27b0; /* 11+  violet  */
  --uv-none:      #e0e0e0; /* no data      */

  --colour-bg: #f5f5f5;
  --colour-surface: #ffffff;
  --colour-text: #212121;
  --colour-text-secondary: #757575;
  --colour-border: #e0e0e0;
  --colour-error: #d32f2f;
  --colour-success: #388e3c;

  --radius: 12px;
  --shadow: 0 2px 8px rgba(0,0,0,0.12);
  --spacing: 16px;
}

/* ============================================================
   RESET & BASE
   ============================================================ */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { font-size: 16px; -webkit-text-size-adjust: 100%; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--colour-bg);
  color: var(--colour-text);
  min-height: 100vh;
}
.hidden { display: none !important; }
button { cursor: pointer; border: none; background: none; font: inherit; }
ul { list-style: none; }

/* ============================================================
   LOCATION SELECTOR (full-screen)
   ============================================================ */
.location-selector {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: var(--spacing);
  background: var(--colour-bg);
}
.location-selector__inner {
  width: 100%;
  max-width: 440px;
  display: flex;
  flex-direction: column;
  gap: var(--spacing);
}
.app-title {
  font-size: 1.8rem;
  font-weight: 700;
  text-align: center;
}
.location-selector__prompt {
  text-align: center;
  color: var(--colour-text-secondary);
  font-size: 1rem;
}
.search-box { position: relative; }
.search-box input {
  width: 100%;
  padding: 14px 16px;
  font-size: 1rem;
  border: 2px solid var(--colour-border);
  border-radius: var(--radius);
  outline: none;
  transition: border-color 0.2s;
}
.search-box input:focus { border-color: var(--uv-moderate); }
.search-results {
  position: absolute;
  top: calc(100% + 4px);
  left: 0; right: 0;
  background: var(--colour-surface);
  border: 1px solid var(--colour-border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  z-index: 100;
  overflow: hidden;
}
.search-results li {
  padding: 12px 16px;
  cursor: pointer;
  font-size: 0.95rem;
  border-bottom: 1px solid var(--colour-border);
  transition: background 0.15s;
}
.search-results li:last-child { border-bottom: none; }
.search-results li:hover, .search-results li:focus { background: #f0f0f0; }
.divider {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--colour-text-secondary);
}
.divider::before, .divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--colour-border);
}
.btn { padding: 14px 24px; border-radius: var(--radius); font-size: 1rem; font-weight: 600; transition: opacity 0.15s; }
.btn:active { opacity: 0.8; }
.btn--secondary { background: var(--colour-surface); border: 2px solid var(--colour-border); width: 100%; }
.btn--small { padding: 6px 12px; font-size: 0.85rem; border-radius: 6px; background: white; border: 1px solid currentColor; }
.btn-link { background: none; border: none; color: rgba(255,255,255,0.8); font-size: 0.85rem; text-decoration: underline; padding: 0 0 0 8px; }
.error-text { color: var(--colour-error); font-size: 0.9rem; text-align: center; }

/* ============================================================
   APP LAYOUT
   ============================================================ */
.app {
  max-width: 600px;
  margin: 0 auto;
  padding-bottom: 32px;
}

/* ============================================================
   UV CARD
   ============================================================ */
.uv-card {
  padding: var(--spacing);
  background: var(--uv-none);
  color: white;
  transition: background-color 0.4s;
}
.uv-card[data-level="low"]       { background-color: var(--uv-low); }
.uv-card[data-level="moderate"]  { background-color: var(--uv-moderate); color: #212121; }
.uv-card[data-level="high"]      { background-color: var(--uv-high); }
.uv-card[data-level="very-high"] { background-color: var(--uv-very-high); }
.uv-card[data-level="extreme"]   { background-color: var(--uv-extreme); }
.uv-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.location-label { font-size: 0.9rem; font-weight: 500; opacity: 0.9; }
.uv-card__body { display: flex; align-items: flex-start; gap: 16px; }
.uv-card__index-wrap { flex-shrink: 0; text-align: center; }
.uv-card__label { display: block; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.8; }
.uv-card__index { display: block; font-size: 4.5rem; font-weight: 900; line-height: 1; }
.uv-card__level { display: block; font-size: 0.8rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; }
.uv-card__meta { flex: 1; padding-top: 8px; }
.uv-card__meta-line { font-size: 0.9rem; margin-bottom: 4px; opacity: 0.95; }
.uv-card__meta-note { font-size: 0.78rem; opacity: 0.75; font-style: italic; margin-top: 4px; }
.stale-warning {
  margin-top: 10px;
  font-size: 0.8rem;
  opacity: 0.85;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* ============================================================
   CHART
   ============================================================ */
.chart-section {
  background: var(--colour-surface);
  border-bottom: 1px solid var(--colour-border);
}
.chart-wrap { padding: 16px var(--spacing) 8px; }
#uv-chart { width: 100%; }
.data-table-wrap { padding: 0 var(--spacing) var(--spacing); }
.data-table-toggle {
  cursor: pointer;
  font-size: 0.85rem;
  color: var(--colour-text-secondary);
  padding: 8px 0;
  user-select: none;
}
.uv-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin-top: 8px; }
.uv-table th { text-align: left; padding: 6px 8px; border-bottom: 2px solid var(--colour-border); font-weight: 600; }
.uv-table td { padding: 6px 8px; border-bottom: 1px solid var(--colour-border); }
.uv-table tr.active td { background: #fff9c4; font-weight: 600; }

/* ============================================================
   POLICY SECTION
   ============================================================ */
.policy-section {
  background: var(--colour-surface);
  margin-top: 8px;
  padding: var(--spacing);
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.policy-pills__label { font-size: 0.85rem; color: var(--colour-text-secondary); display: block; margin-bottom: 8px; }
.policy-pills__buttons { display: flex; gap: 8px; flex-wrap: wrap; }
.pill {
  padding: 8px 14px;
  border-radius: 999px;
  border: 2px solid var(--colour-border);
  font-size: 0.85rem;
  font-weight: 500;
  background: var(--colour-surface);
  transition: all 0.15s;
}
.pill.active {
  background: var(--colour-text);
  color: white;
  border-color: var(--colour-text);
}
.policy-prompt {
  text-align: center;
  color: var(--colour-text-secondary);
  font-size: 0.95rem;
  padding: 16px;
  border: 2px dashed var(--colour-border);
  border-radius: var(--radius);
}

/* Checklist */
.checklist-status {
  padding: 12px 16px;
  border-radius: var(--radius);
  font-weight: 600;
  font-size: 0.95rem;
  margin-bottom: 12px;
}
.checklist-status--active {
  background: #fff3cd;
  color: #856404;
  border-left: 4px solid var(--uv-moderate);
}
.checklist-status--inactive {
  background: #d4edda;
  color: #155724;
  border-left: 4px solid var(--uv-low);
}
.sunscreen-prompt {
  background: #fff8e1;
  border: 1px solid var(--uv-moderate);
  border-radius: var(--radius);
  padding: 12px 16px;
  font-size: 0.9rem;
  font-weight: 600;
  margin-bottom: 12px;
}
.baby-callout {
  background: #e3f2fd;
  border: 1px solid #90caf9;
  border-radius: var(--radius);
  padding: 12px 16px;
  font-size: 0.88rem;
  margin-bottom: 12px;
  line-height: 1.5;
}
.checklist { display: flex; flex-direction: column; gap: 10px; }
.checklist li {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 0.9rem;
  line-height: 1.5;
}
.checklist li::before {
  content: '☐';
  flex-shrink: 0;
  font-size: 1.1rem;
  margin-top: -1px;
}

/* Timeline */
.timeline-toggle {
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 600;
  padding: 4px 0;
  user-select: none;
}
.timeline {
  display: flex;
  gap: 3px;
  margin-top: 12px;
  overflow-x: auto;
  padding-bottom: 4px;
}
.timeline-block {
  flex: 1;
  min-width: 36px;
  min-height: 48px;
  border-radius: 6px;
  background: var(--uv-none);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  padding: 4px 2px;
  cursor: pointer;
  position: relative;
  transition: opacity 0.15s;
}
.timeline-block:active { opacity: 0.75; }
.timeline-block[data-level="low"]       { background: var(--uv-low); }
.timeline-block[data-level="moderate"]  { background: var(--uv-moderate); }
.timeline-block[data-level="high"]      { background: var(--uv-high); }
.timeline-block[data-level="very-high"] { background: var(--uv-very-high); }
.timeline-block[data-level="extreme"]   { background: var(--uv-extreme); }
.timeline-block__time { font-size: 0.6rem; color: rgba(0,0,0,0.6); white-space: nowrap; }
.timeline-block__reapply {
  position: absolute;
  top: 2px;
  left: 50%;
  transform: translateX(-50%);
  width: 6px; height: 6px;
  background: white;
  border-radius: 50%;
  border: 1px solid rgba(0,0,0,0.3);
}
.hour-detail {
  background: #f9f9f9;
  border: 1px solid var(--colour-border);
  border-radius: var(--radius);
  padding: 12px 16px;
  margin-top: 12px;
  font-size: 0.9rem;
}

/* ============================================================
   STATUS BANNERS
   ============================================================ */
.status-banner {
  margin: 8px var(--spacing);
  padding: 14px 16px;
  border-radius: var(--radius);
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.status-banner--info    { background: #e3f2fd; color: #0d47a1; }
.status-banner--loading { background: #f3f3f3; color: var(--colour-text-secondary); }
.status-banner--error   { background: #ffebee; color: var(--colour-error); }
```

- [ ] **Step 3: Create `app.js` with section stubs**

```js
/* ============================================================
   CONFIG
   ============================================================ */
const NZ_BOUNDS = { latMin: -47, latMax: -34, longMin: 166, longMax: 178 };
const SUNSMART_THRESHOLD = 3;
const CHART_START_HOUR = 6;   // 6am NZ local
const CHART_END_HOUR = 19;    // 7pm NZ local
const END_OF_DAY_HOUR = 19;   // past 7pm → "check back tomorrow"
const SUNSCREEN_APPLY_BEFORE_MIN = 20;
const SUNSCREEN_REAPPLY_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hours

/* ============================================================
   POLICY DATA
   (populated in Task 2)
   ============================================================ */
const POLICY_DATA = {};
function getActions(policyType, uviAtHour) {}

/* ============================================================
   UV DATA UTILITIES
   (populated in Task 3)
   ============================================================ */
function getNZLocalDate(timestamp) {}
function getNZHourString() {}
function formatHour(isoHourString) {}
function getUVLevel(uvi) {}
function getCurrentUVI(hourlyData) {}
function getDailyPeak(hourlyData) {}
function getSunSmartWindow(hourlyData) {}
function getSunscreenTiming(hourlyData) {}

/* ============================================================
   CACHE & STATE
   (populated in Task 4)
   ============================================================ */
function loadState() {}
function saveState(key, value) {}
function clearState(key) {}
function isCacheValid(cache, lat, long) {}
function cacheUVData(data, lat, long) {}
function loadCachedUV() {}

/* ============================================================
   API
   (populated in Task 5)
   ============================================================ */
let currentFetchController = null;
async function fetchUVData(lat, long) {}
async function searchAddress(query) {}
async function reverseGeocode(lat, long) {}

/* ============================================================
   RENDERING
   (populated in Tasks 6–9)
   ============================================================ */
function showLocationSelector() {}
function hideLocationSelector() {}
function renderUVCard(hourlyData, location) {}
function renderChart(hourlyData) {}
function renderDataTable(hourlyData) {}
function renderPolicyPanel(policyType, hourlyData) {}
function renderChecklist(policyType, hourlyData) {}
function renderTimeline(policyType, hourlyData) {}
function showLoading(show) {}
function showAPIError(message) {}
function showStaleWarning(fetchedAt) {}
function hideStaleWarning() {}

/* ============================================================
   BOOT
   (populated in Task 10)
   ============================================================ */
async function init() {}
document.addEventListener('DOMContentLoaded', init);

/* ============================================================
   CONDITIONAL EXPORTS FOR NODE.JS TESTING
   ============================================================ */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
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
  };
}
```

- [ ] **Step 4: Create `tests/test.js` runner skeleton**

```js
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
```

- [ ] **Step 5: Verify scaffold renders without errors**

Open `index.html` in a browser. Expected: app title visible if `#location-selector` is not hidden, no console errors. The `#app` div is hidden by default — that's correct.

- [ ] **Step 6: Commit**

```bash
git add index.html style.css app.js tests/test.js
git commit -m "feat: scaffold — HTML, CSS tokens, app.js stubs, test runner"
```

---

## Task 2: Policy Rules Engine

**Files:**
- Modify: `app.js` — fill in `POLICY_DATA` and `getActions()`
- Modify: `tests/test.js` — add `getActions` tests

- [ ] **Step 1: Write the failing tests for `getActions`**

Add these test blocks to `tests/test.js` (before the summary `console.log`):

```js
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
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
node tests/test.js
```
Expected: errors like `TypeError: Cannot read properties of undefined` because `getActions` is a stub.

- [ ] **Step 3: Implement `POLICY_DATA` and `getActions` in `app.js`**

Replace the `POLICY_DATA = {}` and `getActions` stub with:

```js
const POLICY_DATA = {
  ec: {
    items: [
      'Wear a compliant hat outside — legionnaire, broad-brim (≥7.5cm), or bucket (≥6cm). No baseball caps or visors.',
      'Sunscreen SPF 30+ (water-resistant, broad-spectrum) applied 20 min before going outside. Written parental permission required before staff apply sunscreen.',
      'Reapply sunscreen every 2 hours (or after swimming or sweating). Provide routine breaks for reapplication.',
      'Seek and use available shade during outdoor activities.',
      'Sun-protective clothing — loose-fitting, sleeves and collar, knee-length or longer.',
      'Sunglasses recommended (must meet AS/NZS 1067).',
      'Staff must follow and model all SunSmart measures.',
      'No hat? Child must play in shade or indoors.',
      'Provide spare sunhats for any children without one.',
    ],
    babyCallout: '🍼 Infants: Babies under 12 months must be kept out of direct sun at all times when UVI ≥ 3. Sunscreen is not recommended for babies under 6 months — use shade and clothing only. For babies 6–12 months, apply sunscreen to small exposed areas only using a sensitive children\'s formulation (patch test first).',
  },
  primary: {
    items: [
      'Wear a compliant hat outside — legionnaire, broad-brim (≥7.5cm), or bucket (≥6cm). No baseball caps or visors.',
      'Sunscreen SPF 30+ (water-resistant, broad-spectrum) applied 20 min before going outside.',
      'Reapply sunscreen every 2 hours (or after swimming or sweating).',
      'Seek and use available shade during outdoor activities.',
      'Sun-protective clothing — loose-fitting, sleeves and collar, knee-length or longer.',
      'Sunglasses recommended (must meet AS/NZS 1067).',
      'Staff must follow and model all SunSmart measures.',
      'No hat? Student must play in shade or indoors.',
      'Rash tops required for water play and swimming.',
    ],
  },
  secondary: {
    items: [
      'Wear a compliant hat outside — legionnaire, broad-brim (≥7.5cm), or bucket (≥6cm). No baseball caps or visors.',
      'Sunscreen SPF 30+ (water-resistant, broad-spectrum) applied 20 min before going outside.',
      'Reapply sunscreen every 2 hours (or after swimming or sweating).',
      'Seek and use available shade during outdoor activities.',
      'Sun-protective clothing — loose-fitting with sleeves and collar.',
      'Sunglasses recommended (must meet AS/NZS 1067).',
      'Staff must follow and model all SunSmart measures.',
      'Rash tops required for swimming sports and outdoor water activities.',
    ],
  },
};

function getActions(policyType, uviAtHour) {
  const policy = POLICY_DATA[policyType];
  if (!policy) return { active: false, items: [] };
  const active = (uviAtHour ?? 0) >= SUNSMART_THRESHOLD;
  const result = { active, items: active ? policy.items : [] };
  if (policyType === 'ec' && active) {
    result.babyCallout = policy.babyCallout;
  }
  return result;
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
node tests/test.js
```
Expected: `11 passed, 0 failed`

- [ ] **Step 5: Commit**

```bash
git add app.js tests/test.js
git commit -m "feat: policy rules engine — POLICY_DATA and getActions() with tests"
```

---

## Task 3: UV Data Pure Utilities

**Files:**
- Modify: `app.js` — fill in UV utility functions
- Modify: `tests/test.js` — add UV utility tests

**Note on test data:** Tests use a synthetic `hourlyData` object mirroring the Open-Meteo response shape:
```js
{ time: ['2026-03-20T06:00', '2026-03-20T07:00', ...], uv_index: [0, 0.5, ...] }
```

- [ ] **Step 1: Write failing tests**

Add to `tests/test.js`:

```js
// Helper: build a fake hourlyData with 24 hours (midnight to 11pm)
function makeHourlyData(uvValues) {
  const times = Array.from({ length: 24 }, (_, i) => {
    const h = String(i).padStart(2, '0');
    return `2026-03-20T${h}:00`;
  });
  return { time: times, uv_index: uvValues };
}

console.log('\ngetUVLevel()');

test('UVI 0 → low', () => assert.strictEqual(getUVLevel(0), 'low'));
test('UVI 2 → low', () => assert.strictEqual(getUVLevel(2), 'low'));
test('UVI 3 → moderate', () => assert.strictEqual(getUVLevel(3), 'moderate'));
test('UVI 5 → moderate', () => assert.strictEqual(getUVLevel(5), 'moderate'));
test('UVI 6 → high', () => assert.strictEqual(getUVLevel(6), 'high'));
test('UVI 7 → high', () => assert.strictEqual(getUVLevel(7), 'high'));
test('UVI 8 → very-high', () => assert.strictEqual(getUVLevel(8), 'very-high'));
test('UVI 10 → very-high', () => assert.strictEqual(getUVLevel(10), 'very-high'));
test('UVI 11 → extreme', () => assert.strictEqual(getUVLevel(11), 'extreme'));
test('null → low', () => assert.strictEqual(getUVLevel(null), 'low'));

console.log('\nformatHour()');

test('06:00 → 6:00am', () => assert.strictEqual(formatHour('2026-03-20T06:00'), '6:00am'));
test('12:00 → 12:00pm', () => assert.strictEqual(formatHour('2026-03-20T12:00'), '12:00pm'));
test('13:00 → 1:00pm', () => assert.strictEqual(formatHour('2026-03-20T13:00'), '1:00pm'));
test('00:00 → 12:00am', () => assert.strictEqual(formatHour('2026-03-20T00:00'), '12:00am'));

console.log('\getNZLocalDate()');

test('returns YYYY-MM-DD string', () => {
  const result = getNZLocalDate(Date.now());
  assert.match(result, /^\d{4}-\d{2}-\d{2}$/);
});

console.log('\ngetDailyPeak()');

test('finds peak UVI and time', () => {
  const uvs = Array(24).fill(0);
  uvs[13] = 9.5; // peak at 1pm
  const data = makeHourlyData(uvs);
  const peak = getDailyPeak(data);
  assert.strictEqual(peak.value, 9.5);
  assert.strictEqual(peak.time, '2026-03-20T13:00');
});

test('returns null when all UVI 0', () => {
  const data = makeHourlyData(Array(24).fill(0));
  const peak = getDailyPeak(data);
  assert.strictEqual(peak, null);
});

console.log('\ngetSunSmartWindow()');

test('returns correct window for hours ≥ 3', () => {
  const uvs = Array(24).fill(0);
  uvs[10] = 3.1; uvs[11] = 5; uvs[12] = 6; uvs[13] = 4; uvs[16] = 3.0;
  const data = makeHourlyData(uvs);
  const w = getSunSmartWindow(data);
  assert.strictEqual(w.start, '2026-03-20T10:00');
  assert.strictEqual(w.end, '2026-03-20T16:00');
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
  assert.strictEqual(w.end, '2026-03-20T10:00');
});

console.log('\ngetSunscreenTiming()');

test('applyBy is 20 min before first ≥ 3 hour', () => {
  const uvs = Array(24).fill(0);
  uvs[10] = 4; // 10:00 is first active hour
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
  // Active window: 10:00–13:00 → reapply at 10:00, 12:00 = 2 entries
  assert.strictEqual(timing.reapplyTimes.length, 2);
  // First reapply is 2 hours after applyBy (applyBy + 20min = first active hour = 10:00)
  const firstReapply = timing.reapplyTimes[0].getTime();
  const firstActive  = new Date('2026-03-20T10:00').getTime();
  assert.strictEqual(firstReapply, firstActive, 'first reapply should be at first active hour');
});

test('returns null when no active hours', () => {
  const data = makeHourlyData(Array(24).fill(0));
  assert.strictEqual(getSunscreenTiming(data), null);
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
node tests/test.js
```
Expected: failures for all UV utility tests (stubs return `undefined`).

- [ ] **Step 3: Implement UV utility functions in `app.js`**

Replace the utility stubs:

```js
function getNZLocalDate(timestamp) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Pacific/Auckland',
  }).format(new Date(timestamp));
}

function getNZHourString() {
  // Returns "YYYY-MM-DDTHH:00" matching Open-Meteo timestamp format, in NZ local time
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Pacific/Auckland',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hour12: false,
  }).formatToParts(now);
  const get = (type) => parts.find(p => p.type === type).value;
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:00`;
}

function formatHour(isoHourString) {
  // "2026-03-20T14:00" → "2:00pm"
  const hour = parseInt(isoHourString.split('T')[1].split(':')[0], 10);
  if (hour === 0)  return '12:00am';
  if (hour < 12)  return `${hour}:00am`;
  if (hour === 12) return '12:00pm';
  return `${hour - 12}:00pm`;
}

function getUVLevel(uvi) {
  const v = uvi ?? 0;
  if (v >= 11) return 'extreme';
  if (v >= 8)  return 'very-high';
  if (v >= 6)  return 'high';
  if (v >= 3)  return 'moderate';
  return 'low';
}

function getCurrentUVI(hourlyData) {
  const nowHour = getNZHourString();
  const idx = hourlyData.time.indexOf(nowHour);
  if (idx === -1) return 0;
  return hourlyData.uv_index[idx] ?? 0;
}

function getDailyPeak(hourlyData) {
  let maxVal = -1;
  let maxIdx = -1;
  hourlyData.uv_index.forEach((v, i) => {
    const val = v ?? 0;
    if (val > maxVal) { maxVal = val; maxIdx = i; }
  });
  if (maxVal <= 0) return null;
  return { value: maxVal, time: hourlyData.time[maxIdx] };
}

function getSunSmartWindow(hourlyData) {
  const activeIdxs = hourlyData.uv_index
    .map((v, i) => ({ v: v ?? 0, i }))
    .filter(({ v }) => v >= SUNSMART_THRESHOLD)
    .map(({ i }) => i);
  if (activeIdxs.length === 0) return null;
  return {
    start: hourlyData.time[activeIdxs[0]],
    end:   hourlyData.time[activeIdxs[activeIdxs.length - 1]],
  };
}

function getSunscreenTiming(hourlyData) {
  const window = getSunSmartWindow(hourlyData);
  if (!window) return null;

  const firstActive = new Date(window.start);
  const lastActive  = new Date(window.end);
  const applyBy     = new Date(firstActive.getTime() - SUNSCREEN_APPLY_BEFORE_MIN * 60 * 1000);

  const reapplyTimes = [];
  let t = new Date(firstActive);
  while (t <= lastActive) {
    reapplyTimes.push(new Date(t));
    t = new Date(t.getTime() + SUNSCREEN_REAPPLY_INTERVAL_MS);
  }

  return { applyBy, reapplyTimes };
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
node tests/test.js
```
Expected: all UV utility tests pass. Total: ~25 passed, 0 failed.

- [ ] **Step 5: Commit**

```bash
git add app.js tests/test.js
git commit -m "feat: UV data utilities — level, peak, window, sunscreen timing, NZ date helpers"
```

---

## Task 4: Cache & State Utilities

**Files:**
- Modify: `app.js` — fill in cache/state functions
- Modify: `tests/test.js` — add cache tests

- [ ] **Step 1: Write failing tests**

Add to `tests/test.js`:

```js
console.log('\nisCacheValid()');

test('returns false when cache is null', () => {
  assert.strictEqual(isCacheValid(null, -36.8, 174.7), false);
});

test('returns false when cache has no fetchedAt', () => {
  assert.strictEqual(isCacheValid({ data: {}, lat: -36.8, long: 174.7 }, -36.8, 174.7), false);
});

test('returns true for same NZ calendar day and same coords', () => {
  // Use current timestamp — same day as "now"
  const cache = { data: { hourly: {} }, fetchedAt: Date.now(), lat: -36.8, long: 174.7 };
  assert.strictEqual(isCacheValid(cache, -36.8, 174.7), true);
});

test('returns false when lat/long differs significantly', () => {
  const cache = { data: { hourly: {} }, fetchedAt: Date.now(), lat: -36.8, long: 174.7 };
  assert.strictEqual(isCacheValid(cache, -41.3, 174.8), false);
});

test('returns false when fetchedAt is yesterday NZ time', () => {
  // 48 hours ago is always a different NZ day
  const yesterday = Date.now() - 48 * 60 * 60 * 1000;
  const cache = { data: { hourly: {} }, fetchedAt: yesterday, lat: -36.8, long: 174.7 };
  assert.strictEqual(isCacheValid(cache, -36.8, 174.7), false);
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
node tests/test.js
```
Expected: `isCacheValid` tests fail.

- [ ] **Step 3: Implement cache & state functions in `app.js`**

```js
function loadState() {
  try {
    return {
      location: JSON.parse(localStorage.getItem('sunsmart_location') || 'null'),
      policy:   localStorage.getItem('sunsmart_policy') || null,
      uvCache:  JSON.parse(localStorage.getItem('sunsmart_uv_cache') || 'null'),
    };
  } catch {
    return { location: null, policy: null, uvCache: null };
  }
}

function saveState(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* storage full — silently ignore */ }
}

function clearState(key) {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

function isCacheValid(cache, lat, long) {
  if (!cache || !cache.fetchedAt || !cache.data) return false;
  const cacheDate = getNZLocalDate(cache.fetchedAt);
  const todayDate = getNZLocalDate(Date.now());
  if (cacheDate !== todayDate) return false;
  if (Math.abs((cache.lat ?? 999) - lat)  > 0.01) return false;
  if (Math.abs((cache.long ?? 999) - long) > 0.01) return false;
  return true;
}

function cacheUVData(data, lat, long) {
  saveState('sunsmart_uv_cache', { data, fetchedAt: Date.now(), lat, long });
}

function loadCachedUV() {
  const state = loadState();
  return state.uvCache;
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
node tests/test.js
```
Expected: all cache tests pass.

- [ ] **Step 5: Commit**

```bash
git add app.js tests/test.js
git commit -m "feat: cache and state utilities with tests"
```

---

## Task 5: API Layer

**Files:**
- Modify: `app.js` — fill in `fetchUVData`, `searchAddress`, `reverseGeocode`

These functions make network requests — they cannot be unit tested with Node. Test manually in the browser console after implementation.

- [ ] **Step 1: Implement `fetchUVData`**

```js
async function fetchUVData(lat, long) {
  // Abort any existing in-flight request
  if (currentFetchController) currentFetchController.abort();
  currentFetchController = new AbortController();

  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', lat);
  url.searchParams.set('longitude', long);
  url.searchParams.set('hourly', 'uv_index');
  url.searchParams.set('timezone', 'Pacific/Auckland');
  url.searchParams.set('forecast_days', '1');

  const response = await fetch(url, { signal: currentFetchController.signal });
  if (!response.ok) throw new Error(`Open-Meteo error: ${response.status}`);
  const json = await response.json();
  currentFetchController = null;
  return json.hourly; // { time: [...], uv_index: [...] }
}
```

- [ ] **Step 2: Implement `searchAddress`**

```js
async function searchAddress(query) {
  if (!query || query.trim().length < 2) return [];
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query.trim());
  url.searchParams.set('format', 'json');
  url.searchParams.set('countrycodes', 'nz');
  url.searchParams.set('limit', '5');
  url.searchParams.set('addressdetails', '1');

  const response = await fetch(url, {
    headers: { 'Accept-Language': 'en', 'User-Agent': 'SunSmart-NZ/1.0' },
  });
  if (!response.ok) throw new Error(`Nominatim error: ${response.status}`);
  const results = await response.json();
  return results.map(r => ({
    label: r.display_name,
    lat: parseFloat(r.lat),
    long: parseFloat(r.lon),
  }));
}
```

- [ ] **Step 3: Implement `reverseGeocode`**

```js
async function reverseGeocode(lat, long) {
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('lat', lat);
  url.searchParams.set('lon', long);
  url.searchParams.set('format', 'json');

  const response = await fetch(url, {
    headers: { 'Accept-Language': 'en', 'User-Agent': 'SunSmart-NZ/1.0' },
  });
  if (!response.ok) throw new Error(`Nominatim reverse error: ${response.status}`);
  const data = await response.json();
  // Return suburb + city if available, else full display_name
  const a = data.address || {};
  const label = [a.suburb || a.town || a.city_district, a.city || a.county]
    .filter(Boolean).join(', ') || data.display_name.split(',').slice(0, 2).join(',').trim();
  return label;
}
```

- [ ] **Step 4: Manual browser test**

Open `index.html` in a browser. Open DevTools console. Run:

```js
// Test Open-Meteo fetch (Wellington)
fetchUVData(-41.2865, 174.7762).then(d => console.log('UV data:', d));
// Expected: object with `time` array and `uv_index` array (24 entries)

// Test Nominatim search
searchAddress('Auckland Primary').then(r => console.log('Search results:', r));
// Expected: array of { label, lat, long } objects

// Test reverse geocode
reverseGeocode(-36.8485, 174.7633).then(l => console.log('Label:', l));
// Expected: something like "Auckland CBD, Auckland"
```

- [ ] **Step 5: Commit**

```bash
git add app.js
git commit -m "feat: API layer — Open-Meteo fetch and Nominatim search/reverse geocode"
```

---

## Task 6: Location Selector UI

**Files:**
- Modify: `app.js` — implement `showLocationSelector`, `hideLocationSelector`, address search wiring, GPS wiring

- [ ] **Step 1: Implement `showLocationSelector` and `hideLocationSelector`**

```js
function showLocationSelector() {
  document.getElementById('location-selector').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
  document.getElementById('address-input').value = '';
  document.getElementById('address-results').classList.add('hidden');
  document.getElementById('location-error').classList.add('hidden');
}

function hideLocationSelector() {
  document.getElementById('location-selector').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
}
```

- [ ] **Step 2: Implement address search wiring**

Add inside `init()` (or a dedicated `initLocationSelector()` called from `init()`):

```js
function initLocationSelector() {
  const input = document.getElementById('address-input');
  const resultsList = document.getElementById('address-results');
  const errorEl = document.getElementById('location-error');
  let debounceTimer = null;

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const query = input.value.trim();
    if (query.length < 2) {
      resultsList.classList.add('hidden');
      return;
    }
    debounceTimer = setTimeout(async () => {
      try {
        const results = await searchAddress(query);
        resultsList.innerHTML = '';
        if (results.length === 0) {
          resultsList.innerHTML = '<li class="search-results__empty">No results found — try a suburb name or school address</li>';
        } else {
          results.forEach(r => {
            const li = document.createElement('li');
            li.textContent = r.label;
            li.setAttribute('role', 'option');
            li.tabIndex = 0;
            li.addEventListener('click', () => selectLocation(r.lat, r.long, r.label));
            li.addEventListener('keydown', e => { if (e.key === 'Enter') selectLocation(r.lat, r.long, r.label); });
            resultsList.appendChild(li);
          });
        }
        resultsList.classList.remove('hidden');
      } catch (e) {
        console.warn('Address search failed:', e);
      }
    }, 300);
  });

  // Close results on outside click
  document.addEventListener('click', e => {
    if (!e.target.closest('.search-box')) resultsList.classList.add('hidden');
  });

  // GPS button
  document.getElementById('gps-btn').addEventListener('click', () => {
    errorEl.classList.add('hidden');
    if (!navigator.geolocation) {
      errorEl.textContent = 'Geolocation is not supported by your browser.';
      errorEl.classList.remove('hidden');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: long } = pos.coords;
        if (lat < NZ_BOUNDS.latMin || lat > NZ_BOUNDS.latMax ||
            long < NZ_BOUNDS.longMin || long > NZ_BOUNDS.longMax) {
          errorEl.textContent = 'Location not supported — this app covers mainland New Zealand. Try searching for your address instead.';
          errorEl.classList.remove('hidden');
          return;
        }
        try {
          const label = await reverseGeocode(lat, long);
          selectLocation(lat, long, label);
        } catch {
          selectLocation(lat, long, `${lat.toFixed(3)}, ${long.toFixed(3)}`);
        }
      },
      () => {
        // Permission denied — silently fall back to search
        input.focus();
      }
    );
  });
}
```

- [ ] **Step 3: Implement `selectLocation`**

```js
async function selectLocation(lat, long, label) {
  const location = { lat, long, label };
  saveState('sunsmart_location', location);
  hideLocationSelector();
  document.getElementById('location-label').textContent = label;
  await loadAndRenderUV(location);
}
```

- [ ] **Step 4: Wire up `[change]` button**

Add inside `init()`:
```js
document.getElementById('change-location-btn').addEventListener('click', () => {
  if (currentFetchController) currentFetchController.abort();
  clearState('sunsmart_location');
  clearState('sunsmart_uv_cache');
  showLocationSelector();
});
```

- [ ] **Step 5: Manual test**

Open `index.html`. The location selector should be visible (full-screen). Type "Wellington" in the search box — a dropdown of NZ results should appear after 300ms. Click a result — the selector should hide and the main app skeleton should appear. Refresh — location should be remembered (localStorage), main app should show directly.

- [ ] **Step 6: Commit**

```bash
git add app.js
git commit -m "feat: location selector UI — address search, GPS flow, change button"
```

---

## Task 7: UV Data Card Rendering

**Files:**
- Modify: `app.js` — implement `renderUVCard`, `showLoading`, `showAPIError`, `showStaleWarning`

- [ ] **Step 1: Implement `renderUVCard`**

```js
function renderUVCard(hourlyData, location) {
  const currentUVI  = getCurrentUVI(hourlyData);
  const level       = getUVLevel(currentUVI);
  const peak        = getDailyPeak(hourlyData);
  const window      = getSunSmartWindow(hourlyData);

  // Update card background
  const card = document.getElementById('uv-card');
  card.setAttribute('data-level', level);

  // Location
  document.getElementById('location-label').textContent = location.label;

  // Current UVI
  document.getElementById('uv-current').textContent = currentUVI > 0 ? currentUVI.toFixed(1) : '–';

  // Level label
  const levelLabels = {
    'low': 'Low', 'moderate': 'Moderate', 'high': 'High',
    'very-high': 'Very High', 'extreme': 'Extreme',
  };
  document.getElementById('uv-level').textContent = levelLabels[level] || '';

  // Daily peak
  const peakEl = document.getElementById('uv-peak');
  if (peak) {
    peakEl.textContent = `Daily peak: ${peak.value.toFixed(1)} at ${formatHour(peak.time)}`;
  } else {
    peakEl.textContent = 'UV index is low all day';
  }

  // SunSmart active window
  const windowEl  = document.getElementById('uv-window');
  const windowNote = document.getElementById('uv-window-note');
  if (window) {
    windowEl.textContent = `SunSmart hours: ${formatHour(window.start)} – ${formatHour(window.end)}`;
    windowNote.classList.remove('hidden');
  } else {
    windowEl.textContent = 'No SunSmart hours today';
    windowNote.classList.add('hidden');
  }

  // End-of-day check
  const nowParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Pacific/Auckland', hour: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const currentHour = parseInt(nowParts.find(p => p.type === 'hour').value, 10);
  const endOfDayEl = document.getElementById('end-of-day');
  if (currentHour >= END_OF_DAY_HOUR) {
    endOfDayEl.classList.remove('hidden');
  } else {
    endOfDayEl.classList.add('hidden');
  }
}
```

- [ ] **Step 2: Implement loading, error, and stale warning helpers**

```js
function showLoading(show) {
  document.getElementById('loading-indicator').classList.toggle('hidden', !show);
}

function showAPIError(message) {
  const el = document.getElementById('api-error');
  document.getElementById('api-error-msg').textContent = message;
  el.classList.remove('hidden');
}

function hideAPIError() {
  document.getElementById('api-error').classList.add('hidden');
}

function showStaleWarning(fetchedAt) {
  const el = document.getElementById('uv-stale-warning');
  const time = new Intl.DateTimeFormat('en-NZ', {
    timeZone: 'Pacific/Auckland',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(new Date(fetchedAt));
  el.textContent = `⚠ Last updated: ${time}`;
  el.classList.remove('hidden');
}

function hideStaleWarning() {
  document.getElementById('uv-stale-warning').classList.add('hidden');
}
```

- [ ] **Step 3: Manual test**

In browser console, create fake hourlyData and call:
```js
const fake = {
  time: Array.from({length: 24}, (_, i) => `2026-03-20T${String(i).padStart(2,'0')}:00`),
  uv_index: [0,0,0,0,0,0,0.5,1,2,3,5,7,9,8,6,4,3,2,1,0,0,0,0,0]
};
renderUVCard(fake, { label: 'Auckland CBD' });
```
Expected: UV card updates with current-hour UVI highlighted, daily peak shown, SunSmart window shown. Card background changes colour.

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "feat: UV data card rendering with severity colours and window display"
```

---

## Task 8: UV Chart

**Files:**
- Modify: `app.js` — implement `renderChart` and `renderDataTable`

- [ ] **Step 1: Implement `renderChart`**

```js
let chartInstance = null;

function renderChart(hourlyData) {
  // Filter to chart window (6am–7pm)
  const chartData = hourlyData.time
    .map((t, i) => ({ t, v: hourlyData.uv_index[i] }))
    .filter(({ t }) => {
      const hour = parseInt(t.split('T')[1].split(':')[0], 10);
      return hour >= CHART_START_HOUR && hour <= CHART_END_HOUR;
    });

  const labels = chartData.map(d => formatHour(d.t));
  const values = chartData.map(d => d.v); // keep nulls — Chart.js renders gaps with spanGaps:false

  // Current time marker index
  const nowHour = getNZHourString();
  const nowIdx  = chartData.findIndex(d => d.t === nowHour);

  const ctx = document.getElementById('uv-chart').getContext('2d');
  if (chartInstance) chartInstance.destroy();

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: values,
        borderColor: '#e65100',
        borderWidth: 2.5,
        pointRadius: 3,
        pointBackgroundColor: values.map(v => {
          const l = getUVLevel(v);
          return ({ low:'#4caf50', moderate:'#ffc107', high:'#ff9800', 'very-high':'#f44336', extreme:'#9c27b0' })[l] || '#e0e0e0';
        }),
        fill: {
          target: { value: SUNSMART_THRESHOLD },
          above: 'rgba(255, 193, 7, 0.25)',
          below: 'rgba(200, 200, 200, 0.15)',
        },
        spanGaps: false,
        tension: 0.3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 2.2,
      plugins: {
        legend: { display: false },
        annotation: {
          annotations: {
            threshold: {
              type: 'line',
              yMin: SUNSMART_THRESHOLD,
              yMax: SUNSMART_THRESHOLD,
              borderColor: 'rgba(255, 0, 0, 0.6)',
              borderWidth: 1.5,
              borderDash: [6, 4],
              label: {
                content: 'SunSmart threshold (UVI 3)',
                display: true,
                position: 'end',
                color: 'rgba(180,0,0,0.7)',
                font: { size: 10 },
              },
            },
            ...(nowIdx >= 0 ? {
              nowLine: {
                type: 'line',
                xMin: nowIdx,
                xMax: nowIdx,
                borderColor: 'rgba(33, 33, 33, 0.5)',
                borderWidth: 1.5,
                borderDash: [4, 4],
                label: { content: 'Now', display: true, position: 'start', font: { size: 10 } },
              },
            } : {}),
          },
        },
        tooltip: {
          callbacks: {
            label: ctx => `UV Index: ${ctx.parsed.y !== null ? ctx.parsed.y.toFixed(1) : '–'}`,
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 45 } },
        y: {
          min: 0,
          suggestedMax: 12,
          grid: { color: 'rgba(0,0,0,0.06)' },
          title: { display: true, text: 'UV Index', font: { size: 11 } },
          ticks: { stepSize: 2, font: { size: 10 } },
        },
      },
    },
  });
}
```

- [ ] **Step 2: Implement `renderDataTable`**

```js
function renderDataTable(hourlyData) {
  const tbody = document.getElementById('uv-table-body');
  tbody.innerHTML = '';

  hourlyData.time.forEach((t, i) => {
    const hour = parseInt(t.split('T')[1].split(':')[0], 10);
    if (hour < CHART_START_HOUR || hour > CHART_END_HOUR) return;

    const uvi = hourlyData.uv_index[i];
    const tr = document.createElement('tr');
    if ((uvi ?? 0) >= SUNSMART_THRESHOLD) tr.classList.add('active');
    tr.innerHTML = `
      <td>${formatHour(t)}</td>
      <td>${uvi !== null && uvi !== undefined ? uvi.toFixed(1) : '–'}</td>
    `;
    tbody.appendChild(tr);
  });
}
```

- [ ] **Step 3: Manual test**

In browser console:
```js
const fake = {
  time: Array.from({length: 24}, (_, i) => `2026-03-20T${String(i).padStart(2,'0')}:00`),
  uv_index: [0,0,0,0,0,0,0.5,1,2,3,5,7,9,8,6,4,3,2,1,0,0,0,0,0]
};
renderChart(fake);
renderDataTable(fake);
```
Expected: Chart renders with coloured area above UVI 3, red dashed threshold line, "Now" vertical marker. Table shows rows — rows where UVI ≥ 3 have yellow background.

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "feat: UV chart and data table with Chart.js threshold annotation"
```

---

## Task 9: Policy Action Panel

**Files:**
- Modify: `app.js` — implement `renderPolicyPanel`, `renderChecklist`, `renderTimeline`

- [ ] **Step 1: Implement policy pill wiring (add inside `init()`)**

```js
function initPolicyPills() {
  document.querySelectorAll('.pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const policyType = btn.dataset.policy;
      saveState('sunsmart_policy', policyType);
      document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      // Re-render policy panel with current UV data
      const cache = loadCachedUV();
      if (cache && cache.data) renderPolicyPanel(policyType, cache.data);
    });
  });
}
```

- [ ] **Step 2: Implement `renderPolicyPanel`**

```js
function renderPolicyPanel(policyType, hourlyData) {
  const promptEl    = document.getElementById('policy-prompt');
  const checklistEl = document.getElementById('checklist-section');
  const timelineEl  = document.getElementById('timeline-details');

  if (!policyType) {
    promptEl.classList.remove('hidden');
    checklistEl.classList.add('hidden');
    timelineEl.classList.add('hidden');
    return;
  }

  promptEl.classList.add('hidden');
  checklistEl.classList.remove('hidden');
  timelineEl.classList.remove('hidden');

  renderChecklist(policyType, hourlyData);
  renderTimeline(policyType, hourlyData);
}
```

- [ ] **Step 3: Implement `renderChecklist`**

```js
function renderChecklist(policyType, hourlyData) {
  const currentUVI      = getCurrentUVI(hourlyData);
  const sunscreenTiming = getSunscreenTiming(hourlyData);
  const actions         = getActions(policyType, currentUVI);
  const now             = new Date();

  const statusEl         = document.getElementById('checklist-status');
  const sunscreenPromptEl = document.getElementById('sunscreen-prompt');
  const babyCalloutEl    = document.getElementById('baby-callout');
  const listEl           = document.getElementById('checklist');

  // Status banner
  if (actions.active) {
    const levelLabels = { moderate: 'Moderate', high: 'High', 'very-high': 'Very High', extreme: 'Extreme' };
    const levelLabel = levelLabels[getUVLevel(currentUVI)] || '';
    statusEl.textContent = `✅ SunSmart is active now (UVI ${currentUVI.toFixed(1)} — ${levelLabel})`;
    statusEl.className = 'checklist-status checklist-status--active';
  } else {
    statusEl.textContent = '✓ No SunSmart measures required right now';
    statusEl.className = 'checklist-status checklist-status--inactive';
  }

  // Sunscreen apply-now prompt (between apply-by and first active hour)
  sunscreenPromptEl.classList.add('hidden');
  if (sunscreenTiming && !actions.active) {
    if (now >= sunscreenTiming.applyBy && now < sunscreenTiming.reapplyTimes[0]) {
      const startTime = formatHour(sunscreenTiming.reapplyTimes[0].toISOString().replace('Z', '').slice(0, 16));
      sunscreenPromptEl.textContent = `🧴 Apply sunscreen now — UVI 3 or above starts at ${startTime}`;
      sunscreenPromptEl.classList.remove('hidden');
    }
  }

  // Baby callout (EC only)
  if (actions.babyCallout) {
    babyCalloutEl.textContent = actions.babyCallout;
    babyCalloutEl.classList.remove('hidden');
  } else {
    babyCalloutEl.classList.add('hidden');
  }

  // Checklist items
  listEl.innerHTML = '';
  actions.items.forEach(item => {
    const li = document.createElement('li');
    li.textContent = item;
    listEl.appendChild(li);
  });
}
```

- [ ] **Step 4: Implement `renderTimeline`**

```js
function renderTimeline(policyType, hourlyData) {
  const sunscreenTiming = getSunscreenTiming(hourlyData);
  const reapplyISOStrings = (sunscreenTiming?.reapplyTimes || [])
    .map(d => d.toISOString().slice(0, 16)); // "YYYY-MM-DDTHH:00"

  const timelineEl  = document.getElementById('timeline');
  const hourDetailEl = document.getElementById('hour-detail');
  timelineEl.innerHTML = '';
  hourDetailEl.classList.add('hidden');

  hourlyData.time.forEach((t, i) => {
    const hour = parseInt(t.split('T')[1].split(':')[0], 10);
    if (hour < CHART_START_HOUR || hour > CHART_END_HOUR) return;

    const uvi     = hourlyData.uv_index[i] ?? 0;
    const level   = getUVLevel(uvi);
    const isReapply = reapplyISOStrings.some(r => t.startsWith(r));

    const block = document.createElement('div');
    block.className = 'timeline-block';
    block.setAttribute('data-level', uvi >= SUNSMART_THRESHOLD ? level : 'none');
    block.setAttribute('role', 'listitem');
    block.setAttribute('aria-label', `${formatHour(t)}: UVI ${uvi.toFixed(1)}`);
    block.tabIndex = 0;

    if (isReapply) {
      const dot = document.createElement('div');
      dot.className = 'timeline-block__reapply';
      dot.title = 'Sunscreen reapply time';
      block.appendChild(dot);
    }

    const timeLabel = document.createElement('span');
    timeLabel.className = 'timeline-block__time';
    timeLabel.textContent = formatHour(t).replace(':00', '');
    block.appendChild(timeLabel);

    // Tap → show hour detail
    const showDetail = () => {
      const hourActions = getActions(policyType, uvi);
      hourDetailEl.innerHTML = `
        <strong>${formatHour(t)}</strong> — UVI ${uvi > 0 ? uvi.toFixed(1) : '–'}
        ${hourActions.active
          ? `<ul style="margin-top:8px;padding-left:16px;list-style:disc;">${
              hourActions.items.map(it => `<li>${it}</li>`).join('')
            }</ul>`
          : '<p style="margin-top:8px;color:#388e3c;">No SunSmart measures required at this hour.</p>'
        }
      `;
      hourDetailEl.classList.remove('hidden');
    };
    block.addEventListener('click', showDetail);
    block.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') showDetail(); });

    timelineEl.appendChild(block);
  });
}
```

- [ ] **Step 5: Manual test**

In browser console, using fake UV data:
```js
renderPolicyPanel('ec', fake);
```
Expected: policy pills appear, checklist shows for current UVI, timeline shows coloured hourly blocks. Tapping a block shows that hour's actions. EC shows baby callout when active.

Switch pills between EC/Primary/Secondary — checklist and timeline re-render without page refresh.

- [ ] **Step 6: Commit**

```bash
git add app.js
git commit -m "feat: policy action panel — checklist, timeline, pill selector"
```

---

## Task 10: Boot Sequence & Wiring

**Files:**
- Modify: `app.js` — implement `loadAndRenderUV` and `init()`

- [ ] **Step 1: Implement `loadAndRenderUV`**

This function orchestrates fetching, caching, and rendering UV data. It is called both on boot (if a location is saved) and after a location is selected.

```js
async function loadAndRenderUV(location) {
  const cache = loadCachedUV();
  const hasValidCache = isCacheValid(cache, location.lat, location.long);
  const hasAnyCache   = cache && cache.data;

  if (hasValidCache) {
    // Render immediately from valid cache
    renderAll(cache.data, location);
    // Silently re-fetch in background
    silentRefresh(location);
  } else if (hasAnyCache) {
    // Render stale cache with "Updating…" indicator, then replace
    renderAll(cache.data, location);
    showStaleWarning(cache.fetchedAt);
    try {
      const fresh = await fetchUVData(location.lat, location.long);
      cacheUVData(fresh, location.lat, location.long);
      renderAll(fresh, location);
      hideStaleWarning();
    } catch (e) {
      if (e.name !== 'AbortError') {
        showAPIError('Could not refresh UV data. Showing last known data.');
      }
    }
  } else {
    // No cache — show loading, fetch, render
    showLoading(true);
    hideAPIError();
    try {
      const fresh = await fetchUVData(location.lat, location.long);
      cacheUVData(fresh, location.lat, location.long);
      showLoading(false);
      renderAll(fresh, location);
    } catch (e) {
      showLoading(false);
      if (e.name !== 'AbortError') {
        showAPIError('Could not load UV data. Please check your connection and try again.');
        document.getElementById('retry-btn').onclick = () => loadAndRenderUV(location);
      }
    }
  }
}

async function silentRefresh(location) {
  try {
    const fresh = await fetchUVData(location.lat, location.long);
    cacheUVData(fresh, location.lat, location.long);
    renderAll(fresh, location);
  } catch { /* silent — don't show errors for background refreshes */ }
}

function renderAll(hourlyData, location) {
  const state = loadState();
  renderUVCard(hourlyData, location);
  renderChart(hourlyData);
  renderDataTable(hourlyData);
  renderPolicyPanel(state.policy, hourlyData);
  hideAPIError();
}
```

- [ ] **Step 2: Implement `init()`**

```js
async function init() {
  const state = loadState();

  // Restore policy pill active state
  if (state.policy) {
    const pill = document.querySelector(`.pill[data-policy="${state.policy}"]`);
    if (pill) pill.classList.add('active');
  }

  initLocationSelector();
  initPolicyPills();

  if (!state.location) {
    // No saved location — show full-screen selector
    showLocationSelector();
    return;
  }

  // Location is saved — show app, set location label, load UV
  hideLocationSelector();
  document.getElementById('location-label').textContent = state.location.label;
  await loadAndRenderUV(state.location);
}
```

- [ ] **Step 3: Wire up retry button**

The retry button's onclick is set dynamically in `loadAndRenderUV` on error. Confirm it's present in `index.html` (already added in Task 1 scaffold).

- [ ] **Step 4: End-to-end manual test**

1. Open `index.html` fresh (no localStorage). Location selector should show full-screen.
2. Search "Wellington CBD" → select result → app should show UV card + chart + policy panel.
3. Select a policy pill → checklist and timeline appear.
4. Refresh page → app loads immediately with cached data and saved policy.
5. Click `[change]` → location selector re-appears, previous data cleared.

- [ ] **Step 5: Commit**

```bash
git add app.js
git commit -m "feat: boot sequence — init(), loadAndRenderUV(), renderAll() with cache/fresh logic"
```

---

## Task 11: Error Handling & Edge Cases

**Files:**
- Modify: `app.js` — handle all error states from the spec

- [ ] **Step 1: Verify "all UV low all day" is already handled**

No code changes needed. The spec requires a green "UV index is low all day" message when all UVI values are 0 or null. This is already covered by two existing behaviours:

1. `getDailyPeak()` returns `null` → `renderUVCard` displays "UV index is low all day" in the peak line
2. `getActions()` returns `active: false` → `renderChecklist` shows the green "No SunSmart measures required right now" banner

Manual verification: use fake data with all-zero UVI values in the browser console and confirm both messages appear:
```js
const allLow = { time: Array.from({length:24},(_,i)=>`2026-03-20T${String(i).padStart(2,'0')}:00`), uv_index: Array(24).fill(0) };
renderAll(allLow, { label: 'Test Location' });
```
Expected: peak line shows "UV index is low all day", checklist banner is green "no measures required".

- [ ] **Step 2: Handle Nominatim search "no results" empty state (already in Task 6)**

Verify: typing a non-existent query (e.g. "zzzzz") in address search shows "No results found — try a suburb name or school address" in the dropdown.

- [ ] **Step 3: Test offline behaviour**

1. Load app with a location (gets cached data).
2. In DevTools → Network → select "Offline".
3. Reload page → cached data should display with "Last updated [time]" warning, and Retry button.
4. Click Retry → should show error again (still offline).

- [ ] **Step 4: Test stale cache (yesterday)**

In browser console:
```js
// Manually set fetchedAt to yesterday to simulate stale cache
const cache = JSON.parse(localStorage.getItem('sunsmart_uv_cache'));
cache.fetchedAt = Date.now() - 86400000; // 24 hours ago
localStorage.setItem('sunsmart_uv_cache', JSON.stringify(cache));
location.reload();
```
Expected: stale data renders immediately with "Updating…" indicator, then fresh data replaces it and indicator hides.

- [ ] **Step 5: Verify "check back tomorrow" end-of-day state**

In browser console:
```js
// Temporarily override END_OF_DAY_HOUR
// (Can test by setting system clock past 7pm NZ, or mocking)
// Manual check: renderUVCard with any data, then check whether
// "end-of-day" element becomes visible
```
Note: this state triggers inside `renderUVCard` based on current NZ hour ≥ 19. Easiest to verify by temporarily changing `END_OF_DAY_HOUR = 0` in `app.js`, reloading, and confirming the banner shows.

- [ ] **Step 6: Commit any fixes found during verification**

If any code changes were made while working through the error states above, commit them now. If all states were verified without code changes, skip this step — no empty commits.

```bash
git add app.js index.html style.css
git commit -m "fix: error handling corrections from manual verification"
```

---

## Task 12: GitHub Pages Deployment

**Files:**
- No code changes — verify existing files deploy correctly

- [ ] **Step 1: Verify `index.html` is at repository root**

```bash
ls C:\Repos\SunSmart\index.html
```
Expected: file exists.

- [ ] **Step 2: Push to GitHub**

```bash
git push origin main
```

- [ ] **Step 3: Enable GitHub Pages**

1. Go to the repository on GitHub → **Settings** → **Pages**
2. Set Source to **Deploy from a branch**
3. Branch: `main`, folder: `/ (root)`
4. Click **Save**

- [ ] **Step 4: Verify deployment**

Wait ~60 seconds, then visit `https://<your-username>.github.io/<repo-name>/`.

Expected: App loads, location selector appears. Test on a real mobile browser.

- [ ] **Step 5: Test on mobile**

Open the GitHub Pages URL on a phone. Verify:
- Location search works
- GPS prompt works
- UV card renders correctly
- Chart is readable on small screen
- Policy pills and timeline are tappable

---

## Summary

| Task | What it builds |
|------|---------------|
| 1 | HTML shell, CSS tokens, JS stubs, test runner |
| 2 | Policy rules engine (`getActions`) + tests |
| 3 | UV data utilities (level, peak, window, timing) + tests |
| 4 | Cache & state management + tests |
| 5 | Open-Meteo + Nominatim API layer |
| 6 | Location selector UI (search + GPS) |
| 7 | UV data card rendering |
| 8 | UV chart (Chart.js) + data table |
| 9 | Policy action panel (checklist + timeline) |
| 10 | Boot sequence & full wiring |
| 11 | Error handling verification |
| 12 | GitHub Pages deployment |
