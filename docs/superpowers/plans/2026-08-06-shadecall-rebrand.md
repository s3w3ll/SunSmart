# ShadeCall Rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebrand the front end from "SunSmart" to "ShadeCall", migrating localStorage keys with a dual-read fallback so no existing user loses state.

**Architecture:** Introduce a three-function storage layer (`readKey` / `writeKey` / `removeKey`) that reads from the `shadecall_` prefix and falls back to `sunsmart_` on miss, writes only to the new prefix, and deletes from **both**. Route every localStorage access through it, then change display strings and internal identifiers. No URL, DNS, or infrastructure changes.

**Tech Stack:** Vanilla JS (ES2020), no build step, no package manager. Tests are a hand-rolled runner in `tests/test.js` executed with `node tests/test.js`. Cloudflare Worker (`workers/uv-notifier/`) deployed with Wrangler.

## Global Constraints

- **The URL does not change.** App stays on `sun.forgesync.co.nz`. Do not touch `CNAME`, DNS, or the Cloudflare Pages project.
- **The Worker is not renamed.** It is `uv-notifier`. `WORKER_URL` at `app.js:15` (`https://uv-notifier.forgesync.workers.dev`) must remain byte-identical — changing it breaks every existing push subscriber.
- **The KV namespace id `46571c253dc84c999343751ea8f70ebb` must not change.** Only the binding *name* changes. Changing the id orphans all subscriber data.
- **Writes go to `shadecall_` only. Reads fall back to `sunsmart_`. Deletes clear BOTH.** This asymmetry is the entire point of the migration — see Task 1.
- **There is no `package.json`.** Do not create one. Run tests with `node tests/test.js` from the repo root.
- Descriptive references to the SunSmart *programme* in body copy are intentional and must be **kept** (e.g. "helps your school meet its SunSmart obligations"). Only the app's *name* changes.
- New display name is exactly **ShadeCall** (one word, capital S, capital C).

---

### Task 1: Prefix-aware storage helpers

**Files:**
- Modify: `app.js:198-221` (CACHE & STATE section), `app.js:1026-1039` (exports)
- Test: `tests/test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `readKey(name: string) => string | null` — reads `shadecall_<name>`, falls back to `sunsmart_<name>`, returns `null` if neither exists.
  - `writeKey(name: string, value: string) => void` — writes `shadecall_<name>` only.
  - `removeKey(name: string) => void` — removes both `shadecall_<name>` and `sunsmart_<name>`.
  - Constants `STORAGE_PREFIX = 'shadecall_'`, `STORAGE_LEGACY_PREFIX = 'sunsmart_'`.
  - `name` is always the **short** key: `location`, `policy`, `uv_cache`, `push_subscribed`.

- [ ] **Step 1: Add a real localStorage stub to the test file**

`tests/test.js:6` currently has `global.localStorage = {};` — a bare object with no `getItem`/`setItem`. It works today only because no existing test touches storage. Replace that line with a factory:

```js
// Stub browser globals so app.js can be required without errors
global.document = { addEventListener: () => {} };

function makeLocalStorage(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    key: i => [...store.keys()][i] ?? null,
    get length() { return store.size; },
    _dump: () => Object.fromEntries(store),
  };
}
global.makeLocalStorage = makeLocalStorage;
global.localStorage = makeLocalStorage();
```

`app.js` resolves `localStorage` at call time, not at require time, so reassigning `global.localStorage` between tests works.

- [ ] **Step 2: Write the failing tests**

Add to `tests/test.js`, after the `isCacheValid()` block:

```js
// ============================================================
// Storage helpers — dual-read migration
// ============================================================
console.log('\nstorage helpers (dual-read)');

test('readKey falls back to the legacy key when the new key is absent', () => {
  global.localStorage = makeLocalStorage({ sunsmart_policy: '"primary"' });
  assert.strictEqual(readKey('policy'), '"primary"');
});

test('readKey prefers the new key when both exist', () => {
  global.localStorage = makeLocalStorage({
    sunsmart_policy:  '"primary"',
    shadecall_policy: '"secondary"',
  });
  assert.strictEqual(readKey('policy'), '"secondary"');
});

