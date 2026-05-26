# Push Notifications — UV Threshold Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alert users via Web Push each time the UV index rises above 3 for their location, checked every 10 minutes between 9am–4pm NZST, even when the browser is closed.

**Architecture:** A Cloudflare Worker (`workers/uv-notifier`) handles subscription storage (Cloudflare KV) and runs two cron jobs — a 10-minute UV checker and a midnight state reset. The browser subscribes via the Web Push API using a service worker (`sw.js`), and the client-side toggle in `app.js` manages subscribe/unsubscribe flows.

**Tech Stack:** Cloudflare Workers, Cloudflare KV, Web Push API, VAPID, Wrangler CLI, vanilla JS

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `sw.js` | Create | Minimal service worker — receives push events, shows notifications |
| `workers/uv-notifier/index.js` | Create | Cloudflare Worker: subscribe/unsubscribe routes + cron handlers |
| `workers/uv-notifier/wrangler.toml` | Create | Worker config: KV binding, cron triggers, secrets |
| `workers/uv-notifier/package.json` | Create | Worker dependencies (web-push) |
| `index.html` | Modify | Add notify toggle button inside `#uv-card` |
| `app.js` | Modify | Add VAPID key constant, `initNotifications()`, subscribe/unsubscribe logic |
| `style.css` | Modify | Style the notify toggle and permission-denied helper text |
| `tests/test-worker.js` | Create | Unit tests for Worker UV crossing logic and cron time-window check |

---

## Task 1: Generate VAPID Keys and Create Worker Scaffold

**Files:**
- Create: `workers/uv-notifier/`
- Create: `workers/uv-notifier/package.json`
- Create: `workers/uv-notifier/wrangler.toml`

- [ ] **Step 1: Install Wrangler if not present**

```bash
npm install -g wrangler
wrangler --version
```

Expected output: `⛅️ wrangler X.X.X`

- [ ] **Step 2: Generate VAPID keys**

```bash
wrangler generate-vapid-keys
```

Expected output:
```
VAPID_PUBLIC_KEY=Bxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
VAPID_PRIVATE_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Copy both values — you'll need them in later steps. The public key goes in `app.js`; the private key becomes a Worker secret.

- [ ] **Step 3: Create Worker directory**

```bash
mkdir -p workers/uv-notifier
```

- [ ] **Step 4: Create `workers/uv-notifier/package.json`**

```json
{
  "name": "uv-notifier",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "web-push": "^3.6.7"
  }
}
```

- [ ] **Step 5: Install Worker dependencies**

```bash
cd workers/uv-notifier && npm install
```

- [ ] **Step 6: Create `workers/uv-notifier/wrangler.toml`**

Replace `YOUR_ACCOUNT_ID` with your Cloudflare account ID (find it at dash.cloudflare.com → right sidebar).

```toml
name = "uv-notifier"
main = "index.js"
compatibility_date = "2024-01-01"
account_id = "YOUR_ACCOUNT_ID"

[[kv_namespaces]]
binding = "SUBSCRIPTIONS"
id = "PLACEHOLDER_REPLACE_AFTER_KV_CREATE"

[triggers]
crons = ["*/10 * * * *", "0 0 * * *"]
```

- [ ] **Step 7: Create the KV namespace**

```bash
wrangler kv namespace create sunsmart-subscriptions
```

Expected output includes an `id` field. Copy that ID and replace `PLACEHOLDER_REPLACE_AFTER_KV_CREATE` in `wrangler.toml`.

- [ ] **Step 8: Store secrets**

Replace the placeholder values with your actual keys from Step 2 and a random 32-char string for `SUBSCRIBE_SECRET`.

```bash
wrangler secret put VAPID_PRIVATE_KEY
# paste your VAPID_PRIVATE_KEY when prompted

wrangler secret put VAPID_PUBLIC_KEY
# paste your VAPID_PUBLIC_KEY when prompted

wrangler secret put SUBSCRIBE_SECRET
# paste a random secret, e.g.: openssl rand -hex 16
```

- [ ] **Step 9: Commit scaffold**

```bash
git add workers/
git commit -m "feat: scaffold uv-notifier Worker with KV and VAPID config"
```

---

## Task 2: Write Worker Unit Tests

**Files:**
- Create: `tests/test-worker.js`

These tests cover the two pure-logic functions in the Worker (no Cloudflare runtime needed).

- [ ] **Step 1: Create `tests/test-worker.js`**

```js
// Tests for Worker helper functions (run with: node tests/test-worker.js)

