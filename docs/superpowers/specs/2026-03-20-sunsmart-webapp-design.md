# SunSmart Webapp — Design Spec
**Date:** 2026-03-20
**Status:** Approved

---

## Overview

A static GitHub Pages webapp for New Zealand schools and Early Childhood Centres (ECCs) to understand their SunSmart obligations and get at-a-glance UV action guidance for the current day.

**Core user need:** "What UV protection actions does my school need to take today, and when?"

**Target users:** School administrators, ECC directors, teachers, duty staff — primarily on mobile phones.

---

## Architecture

### Approach
Pure static site — three files, no build step, no backend, no dependencies except CDN libraries.

```
/
├── index.html        ← app shell and semantic structure
├── style.css         ← mobile-first, UV severity colour tokens
└── app.js            ← all logic: location, API, policy engine, chart
```

### External Services (all free, no API key required)
- **Open-Meteo** — UV index hourly forecast (`https://api.open-meteo.com/v1/forecast`)
- **Nominatim** (OpenStreetMap) — address geocoding and reverse geocoding
- **Browser Geolocation API** — device GPS

> **API choice rationale:** Open-Meteo is used instead of the NIWA UV API because it requires no API key, has no CORS restrictions, and works cleanly from a static site. The NIWA API is deferred to v2 (requires API key strategy). **Important:** Open-Meteo's `uv_index` is a numerical weather prediction (NWP) model forecast — it predicts UV based on expected cloud cover, not live observed conditions. On days with unexpected cloud or sun, the displayed value may differ from actual conditions. The UI should note this with a subtle label such as "Forecast UV" rather than implying real-time measurement.

### CDN Dependencies
- **Chart.js** — UV index line chart

### Hosting
GitHub Pages — deployed directly from the repository root.

---

## State Management

Persisted in `localStorage`:

| Key | Value |
|-----|-------|
| `sunsmart_location` | `{ lat, long, label }` |
| `sunsmart_policy` | `"ec"` \| `"primary"` \| `"secondary"` |
| `sunsmart_uv_cache` | `{ data, fetchedAt, lat, long }` |

### Boot Sequence
1. Load saved state from localStorage
2. If location found → immediately check cache validity:
   - **Valid cache** (same day NZ, same lat/long): render immediately, then silently re-fetch in background and replace on success
   - **Stale cache** (different NZ calendar day, or lat/long differs): render stale data with a "Updating…" indicator while fetching; replace on success
   - **No cache**: show loading state, fetch, render on success
3. If no location → show full-screen location selector
4. If location saved but no policy type saved → render UV card + chart normally; Policy Action Panel shows inline "Select your policy type to see required actions"
5. Policy type selector always visible — switching policy re-renders actions without re-fetching UV data

### Cache Invalidation
- Cache is stale when: the **NZ local calendar date** derived from `fetchedAt` differs from today's NZ local calendar date, OR when stored `lat`/`long` differs from the current location
- "NZ local calendar date" is always determined using `Intl.DateTimeFormat` with `timeZone: 'Pacific/Auckland'` — never by comparing UTC dates or using a fixed offset, to correctly handle NZST/NZDT transitions
- Stale cache is always shown while a fresh fetch is in progress — never show a blank or loading-only screen if any cached data exists
- On `[change]` location tap: **abort any in-flight fetch** immediately, clear `sunsmart_location` and `sunsmart_uv_cache`, re-show location selector

---

## UV Data

### API Call
```
GET https://api.open-meteo.com/v1/forecast
  ?latitude={lat}
  &longitude={long}
  &hourly=uv_index
  &timezone=Pacific%2FAuckland
  &forecast_days=1
```

Open-Meteo with `timezone=Pacific/Auckland` returns timestamps already in NZ local time. Render them as-is — no UTC offset arithmetic is needed on the client side.

The response contains an `hourly` object with `time` (ISO 8601 NZ local datetime strings) and `uv_index` (array of floats, one per hour, 0–23). Hours with no forecast are returned as `null` — treat null values as UVI = 0 for all policy logic and render them as gaps in the chart line (not connected to adjacent points).

### "Current UVI" Derivation
1. Get current NZ local time
2. Floor to the start of the current hour (e.g. 14:47 → 14:00)
3. Look up the matching timestamp in the hourly data
4. If no match (e.g. past the last data point, or null): use 0
5. **End-of-day boundary:** "Past forecast window" state triggers when the current NZ local time is past **19:00 (7pm)** — show "Today's UV data complete — check back tomorrow"