test('readKey returns null when neither key exists', () => {
  global.localStorage = makeLocalStorage();
  assert.strictEqual(readKey('policy'), null);
});

test('writeKey writes only the new prefix', () => {
  global.localStorage = makeLocalStorage();
  writeKey('policy', '"ec"');
  assert.deepStrictEqual(global.localStorage._dump(), { shadecall_policy: '"ec"' });
});

test('removeKey clears BOTH prefixes', () => {
  global.localStorage = makeLocalStorage({
    sunsmart_policy:  '"primary"',
    shadecall_policy: '"secondary"',
  });
  removeKey('policy');
  assert.deepStrictEqual(global.localStorage._dump(), {});
  assert.strictEqual(readKey('policy'), null);
});
```

Add `readKey`, `writeKey`, `removeKey` to the destructured `require(...)` at `tests/test.js:8-19`.

- [ ] **Step 3: Run tests to verify they fail**

Run: `node tests/test.js`
Expected: 5 failures with `TypeError: readKey is not a function`.

- [ ] **Step 4: Implement the helpers**

In `app.js`, insert directly above `function loadState()` at line 201:

```js
const STORAGE_PREFIX        = 'shadecall_';
const STORAGE_LEGACY_PREFIX = 'sunsmart_';

/**
 * Dual-read: prefer the current prefix, fall back to the pre-rebrand key.
 * Nothing is ever actively migrated — the fallback is permanent.
 */
function readKey(name) {
  const current = localStorage.getItem(STORAGE_PREFIX + name);
  if (current !== null) return current;
  return localStorage.getItem(STORAGE_LEGACY_PREFIX + name);
}

/** Writes only ever land on the current prefix. */
function writeKey(name, value) {
  localStorage.setItem(STORAGE_PREFIX + name, value);
}

/**
 * Deletes MUST clear both prefixes. Clearing only the current key would let
 * readKey() fall back to the surviving legacy key and resurrect state the user
 * just cleared — sign-out would leak the previous school's location, and
 * unsubscribe would leave the UI stuck showing "subscribed".
 */
function removeKey(name) {
  localStorage.removeItem(STORAGE_PREFIX + name);
  localStorage.removeItem(STORAGE_LEGACY_PREFIX + name);
}
```

Add `readKey`, `writeKey`, `removeKey` to the `module.exports` object at `app.js:1027-1038`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `node tests/test.js`
Expected: all pass, including the pre-existing tests.

- [ ] **Step 6: Commit**

```bash
git add app.js tests/test.js
git commit -m "feat: add dual-read storage helpers for ShadeCall rebrand"
```

---

### Task 2: Route every localStorage access through the helpers

**Files:**
- Modify: `app.js:201-221`, `app.js:234`, `app.js:396`, `app.js:574`, `app.js:741-743`, `app.js:856-857`, `app.js:912`, `app.js:930`, `app.js:953`, `app.js:967`
- Test: `tests/test.js`

**Interfaces:**
- Consumes: `readKey`, `writeKey`, `removeKey` from Task 1.
- Produces: `saveState(shortName, value)` and `clearState(shortName)` now take **short** key names (`'policy'`), not full ones (`'sunsmart_policy'`). Every caller must be updated in this task.

> **Why this is required, not cleanup:** `app.js:912`, `:930`, `:953`, `:967` call `localStorage` **directly**, bypassing the state helpers every other key uses. The dual-read fallback lives inside `readKey`, so those four call sites would silently skip the migration entirely — the push flag would be lost on rebrand and desync from the Worker's KV.

- [ ] **Step 1: Write the failing tests**

Append to the storage block in `tests/test.js`:

```js
test('loadState reads legacy keys written before the rebrand', () => {
  global.localStorage = makeLocalStorage({
    sunsmart_location: '{"lat":-41.28,"long":174.78,"label":"Wellington"}',
    sunsmart_policy:   '"primary"',
  });
  const state = loadState();
  assert.strictEqual(state.policy, 'primary');
  assert.strictEqual(state.location.label, 'Wellington');
});

test('saveState writes the new prefix only', () => {
  global.localStorage = makeLocalStorage({ sunsmart_policy: '"primary"' });
  saveState('policy', 'ec');
  const dump = global.localStorage._dump();
  assert.strictEqual(dump.shadecall_policy, '"ec"');
  assert.strictEqual(dump.sunsmart_policy, '"primary"'); // untouched
  assert.strictEqual(loadState().policy, 'ec');          // new key wins
});