// ── isWithinNotifyWindow ──────────────────────────────────────────────────────
// Returns true if the given UTC Date is between 9am and 4pm NZST (UTC+12 / UTC+13 DST).
// NZ standard time = UTC+12. NZ daylight saving (Sep–Apr) = UTC+13.
// We test both offsets since the worker uses Intl to resolve actual NZ local hour.

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

// ── shouldNotify ─────────────────────────────────────────────────────────────
// Returns true only when UV just crossed above 3 (was below, now at or above).

function shouldNotify(lastUV, currentUV) {
  return lastUV < 3 && currentUV >= 3;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

console.log('\nisWithinNotifyWindow:');
assert('9am NZ is in window',  isWithinNotifyWindow(new Date('2026-05-26T21:00:00Z'))); // 9am NZST = UTC+12
assert('3:59pm NZ is in window', isWithinNotifyWindow(new Date('2026-05-26T03:59:00Z'))); // 3:59pm NZST next day UTC
assert('4:00pm NZ is outside window', !isWithinNotifyWindow(new Date('2026-05-26T04:00:00Z')));
assert('8:59am NZ is outside window', !isWithinNotifyWindow(new Date('2026-05-26T20:59:00Z')));

console.log('\nshouldNotify:');
assert('UV crosses from 2.9 to 3.0 → notify',  shouldNotify(2.9, 3.0));
assert('UV crosses from 0 to 5 → notify',       shouldNotify(0, 5));
assert('UV stays at 3 → no notify',             !shouldNotify(3, 3));
assert('UV stays at 5 → no notify',             !shouldNotify(5, 6));
assert('UV drops from 4 to 2 → no notify',      !shouldNotify(4, 2));
assert('UV was reset to 0, now 3 → notify',     shouldNotify(0, 3));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Run tests — expect all pass**

```bash
node tests/test-worker.js
```

Expected output:
```
isWithinNotifyWindow:
  ✓ 9am NZ is in window
  ✓ 3:59pm NZ is in window
  ✓ 4:00pm NZ is outside window
  ✓ 8:59am NZ is outside window

shouldNotify:
  ✓ UV crosses from 2.9 to 3.0 → notify
  ✓ UV crosses from 0 to 5 → notify
  ✓ UV stays at 3 → no notify
  ✓ UV stays at 5 → no notify
  ✓ UV drops from 4 to 2 → no notify
  ✓ UV was reset to 0, now 3 → notify

10 passed, 0 failed
```

- [ ] **Step 3: Commit**

```bash
git add tests/test-worker.js
git commit -m "test: add Worker UV crossing and time-window unit tests"
```

---

## Task 3: Implement the Cloudflare Worker

**Files:**
- Create: `workers/uv-notifier/index.js`

- [ ] **Step 1: Create `workers/uv-notifier/index.js`**

```js
import webpush from 'web-push';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!authorised(request, env)) {
      return new Response('Forbidden', { status: 403 });
    }

    if (request.method === 'POST' && url.pathname === '/subscribe') {
      return handleSubscribe(request, env);
    }
    if (request.method === 'DELETE' && url.pathname === '/unsubscribe') {
      return handleUnsubscribe(request, env);
    }
    return new Response('Not found', { status: 404 });
  },

  async scheduled(event, env) {
    if (event.cron === '0 0 * * *') {
      await resetLastUV(env);
    } else {
      await checkAndNotify(env);
    }
  },
};

// ── Auth ──────────────────────────────────────────────────────────────────────

function authorised(request, env) {
  return request.headers.get('X-Subscribe-Secret') === env.SUBSCRIBE_SECRET;
}

// ── Routes ────────────────────────────────────────────────────────────────────

async function handleSubscribe(request, env) {
  const { subscription, location } = await request.json();
  if (!subscription?.endpoint || !location?.lat || !location?.long) {
    return new Response('Bad request', { status: 400 });
  }
  const key = await endpointKey(subscription.endpoint);
  const entry = { pushSubscription: subscription, location, lastUV: 0, lastNotifiedAt: null };
  await env.SUBSCRIPTIONS.put(key, JSON.stringify(entry));
  return new Response('OK', { status: 200 });
}

async function handleUnsubscribe(request, env) {
  const { endpoint } = await request.json();
  if (!endpoint) return new Response('Bad request', { status: 400 });
  const key = await endpointKey(endpoint);
  await env.SUBSCRIPTIONS.delete(key);
  return new Response('OK', { status: 200 });
}

// ── Cron: UV check ────────────────────────────────────────────────────────────

async function checkAndNotify(env) {
  if (!isWithinNotifyWindow(new Date())) return;

  webpush.setVapidDetails(
    'mailto:hayden.sewell@gmail.com',
    env.VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY,
  );

  let cursor;
  do {
    const list = await env.SUBSCRIPTIONS.list({ cursor, limit: 1000 });
    cursor = list.cursor;

    await Promise.all(list.keys.map(async ({ name }) => {
      const raw = await env.SUBSCRIPTIONS.get(name);
      if (!raw) return;
      const entry = JSON.parse(raw);

      const currentUV = await fetchCurrentUV(entry.location.lat, entry.location.long);
      if (currentUV === null) return; // Open-Meteo unavailable — skip, preserve lastUV

      if (shouldNotify(entry.lastUV, currentUV)) {
        const sent = await sendPush(entry.pushSubscription, entry.location.label, currentUV, env);
        if (sent === 'gone') {
          await env.SUBSCRIPTIONS.delete(name);
          return;
        }
        entry.lastNotifiedAt = new Date().toISOString();
      }

      entry.lastUV = currentUV;
      await env.SUBSCRIPTIONS.put(name, JSON.stringify(entry));
    }));
  } while (cursor);
}

// ── Cron: midnight reset ──────────────────────────────────────────────────────

async function resetLastUV(env) {
  let cursor;
  do {
    const list = await env.SUBSCRIPTIONS.list({ cursor, limit: 1000 });
    cursor = list.cursor;
    await Promise.all(list.keys.map(async ({ name }) => {
      const raw = await env.SUBSCRIPTIONS.get(name);
      if (!raw) return;
      const entry = JSON.parse(raw);
      entry.lastUV = 0;
      await env.SUBSCRIPTIONS.put(name, JSON.stringify(entry));
    }));
  } while (cursor);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

async function fetchCurrentUV(lat, long) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${long}&hourly=uv_index&timezone=Pacific%2FAuckland&forecast_days=1`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const nzHour = parseInt(
      new Intl.DateTimeFormat('en-NZ', {
        timeZone: 'Pacific/Auckland',
        hour: 'numeric',
        hour12: false,
      }).format(new Date()),
      10
    );
    return Math.round(json.hourly.uv_index[nzHour] * 10) / 10;
  } catch {
    return null;
  }
}