### "SunSmart Active Window" Derivation
- Find all hours where `uv_index ≥ 3`
- Display as a single contiguous range: **earliest ≥ 3 hour** to **latest ≥ 3 hour** (e.g. "10:00am – 4:00pm")
- This is an **at-a-glance summary only**. It may overstate continuous protection time if UVI dips below 3 mid-day.
- Add UI note beneath the range: *"Protection may be required during this window"*
- The per-hour timeline (Policy Action Panel) is the **source of truth** for whether protection is required at any specific time — it uses actual hourly values, not the contiguous range

---

## UI Components

### 1. Location Selector (first-load / full-screen)

Shown when no saved location exists. After a location is set, collapses to a `[change]` link in the UV card header.

**Layout:**
- App name / logo at top
- Prominent address search input with debounced Nominatim lookup (300ms delay)
- Dropdown showing up to 5 results, filtered to NZ only via `countrycodes=nz` Nominatim query parameter
- "Use my current location" GPS button below a divider

**GPS flow:**
1. Request browser geolocation permission
2. Validate coordinates are within NZ mainland bounding box: lat `-47` to `-34`, long `166` to `178`
3. Reverse geocode via Nominatim for human-readable label
4. On permission denied → silent fallback to search input (no raw browser error shown)
5. On out-of-bounds result → show: "Location not supported — this app covers mainland New Zealand. Try searching for your address instead." *(Known limitation: Chatham Islands schools fall outside this bounding box in v1)*

**Changing location:**
`[change]` link in UV card header: abort any in-flight UV fetch, clear `sunsmart_location` and `sunsmart_uv_cache` from localStorage, re-show the location selector.

---

### 2. UV Data Card

Full-width card at top of page. Background colour shifts with UV severity:

| UVI | Level | Colour |
|-----|-------|--------|
| 0–2 | Low | Green |
| 3–5 | Moderate | Yellow |
| 6–7 | High | Orange |
| 8–10 | Very High | Red |
| 11+ | Extreme | Violet |

**Card contents (top to bottom):**
- Location label + `[change]` link
- Current UV index (large number) — labelled "Forecast UV" to indicate this is model-based
- UV level label (e.g. "VERY HIGH")
- Daily peak UV + time (e.g. "Daily peak: 9 at 1:00pm")
- SunSmart active window with note (e.g. "Protection may be required: 10:00am – 4:00pm")

---

### 3. UV Chart

Below the UV card, white background.

- Line chart (Chart.js), x-axis = NZ local time, **display window: 6:00am–7:00pm**
- Timestamps are used as-is from the Open-Meteo response (already NZ local time)
- Null/missing hourly values: rendered as gaps (broken line), not interpolated
- Single line: hourly UV index values
- Red dashed horizontal threshold line at UVI = 3
- Area above threshold coloured by severity, area below greyed out
- Vertical marker at current NZ local time (when viewing today, when within 6am–7pm window)

**Below chart:** Collapsible data table — Time / UV Index, two columns. Rows with UVI ≥ 3 highlighted. Null hours shown as "–".

---

### 4. Policy Action Panel

Sits below the UV chart.

**Policy type selector:**
Three-pill toggle: `[Early Childhood]` `[Primary / Intermediate]` `[Secondary]`
- Selection saved to `sunsmart_policy` in localStorage
- Switching instantly re-renders actions (no API call)
- If no policy saved: show inline prompt "Select your policy type to see required actions" — UV card and chart remain fully visible

**"Right Now" Checklist:**
- When UVI < 3 (or null) for current hour → green banner: "No SunSmart measures required right now"
- When UVI ≥ 3 → display the `items[]` from `getActions()` for the current hour

**Policy items behaviour:** All five SunSmart measures are required at any UVI ≥ 3, regardless of severity band (there is no UVI 3 vs UVI 8 difference in required actions per policy). Items are **static strings per policy type** — they do not vary by UVI value within the ≥ 3 range. Policy-type differences (wording, additional obligations) are defined in `policy-rules.md` and encoded in the three policy objects in `app.js`.

**Early Childhood (EC) checklist includes a dedicated callout box** for age-specific rules:
> 🍼 **Infants:** Babies under 12 months must be kept out of direct sun at all times when UVI ≥ 3. Sunscreen is not recommended for babies under 6 months — use shade and clothing only.