test('clearState removes a legacy key so it cannot resurrect', () => {
  global.localStorage = makeLocalStorage({
    sunsmart_location: '{"label":"Wellington"}',
    sunsmart_policy:   '"primary"',
  });
  clearState('location');
  clearState('policy');
  assert.deepStrictEqual(global.localStorage._dump(), {});
  assert.strictEqual(loadState().location, null);
  assert.strictEqual(loadState().policy, null);
});
```

Add `loadState`, `saveState`, `clearState` to the destructured `require(...)` in `tests/test.js`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node tests/test.js`
Expected: failures — `loadState is not a function`, and once exported, `clearState` leaves the legacy keys behind.

- [ ] **Step 3: Rewrite the state functions**

Replace `app.js:201-221` (`loadState` / `saveState` / `clearState`) with:

```js
function loadState() {
  try {
    return {
      location: JSON.parse(readKey('location') || 'null'),
      policy:   JSON.parse(readKey('policy')   || 'null'),
      uvCache:  JSON.parse(readKey('uv_cache') || 'null'),
    };
  } catch {
    return { location: null, policy: null, uvCache: null };
  }
}

function saveState(key, value) {
  try {
    writeKey(key, JSON.stringify(value));
  } catch { /* storage full — silently ignore */ }
}

function clearState(key) {
  try { removeKey(key); } catch { /* ignore */ }
}
```

Add `loadState`, `saveState`, `clearState` to `module.exports`.

- [ ] **Step 4: Update every caller to short key names**

| Line | Before | After |
|---|---|---|
| `app.js:234` | `saveState('sunsmart_uv_cache', {...})` | `saveState('uv_cache', {...})` |
| `app.js:396` | `saveState('sunsmart_location', location)` | `saveState('location', location)` |
| `app.js:574` | `saveState('sunsmart_policy', policyType)` | `saveState('policy', policyType)` |
| `app.js:741` | `clearState('sunsmart_location')` | `clearState('location')` |
| `app.js:742` | `clearState('sunsmart_policy')` | `clearState('policy')` |
| `app.js:743` | `clearState('sunsmart_uv_cache')` | `clearState('uv_cache')` |
| `app.js:856` | `clearState('sunsmart_location')` | `clearState('location')` |
| `app.js:857` | `clearState('sunsmart_uv_cache')` | `clearState('uv_cache')` |

- [ ] **Step 5: Convert the four direct push-flag calls**

The push flag is a raw `'true'` string, **not** JSON. Use `readKey`/`writeKey`/`removeKey` directly — do **not** route it through `saveState`/`clearState`, which would JSON-encode it and break the `=== 'true'` comparisons.

| Line | Before | After |
|---|---|---|
| `app.js:912` | `localStorage.setItem('sunsmart_push_subscribed', 'true')` | `writeKey('push_subscribed', 'true')` |
| `app.js:930` | `localStorage.removeItem('sunsmart_push_subscribed')` | `removeKey('push_subscribed')` |
| `app.js:953` | `localStorage.getItem('sunsmart_push_subscribed') === 'true'` | `readKey('push_subscribed') === 'true'` |
| `app.js:967` | `localStorage.getItem('sunsmart_push_subscribed') === 'true'` | `readKey('push_subscribed') === 'true'` |

- [ ] **Step 6: Verify no direct localStorage access remains outside the helpers**

Run: `grep -n "localStorage\." app.js`
Expected: exactly five hits — the three inside `readKey`/`writeKey`/`removeKey` (two in `removeKey`), and none anywhere else. Any other hit is a missed call site.

Run: `grep -n "sunsmart_" app.js`
Expected: exactly one hit — the `STORAGE_LEGACY_PREFIX` constant.

- [ ] **Step 7: Run tests**