async function sendPush(subscription, locationLabel, uvValue, env) {
  const payload = JSON.stringify({
    title: `☀️ UV is now ${uvValue} at ${locationLabel}`,
    body: 'SunSmart measures required — hats, sunscreen, shade.',
  });
  try {
    await webpush.sendNotification(subscription, payload);
    return 'ok';
  } catch (err) {
    if (err.statusCode === 410) return 'gone';
    return 'error';
  }
}

async function endpointKey(endpoint) {
  const data = new TextEncoder().encode(endpoint);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}
```

- [ ] **Step 2: Run unit tests to confirm helper functions match implementation**

```bash
node tests/test-worker.js
```

Expected: `10 passed, 0 failed`

- [ ] **Step 3: Commit**

```bash
git add workers/uv-notifier/index.js
git commit -m "feat: implement uv-notifier Worker with subscribe, cron UV check, and midnight reset"
```

---

## Task 4: Deploy the Worker

**Files:**
- Modify: `workers/uv-notifier/wrangler.toml` (confirm KV ID is set from Task 1)

- [ ] **Step 1: Verify wrangler.toml has real KV ID**

Open `workers/uv-notifier/wrangler.toml` and confirm `id` under `[[kv_namespaces]]` is the real ID from Task 1 Step 7 (not the placeholder string).

- [ ] **Step 2: Deploy**

```bash
cd workers/uv-notifier && wrangler deploy
```

Expected output ends with:
```
✨ Success! Deployed uv-notifier to https://uv-notifier.<your-subdomain>.workers.dev
```

Copy the Worker URL — you'll need it in Task 5.

- [ ] **Step 3: Test subscribe endpoint**

Replace `YOUR_WORKER_URL` and `YOUR_SUBSCRIBE_SECRET` with real values.

```bash
curl -X POST https://YOUR_WORKER_URL/subscribe \
  -H "Content-Type: application/json" \
  -H "X-Subscribe-Secret: YOUR_SUBSCRIBE_SECRET" \
  -d '{"subscription":{"endpoint":"https://test.example.com","keys":{"p256dh":"test","auth":"test"}},"location":{"lat":-36.85,"long":174.76,"label":"Auckland"}}'
