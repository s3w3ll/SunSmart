# Push Notifications Design — UV Threshold Alerts

**Date:** 2026-05-26  
**Status:** Approved

## Overview

Add background push notifications to SunSmart that alert users each time the UV index rises above 3. The Worker checks every 10 minutes between 9am–4pm NZST, per subscriber's saved location.

---

## Architecture

```
Browser (app.js)
  └─ requests permission + subscribes to Web Push
  └─ POSTs subscription + location to Worker /subscribe endpoint

Cloudflare Worker (uv-notifier)
  ├─ POST /subscribe  → save to KV
  ├─ DELETE /unsubscribe → remove from KV
  ├─ Cron: */10 * * * *
  │    ├─ check NZ time — exit if outside 9am–4pm
  │    ├─ for each KV entry: fetch current UV from Open-Meteo
  │    ├─ compare to stored lastUV to detect rising-above-3 crossing
  │    └─ send Web Push if crossed, update lastUV in KV
  └─ Cron: 0 0 * * *  (midnight reset — set all lastUV to 0)

Cloudflare KV (sunsmart-subscriptions)
  key:   sha256(pushSubscription.endpoint)
  value: { pushSubscription, location: { lat, long, label }, lastUV, lastNotifiedAt }
```

---

## Components

### 1. Service Worker (`sw.js`)

Minimal — handles only incoming push events.

```js
self.addEventListener('push', event => {
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon.png',
    })
  );
});
```

No caching or offline logic. The service worker exists solely to receive push messages.

### 2. Client-side additions (`app.js`)

- "Notify me" toggle in the UV card
- On enable:
  1. Request `Notification.requestPermission()`
  2. Register `/sw.js`
  3. Subscribe with VAPID public key → `PushSubscription`
  4. POST `{ subscription, location }` to Worker `/subscribe` with `SUBSCRIBE_SECRET` header
  5. Set `sunsmart_push_subscribed: true` in localStorage
- On disable: DELETE to `/unsubscribe`, unsubscribe from push service, clear localStorage flag
- If permission denied: reset toggle silently, show helper text pointing to browser settings

### 3. Cloudflare Worker (`workers/uv-notifier/index.js`)

**Routes:**
- `POST /subscribe` — validate `SUBSCRIBE_SECRET` header, upsert KV entry keyed by `sha256(endpoint)`
- `DELETE /unsubscribe` — validate secret, delete KV entry

**Cron `*/10 * * * *`:**
```
1. Get current NZ time — exit if outside 09:00–16:00
2. KV list() with pagination
3. For each entry:
   a. Fetch current UV from Open-Meteo for subscriber's lat/long
   b. If fetch fails: skip (do not update lastUV)
   c. If lastUV < 3 && currentUV >= 3: send Web Push notification
   d. Write currentUV back to KV as lastUV
```

**Cron `0 0 * * *` (midnight reset):**
```
1. KV list() with pagination
2. For each entry: set lastUV = 0
```

### 4. Cloudflare KV (`sunsmart-subscriptions`)

| Field | Type | Description |
|---|---|---|
| `pushSubscription` | object | Full `PushSubscription` JSON from browser |
| `location` | `{ lat, long, label }` | Subscriber's saved location at subscribe-time |
| `lastUV` | number | UV value from the previous cron run |
| `lastNotifiedAt` | ISO string | Timestamp of last notification sent |

---

## VAPID Keys & Secrets

- **Generation:** `wrangler generate-vapid-keys` (one-time)
- **`VAPID_PUBLIC_KEY`** — hardcoded in `app.js` (safe to expose, same model as Supabase anon key)
- **`VAPID_PRIVATE_KEY`** — Cloudflare Worker secret via `wrangler secret put`
- **`SUBSCRIBE_SECRET`** — random token, hardcoded in `app.js`, stored as Worker secret. Prevents arbitrary subscription spam.

Rotating `VAPID_PRIVATE_KEY` invalidates all existing subscriptions — treat as a long-lived credential.

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Notification permission denied | Toggle resets silently; helper text shown linking to browser settings |
| Open-Meteo unreachable for a subscriber | Skip that subscriber, do not update `lastUV`, retry next cycle |
| Push service returns `410 Gone` | Delete KV entry automatically (stale subscription cleanup) |
| KV list exceeds 1,000 keys | Paginate with cursor — handled in Worker loop |
| User changes location | Re-subscribe with new location; overwrites KV entry by endpoint hash |

---

## Out of Scope

- Per-user notification scheduling preferences (e.g. custom time windows)
- Multiple location subscriptions per device
- Microsoft SSO integration (separate workstream per CLAUDE.md)