Run: `node tests/test.js`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add app.js tests/test.js
git commit -m "refactor: route all localStorage access through prefix-aware helpers"
```

---

### Task 3: Rename `getSunSmartWindow` → `getProtectionWindow`

**Files:**
- Modify: `app.js:168` (definition), `app.js:181` (call inside `getSunscreenTiming`), `app.js:1035` (export)
- Test: `tests/test.js:16`, `:155`, `:160`, `:166`, `:172`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `getProtectionWindow(hourlyData) => { start: string, end: string } | null` — identical behaviour and return shape to the old name.

- [ ] **Step 1: Rename in the test file first**

In `tests/test.js`, change the import at line 16 and all four usages (lines 155, 160, 166, 172) from `getSunSmartWindow` to `getProtectionWindow`. Also update the section header string at line 155 to `getProtectionWindow()`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node tests/test.js`
Expected: failures — `getProtectionWindow is not a function`.

- [ ] **Step 3: Rename in app.js**

Rename the function declaration at `app.js:168`, the internal call at `app.js:181` (inside `getSunscreenTiming`), and the export at `app.js:1035`. Behaviour is unchanged — this is a pure identifier rename.

Verify: `grep -n "getSunSmartWindow" app.js tests/test.js` returns nothing.

- [ ] **Step 4: Run tests**

Run: `node tests/test.js`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add app.js tests/test.js
git commit -m "refactor: rename getSunSmartWindow to getProtectionWindow"
```

---

### Task 4: Front-end display strings

**Files:**
- Modify: `index.html:6`, `index.html:15`, `index.html:38`, `index.html:78`, `index.html:84`, `index.html:104`
- Modify: `workers/uv-notifier/index.js:159`
- Modify: `tests/test.js:36`

**Interfaces:** none — user-visible copy only.

- [ ] **Step 1: Update the page title and heading**

`index.html:6`:
```html
  <title>ShadeCall — UV guidance for NZ schools</title>
```

`index.html:15`:
```html
      <h1 class="app-title">☀️ ShadeCall</h1>
```

- [ ] **Step 1b: Neutralise the four aria-labels**

These are screen-reader-visible. Decision (2026-08-06): drop the brand from the
accessibility layer entirely and describe **function** instead — screen-reader
users gain nothing from the product name repeated on every landmark, and
function-based labels survive any future rename untouched.

| Line | Before | After |
|---|---|---|
| `index.html:38` | `aria-label="SunSmart UV dashboard"` | `aria-label="UV dashboard"` |
| `index.html:78` | `aria-label="Hourly SunSmart timeline"` | `aria-label="Hourly UV timeline"` |
| `index.html:84` | `aria-label="SunSmart policy actions"` | `aria-label="Sun protection policy actions"` |
| `index.html:104` | `aria-label="SunSmart actions"` | `aria-label="Sun protection actions"` |

Do **not** introduce "ShadeCall" into any `aria-label`.

- [ ] **Step 2: Update the push notification body**

`workers/uv-notifier/index.js:159` — this is the only place the old name is actively transmitted to users' devices:

```js
    body: 'Sun protection required — hats, sunscreen, shade.',