```

Expected: `200 OK`

- [ ] **Step 4: Test unsubscribe endpoint**

```bash
curl -X DELETE https://YOUR_WORKER_URL/unsubscribe \
  -H "Content-Type: application/json" \
  -H "X-Subscribe-Secret: YOUR_SUBSCRIBE_SECRET" \
  -d '{"endpoint":"https://test.example.com"}'
```

Expected: `200 OK`

- [ ] **Step 5: Commit wrangler.toml with real KV ID**

```bash
cd ../..
git add workers/uv-notifier/wrangler.toml
git commit -m "feat: set real KV namespace ID in wrangler.toml"
```

---

## Task 5: Create the Service Worker (`sw.js`)

**Files:**
- Create: `sw.js`

- [ ] **Step 1: Create `sw.js` in the project root**

```js
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : { title: '☀️ UV Alert', body: 'UV has risen above 3.' };
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'uv-alert',
      renotify: true,
    })
  );
});
```

`tag: 'uv-alert'` with `renotify: true` means each new notification replaces the previous UV alert banner rather than stacking up — suitable for a recurring threshold check.

- [ ] **Step 2: Add a placeholder icon (if one doesn't exist)**

If `icon-192.png` doesn't exist at the project root, create a minimal one or use any existing PNG. Without it, notifications will still show but without an icon.

```bash
ls *.png 2>/dev/null || echo "No PNG found — add icon-192.png to project root for notification icons"
```

- [ ] **Step 3: Commit**

```bash
git add sw.js
git commit -m "feat: add minimal service worker for push notifications"
```

---

## Task 6: Add Notify Toggle to `index.html`

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add the notify toggle inside `#uv-card`, after the `uv-stale-warning` paragraph**

Find this line in `index.html` (around line 59):
```html
      <p id="uv-stale-warning" class="stale-warning hidden" aria-live="polite"></p>
    </section>
```

Replace with:
```html
      <p id="uv-stale-warning" class="stale-warning hidden" aria-live="polite"></p>
      <div class="notify-row">
        <button id="notify-btn" class="btn-link notify-btn" type="button" aria-pressed="false">
          🔔 Notify me when UV hits 3
        </button>
        <p id="notify-denied" class="notify-denied hidden">
          Notifications blocked — <a href="https://support.google.com/chrome/answer/3220216" target="_blank" rel="noopener">enable in browser settings</a>
        </p>
      </div>
    </section>
```

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "feat: add notify toggle button to UV card"
```

---

## Task 7: Add Notification Logic to `app.js`

**Files:**
- Modify: `app.js`

- [ ] **Step 1: Add VAPID public key and Worker URL constants at the top of `app.js`, after the existing config block (around line 9)**

Replace `YOUR_VAPID_PUBLIC_KEY` with the public key from Task 1 Step 2. Replace `YOUR_WORKER_URL` with the deployed Worker URL from Task 4 Step 2.

```js
const VAPID_PUBLIC_KEY = 'YOUR_VAPID_PUBLIC_KEY';
const WORKER_URL = 'https://YOUR_WORKER_URL';
const SUBSCRIBE_SECRET = 'YOUR_SUBSCRIBE_SECRET';
```

- [ ] **Step 2: Add `initNotifications()` function to `app.js` before the final `boot()` call**

Find the bottom of `app.js` near the `boot()` call and add this block above it:

```js
/* ============================================================
   PUSH NOTIFICATIONS
   ============================================================ */

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

