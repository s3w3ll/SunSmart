# ShadeCall — Rename from "SunSmart"

**Date:** 2026-08-06
**Status:** Design approved, ready for implementation planning

## Why

"SunSmart" is the Cancer Society of New Zealand's programme name. `sunsmart.org.nz`
is their official site and `sunsmartschools.co.nz` runs their school accreditation
scheme — the same audience, subject, and country as this app.

This is not an incidental word collision. The app currently titles itself
"SunSmart UV — NZ Schools" and advises schools on sun protection policy
obligations. A principal could reasonably conclude it is an official Cancer
Society tool. That is misattribution risk, not merely an SEO problem.

Secondary motive: the app is seeking a data licence from NIWA / Earth Sciences
New Zealand (see the NIWA access thread). Approaching them while operating under
another organisation's programme name weakens that request.

## The new name

**ShadeCall.**

Chosen from a "practical / at-a-glance" brief — the name should describe the job
the app does, not the data it displays. "The call" is the judgment a school makes
each morning: is protection required today, and when.

Candidates rejected:
- **Hats On** — warmest and most native to NZ schools ("no hat, no play"), but
  boxes the app into one of five sun protection measures.
- **SunCheck / UVCheck / SunSafe / UVNZ** — all already exist as apps.
- **Sunwise** — an existing US EPA programme. Same trap being escaped.
- **Three Plus / Over Three** — true to the UVI≥3 domain model, but needs a
  tagline; nobody knows what "three" means cold.

Naming-space note: the literal UV/Sun/Safe/Check compound space is saturated
because every competitor names *the measurement*. This app is an institutional
decision tool, not a UV readout, so naming the decision differentiates it.

**Descriptive references to the SunSmart programme in body copy remain fine and
should be kept** — e.g. "helps your school meet its SunSmart obligations". It is
the *name* that implies endorsement, not the reference.

## Scope

### Tier 1 — Display strings and docs (no risk)

| Location | Change |
|---|---|
| `index.html:6` | `<title>` |
| `index.html:15` | `<h1 class="app-title">` |
| `workers/uv-notifier/index.js:159` | Push body: "SunSmart measures required — hats, sunscreen, shade." → "Sun protection required — hats, sunscreen, shade." |
| `README.md`, `CLAUDE.md`, `.claude/docs/*` | Prose |

`index.js:159` matters most — it is the only place the old name is actively
transmitted to users' devices.

### Tier 2 — Internal identifiers (safe, mechanical)

- **KV binding** `sunsmart_subscriptions` → `shadecall_subscriptions`:
  `wrangler.toml:6` plus 9 references in `workers/uv-notifier/index.js`.
  The namespace **id** (`46571c253dc84c999343751ea8f70ebb`) is unchanged and is
  what actually holds the data — the binding name is only a variable. **No
  subscriber data is lost.**
- `getSunSmartWindow()` → `getProtectionWindow()` in `app.js` and
  `tests/test.js`. The last place the trademark is baked into the domain model.

### Tier 3 — localStorage keys (the substantive change)

Four keys move from the `sunsmart_` prefix to `shadecall_`:

`location`, `policy`, `uv_cache`, `push_subscribed`

**Doc correction:** `CLAUDE.md` lists a fifth key, `sunsmart_guest`. It does not
exist — the string "guest" appears nowhere in `app.js`. Guest mode is inferred
from the absence of a Supabase session, not from a stored flag. Remove the row
from CLAUDE.md's localStorage table as part of Tier 1. (This is the second stale
entry found in the docs; `.claude/docs/api-notes.md` still documents the NIWA
API as the UV source when the app uses Open-Meteo.)

### Explicitly out of scope

**The URL does not change.** The app stays on `sun.forgesync.co.nz` (owner
decision, 2026-08-06). No domain acquisition, no DNS work, no Cloudflare Pages
project rename, and no redirect handling. This is a **front-end rebrand only** —
the name changes in what users see, not in where they go.

Repo directory name is likewise unchanged. Supabase project identifiers stay
as-is: internal and invisible to users.

**The Worker itself is NOT renamed.** It is called `uv-notifier`, not
`sunsmart-*`, so `WORKER_URL` (`app.js:15`,
`https://uv-notifier.forgesync.workers.dev`) is unaffected and existing push
subscriptions keep working.

## Migration strategy: dual-read on miss

Chosen over copy-and-delete and copy-and-keep. Reads fall back to the legacy
prefix when the new key is absent; nothing is ever actively migrated. Zero
migration risk, at the cost of carrying the fallback indefinitely.

### The asymmetry that makes this correct — and dangerous

**Reads fall back. Writes do not. Deletes must clear BOTH prefixes.**

If a delete clears only the new key, the next read falls back to the surviving
legacy key and *resurrects the state the user just cleared*. Two concrete
failures this would cause:

1. **Sign-out doesn't sign out.** `app.js:741-743` and `app.js:856-857` clear
   location, policy, and uv_cache. Under a naive dual-read, the legacy values
   survive and reappear on next load — the previous user's school location leaks
   into the next session.

2. **Unsubscribe doesn't unsubscribe.** `app.js:930` removes the push flag. If
   the legacy key survives, the UI reads "subscribed" again while the Worker's
   KV state is the real authority. The user cannot turn notifications off.

`push_subscribed` is the highest-stakes key because it is a *local mirror* of
authoritative state in the Worker's KV. Desync there means the Worker keeps
pushing while the UI thinks it is off, and re-subscribing writes a **duplicate
KV entry** → double notifications.

### Required refactor

`app.js:912`, `:930`, `:953`, and `:967` currently call
`localStorage.setItem/getItem/removeItem` **directly**, bypassing the
`saveState()` / `loadState()` / `clearState()` helpers that every other key uses.
Dual-read cannot work while those calls bypass the helpers.

**All four keys must route through the helpers before the prefix changes.** This
is a prerequisite, not a cleanup.

### Shape

```js
const PREFIX        = 'shadecall_';
const LEGACY_PREFIX = 'sunsmart_';

// Read new prefix; fall back to legacy on miss.
function readKey(name)        { ... }
// Write to the new prefix only.
function writeKey(name, value){ ... }
// Delete from BOTH prefixes — see failures above.
function removeKey(name)      { ... }
```

## Testing

- `tests/test.js` needs the renamed `getProtectionWindow` import.
- New coverage required:
  - read falls back to a legacy key when the new key is absent
  - read prefers the new key when both exist
  - write creates only the new key
  - **delete clears both prefixes** — the regression test for the two failures
    above
  - sign-out leaves no readable location/policy behind
- Existing window/threshold tests are unaffected by the rename.

## Open items

- **Trademark:** no clearance search performed. Web search found no existing
  "ShadeCall" product, but that is not a substitute for an IPONZ search. Worth
  settling before the name is used publicly or in the NIWA licence request.

Domain: **resolved** — staying on `sun.forgesync.co.nz`, see Scope.