```

Leave the title on line 158 (`☀️ UV is now ${uvValue} at ${locationLabel}`) unchanged — it carries no branding.

- [ ] **Step 3: Update the test banner**

`tests/test.js:36`:
```js
console.log('\n=== ShadeCall Unit Tests ===\n');
```

- [ ] **Step 4: Verify**

Run: `grep -rn "SunSmart" index.html workers/ tests/`
Expected: no hits.

Run: `node tests/test.js`
Expected: all pass, banner reads "ShadeCall Unit Tests".

- [ ] **Step 5: Commit**

```bash
git add index.html workers/uv-notifier/index.js tests/test.js
git commit -m "feat: rebrand user-facing strings to ShadeCall"
```

---

### Task 5: Rename the KV binding

**Files:**
- Modify: `workers/uv-notifier/wrangler.toml:6`
- Modify: `workers/uv-notifier/index.js:56, 64, 75, 79, 89, 96, 106, 109, 113`

**Interfaces:**
- Consumes: nothing.
- Produces: Worker env binding `env.shadecall_subscriptions` replacing `env.sunsmart_subscriptions`.

> **Data safety:** the namespace `id` on `wrangler.toml:7` (`46571c253dc84c999343751ea8f70ebb`) is what holds subscriber data. It must **not** change. Only the binding name — a variable name — changes.

- [ ] **Step 1: Rename the binding in wrangler.toml**

`workers/uv-notifier/wrangler.toml`:
```toml
[[kv_namespaces]]
binding = "shadecall_subscriptions"
id = "46571c253dc84c999343751ea8f70ebb"
```

- [ ] **Step 2: Rename all nine references in the Worker**

In `workers/uv-notifier/index.js`, replace every `env.sunsmart_subscriptions` with `env.shadecall_subscriptions` (lines 56, 64, 75, 79, 89, 96, 106, 109, 113).

- [ ] **Step 3: Verify no references remain**

Run: `grep -rn "sunsmart" workers/`
Expected: no hits.

- [ ] **Step 4: Dry-run the Worker build**

Run: `cd workers/uv-notifier && npx wrangler deploy --dry-run`
Expected: build succeeds, output lists the KV binding as `shadecall_subscriptions` with the unchanged id.

**Do not deploy in this task.** Deployment is a separate, user-authorised step — see "After the plan" below.

- [ ] **Step 5: Commit**

```bash
git add workers/uv-notifier/wrangler.toml workers/uv-notifier/index.js
git commit -m "refactor: rename KV binding to shadecall_subscriptions"
```

---

### Task 6: Documentation

**Files:**
- Modify: `README.md`, `CLAUDE.md`, `.claude/docs/api-notes.md`

**Interfaces:** none.

- [ ] **Step 1: Update CLAUDE.md**

- Replace the project name in the title and "What This Project Is" section with ShadeCall. Keep the description of *what* it does unchanged, including any descriptive reference to schools' SunSmart obligations.
- In the **localStorage Keys** table: rename the prefix to `shadecall_`, and **delete the `sunsmart_guest` row entirely** — that key does not exist. The string "guest" appears nowhere in `app.js`; guest mode is inferred from the absence of a Supabase session.
- Add a line under "Important Decisions / Constraints":

```markdown
- **Renamed from "SunSmart" to "ShadeCall" (2026-08-06)** — "SunSmart" is the Cancer Society NZ programme name (`sunsmart.org.nz`), same audience and subject, so the old name risked implying official endorsement. URL stays `sun.forgesync.co.nz`. localStorage reads fall back to the legacy `sunsmart_` prefix indefinitely; writes use `shadecall_`; deletes clear both. See `docs/superpowers/specs/2026-08-06-shadecall-rename-design.md`.
```

- [ ] **Step 2: Update README.md**

Replace the 10 "SunSmart" occurrences with ShadeCall, except any that describe the Cancer Society programme itself. Keep the live URL as `sun.forgesync.co.nz`.

- [ ] **Step 3: Fix the stale api-notes.md**

`.claude/docs/api-notes.md` documents the **NIWA** API as the UV source. The app uses **Open-Meteo** (`app.js:251`). Add this at the top of the file, below the title:

```markdown
> **STATUS: PARTIALLY STALE (checked 2026-08-06).** The app fetches UV data from
> **Open-Meteo**, not NIWA — see `app.js:251`. The NIWA material below is retained
> because a NIWA data licence is being pursued; it is reference for a possible
> future source, not a description of current behaviour.
>
> Verified against the live NIWA API on 2026-08-06: `/data` returns 73 hourly
> points spanning exactly 72 hours, from 06:00 NZ today to 06:00 NZ +3 days,
> for both `cloudy_sky_uv_index` and `clear_sky_uv_index`. Timestamps are UTC
> with a `Z` suffix — unlike Open-Meteo, which returns naive NZ-local strings.
> NIWA's standard API terms permit internal use only and forbid redistribution
> to third parties, so a product licence is required before shipping on it.
```

- [ ] **Step 4: Verify**

Run: `grep -rn "sunsmart" --include="*.md" . | grep -v "docs/superpowers" | grep -vi "cancer\|programme\|obligation"`
Expected: no hits other than intentional references to the Cancer Society programme.

- [ ] **Step 5: Commit**

```bash
git add README.md CLAUDE.md .claude/docs/api-notes.md
git commit -m "docs: update for ShadeCall rebrand, fix stale localStorage and API notes"
```

---

### Task 7: Neutralise app-owned SunSmart strings in app.js

**Files:**
- Modify: `app.js` lines 304, 322, 462, 469, 472, 547, 646

**Interfaces:** none — user-visible copy, one comment, and two HTTP headers.

> **Why this task exists:** the original plan's verification only grepped
> `index.html workers/ tests/` — it never checked `app.js`, which still held 12
> "SunSmart" occurrences. Human decision 2026-08-06: neutralise the strings
> where the app speaks in its own voice; keep the ones that name the
> programme's *measures*.

**KEEP these five untouched** — they are correct descriptive references to the
Cancer Society programme and must survive:

| Line | String |
|---|---|
| `app.js:30` | `'Staff must follow and model all SunSmart measures.'` |
| `app.js:44` | `'Staff must follow and model all SunSmart measures.'` |
| `app.js:57` | `'Staff must follow and model all SunSmart measures.'` |
| `app.js:649` | `'✓ No SunSmart measures required right now'` |
| `app.js:722` | `No SunSmart measures required at this hour.` |

- [ ] **Step 1: Change the two User-Agent headers**

`app.js:304` and `app.js:322` — the app identifying itself to Nominatim:

```js
    headers: { 'Accept-Language': 'en', 'User-Agent': 'ShadeCall-NZ/1.0' },