async function subscribeToPush(location) {
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });
  await fetch(`${WORKER_URL}/subscribe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Subscribe-Secret': SUBSCRIBE_SECRET,
    },
    body: JSON.stringify({ subscription: subscription.toJSON(), location }),
  });
  localStorage.setItem('sunsmart_push_subscribed', 'true');
}

async function unsubscribeFromPush() {
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  if (!reg) return;
  const subscription = await reg.pushManager.getSubscription();
  if (subscription) {
    await fetch(`${WORKER_URL}/unsubscribe`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'X-Subscribe-Secret': SUBSCRIBE_SECRET,
      },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
    await subscription.unsubscribe();
  }
  localStorage.removeItem('sunsmart_push_subscribed');
}

function initNotifications() {
  const btn = document.getElementById('notify-btn');
  const denied = document.getElementById('notify-denied');
  if (!btn || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    if (btn) btn.style.display = 'none'; // hide if push not supported
    return;
  }

  const isSubscribed = localStorage.getItem('sunsmart_push_subscribed') === 'true';
  updateNotifyButton(btn, isSubscribed);

  btn.addEventListener('click', async () => {
    const location = appState.location;
    if (!location) return;

    if (localStorage.getItem('sunsmart_push_subscribed') === 'true') {
      await unsubscribeFromPush();
      updateNotifyButton(btn, false);
      denied.classList.add('hidden');
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission === 'denied') {
      denied.classList.remove('hidden');
      return;
    }
    if (permission !== 'granted') return;

    await subscribeToPush(location);
    updateNotifyButton(btn, true);
    denied.classList.add('hidden');
  });
}

function updateNotifyButton(btn, subscribed) {
  btn.textContent = subscribed ? '🔕 Turn off UV alerts' : '🔔 Notify me when UV hits 3';
  btn.setAttribute('aria-pressed', String(subscribed));
}
```

- [ ] **Step 3: Call `initNotifications()` from the render pipeline**

Find `renderApp()` or the main render function in `app.js`. Look for where the UV card is updated (search for `uv-current` or `renderUVCard`). Add `initNotifications()` at the end of the function that runs after the app is shown — it's idempotent so calling it multiple times is safe since the button listener is only added once.

Search for the function that shows `#app` (removes the `hidden` class). It will look something like:

```js
document.getElementById('app').classList.remove('hidden');
```

Add `initNotifications();` on the line immediately after that.

- [ ] **Step 4: Add `initNotifications()` to the reset flow**

Find the reset logic (around line 736 in the original file, which calls `clearState`). After the reset clears state, also clear the push subscription:

```js
await unsubscribeFromPush();
```

Add this line before or after the existing `clearState` calls in the reset handler.

- [ ] **Step 5: Commit**

```bash
git add app.js
git commit -m "feat: add push notification subscribe/unsubscribe logic to app.js"
```

---

## Task 8: Style the Notify Toggle

**Files:**
- Modify: `style.css`

- [ ] **Step 1: Add styles to the bottom of `style.css`**

```css
/* ── Push notification toggle ──────────────────────────────── */
.notify-row {
  padding: 0.5rem 1rem 0.75rem;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}

.notify-btn {
  font-size: 0.8rem;
  color: var(--text-secondary, #666);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
}

.notify-btn:hover {
  color: var(--text-primary, #333);
}

.notify-denied {
  font-size: 0.75rem;
  color: #c0392b;
  margin: 0.25rem 0 0;
}

.notify-denied a {
  color: inherit;
}
```

- [ ] **Step 2: Commit**

```bash
git add style.css
git commit -m "feat: style push notification toggle in UV card"
```

---

## Task 9: End-to-End Verification

- [ ] **Step 1: Open the app in Chrome (push notifications require HTTPS or localhost)**

```bash
# If you have a local server:
npx serve . -p 3000
# Then open http://localhost:3000
```

Or deploy to Cloudflare Pages and test on the live URL.

- [ ] **Step 2: Set a location, then click "🔔 Notify me when UV hits 3"**

Expected:
- Browser shows permission prompt
- After granting, button changes to "🔕 Turn off UV alerts"
- `sunsmart_push_subscribed` appears in `localStorage` (check DevTools → Application → Local Storage)
- KV entry visible in Cloudflare dashboard → Workers & Pages → KV → sunsmart-subscriptions

- [ ] **Step 3: Verify unsubscribe**

Click "🔕 Turn off UV alerts". Expected:
- Button returns to "🔔 Notify me when UV hits 3"
- KV entry removed from Cloudflare dashboard

- [ ] **Step 4: Test denied permission path**

In browser settings, block notifications for the site. Click the notify button. Expected:
- Helper text "Notifications blocked — enable in browser settings" appears
- Button does not change state

- [ ] **Step 5: Manually trigger the cron**

In the Cloudflare Workers dashboard, open `uv-notifier` → Triggers → test the cron manually (or use `wrangler dev` with `--test-scheduled`):

```bash
cd workers/uv-notifier
wrangler dev --test-scheduled &
curl "http://localhost:8787/__scheduled?cron=*/10+*+*+*+*"
```

Expected: Worker runs without error, logs show UV fetch and KV update.

- [ ] **Step 6: Final commit**

```bash
git add .
git commit -m "feat: complete push notification implementation"
```