Standard checklist items (wording varies by policy type per `policy-rules.md`):
- Hats must be worn outside — broad-brim (≥7.5cm), bucket (≥6cm), or legionnaire. Baseball caps and visors are **not** compliant.
- Sunscreen SPF 30+ (water-resistant, broad-spectrum) applied 20 min before going outside
- Reapply sunscreen every 2 hours
- Seek shade during outdoor activities
- Sun-protective clothing (loose-fitting, sleeves, collar)
- Sunglasses recommended (must meet AS/NZS 1067)
- Staff must follow and model all SunSmart measures

**Sunscreen application and reapply timing:**
- Per policy, sunscreen must be applied **20 minutes before** going outside
- "Apply by" time = first UVI ≥ 3 hour minus 20 minutes (e.g. UVI first hits 3 at 10:00am → apply by 9:40am)
- The "Apply by" time is displayed as a distinct prompt in both the checklist and the timeline — it is not the same as a reapply marker
- Reapply markers then follow every 2 hours from the first UVI ≥ 3 hour (e.g. 10:00am → reapply at 12:00pm, 2:00pm, 4:00pm)
- If current time is between "apply by" and first UVI ≥ 3 hour, the checklist shows: "Apply sunscreen now — UVI 3 or above starts at [time]"
- Markers are static time ticks — they do not track individual applications
- EC infant callout: under-6-month rule uses shade/clothing only, no sunscreen reapply markers shown for that age group

**Timeline (collapsible — "Plan your day ▾"):**
- Horizontal time blocks across the day (6am–7pm, one block per hour)
- Each block coloured by that hour's actual UVI value (severity colour or grey if < 3)
- Null/missing hours rendered as grey with "–" label
- Sunscreen reapply markers shown as tick marks at the 2-hour intervals defined above
- Tapping a time block shows the full checklist for that hour (using that hour's actual UVI value as input to `getActions()`)
- The timeline is the source of truth for per-hour SunSmart status — not the contiguous summary window in the UV card

---

## Policy Rules Engine

Rules baked in from `.claude/docs/policy-rules.md` — no CMS, no external fetch at runtime.

Three policy objects defined in `app.js`:

```js
getActions(policyType, uviAtHour)
// policyType: "ec" | "primary" | "secondary"
// uviAtHour: number (use 0 for null/missing hours)
// returns: {
//   active: boolean,           // true if uviAtHour >= 3
//   items: string[],           // static action strings for this policy type
//   babyCallout?: string       // EC only, present when active = true
// }
```

- `active` = `uviAtHour >= 3`
- `items` = policy-type-specific static strings (all measures, as defined in `policy-rules.md`)
- `babyCallout` = EC-only string, only present when `policyType === "ec"` and `active === true`
- Items do not vary by UVI severity band — all measures apply whenever `active` is true

---

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| API fail, valid/stale cache exists | Render cache with "Last updated [time]" warning + retry button |
| API fail, no cache | Clear error message + prominent retry button — never a blank screen |
| Nominatim returns no results | "No results found — try a suburb name or school address" |
| GPS out of NZ mainland bounds | "Location not supported — this app covers mainland New Zealand. Try searching for your address instead." |
| GPS permission denied | Silent fallback to search input |
| All UVI values = 0 or null | Green banner: "UV index is low all day — no SunSmart measures required today" |
| Current time past 7:00pm NZ | "Today's UV data complete — check back tomorrow" |
| No policy type selected | Inline prompt within action panel; UV card and chart render normally |
| Stale cache, fetch in progress | Render stale cache with "Updating…" indicator |
| Offline + valid/stale cache | Render cached data, show "Last updated [time]" + retry |
| Offline + no cache | Error message + retry button |
| Partial API data (null hours mid-day) | Skip null hours in chart (gap in line), treat as UVI 0 in policy logic |

---

## Out of Scope (v1)

- Multi-day UV forecasting
- Push / local notifications
- User accounts or admin features
- PDF export
- Te Reo Māori / translations
- Native mobile app
- NIWA UV API integration (deferred — requires API key strategy)
- Auto-refresh / polling during the day
- Chatham Islands / sub-Antarctic island school support (GPS bounds cover NZ mainland only; Chatham Islands schools should use address search)
- Disjoint SunSmart windows (mid-day UVI dips handled via timeline per-hour actuals)

---

## Deferred to v2

- **NIWA API** — may replace Open-Meteo for more authoritative NZ-specific UV data; requires Cloudflare Worker proxy for API key
- **Multi-day view** — weekly UV forecast for advance planning
- **Auto-refresh** — polling for updated UV data during the school day
- **Chatham Islands GPS support** — extend bounding box or use a different bounds strategy