```

- [ ] **Step 2: Neutralise the four UI strings and one comment**

| Line | Before | After |
|---|---|---|
| `app.js:462` | `// SunSmart active window` | `// Protection active window` |
| `app.js:469` | `` `SunSmart hours: ${formatHour(uvWindow.start)} – ${formatHour(uvWindow.end)}` `` | `` `Protection hours: ${formatHour(uvWindow.start)} – ${formatHour(uvWindow.end)}` `` |
| `app.js:472` | `'No SunSmart hours today'` | `'No protection hours today'` |
| `app.js:547` | `'SunSmart threshold (UVI 3)'` | `'Protection threshold (UVI 3)'` |
| `app.js:646` | `` `☀️ SunSmart is active now (UVI ${currentUVI.toFixed(1)} — ${UV_LEVEL_LABELS[lvl] \|\| ''})` `` | `` `☀️ Sun protection required now (UVI ${currentUVI.toFixed(1)} — ${UV_LEVEL_LABELS[lvl] \|\| ''})` `` |

Preserve every template literal, interpolation, en dash (–), em dash (—), and
the ☀️ emoji exactly. Only the words change.

- [ ] **Step 3: Verify**

Run: `grep -n "SunSmart" app.js`
Expected: **exactly 5 hits** — lines 30, 44, 57, 649, 722 (the KEEP table above).
Any other hit means a string was missed; any fewer means a programme reference
was wrongly removed.

Run: `node tests/test.js`
Expected: 47 passed, 0 failed.

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "feat: neutralise app-owned SunSmart strings, keep programme references"
```

---

## After the plan

These are **not** plan tasks — they require explicit user authorisation:

1. **Deploy the Worker** (`npx wrangler deploy` in `workers/uv-notifier/`). Until this runs, the deployed Worker still uses the old binding name. The code change in Task 5 is inert until deployed, and the old and new Worker code are not simultaneously valid — deploy promptly after merging.
2. **Trademark clearance** — no IPONZ search has been done for "ShadeCall". Web search found no existing product, but that is not clearance.
3. **NIWA licence** — tracked separately; blocks any switch away from Open-Meteo.

## Verification checklist

After all six tasks:

- [ ] `node tests/test.js` — all pass
- [ ] `grep -rn "sunsmart_" app.js` — one hit only (`STORAGE_LEGACY_PREFIX`)
- [ ] `grep -rn "SunSmart" index.html app.js workers/ tests/` — no hits
- [ ] `grep -n "localStorage\." app.js` — five hits, all inside the three helpers
- [ ] `cat CNAME` — still `sun.forgesync.co.nz`
- [ ] `grep -n "WORKER_URL" app.js` — still `https://uv-notifier.forgesync.workers.dev`
- [ ] `grep -n "^id" workers/uv-notifier/wrangler.toml` — still `46571c253dc84c999343751ea8f70ebb`
- [ ] Manual: load the app with a pre-existing `sunsmart_location` in localStorage; confirm the saved location loads and the app does not show the setup screen.
- [ ] Manual: sign out, then reload; confirm the location does **not** reappear.
