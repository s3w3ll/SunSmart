# NIWA UV API — Notes

> Source: `API_spec/uv-api.yaml` (OpenAPI 3.0, version 1.3.0)
> API base URL: `https://api.niwa.co.nz/uv`
> Developer docs: https://developer.niwa.co.nz/docs/uv-api/latest/routes/data/get

> **STATUS: NIWA IS THE DEFAULT EVERYWHERE (updated 2026-08-18).** Both UV
> data paths now use NIWA, with Open-Meteo demoted to an automatic fallback:
>
> | Path | Source | Where |
> |------|--------|-------|
> | On-screen chart/timeline (default) | **NIWA**, via the Worker's `/uv` proxy | `app.js` `fetchUVData()` → `fetchNiwaUVData()`, `workers/uv-notifier/index.js` `handleUvProxy()` |
> | On-screen chart/timeline (automatic fallback if NIWA fetch fails) | Open-Meteo | `app.js` `fetchOpenMeteoUVData()` |
> | Push notifications (cron, real subscribers) | **NIWA** | `workers/uv-notifier/index.js` `fetchCurrentUV()` |
>
> The on-screen default switched from Open-Meteo to NIWA on 2026-08-18 — the
> two sources' forecast models disagreed widely enough (e.g. 3.2 vs NIWA's
> 1.7 for the same Christchurch hour) to be misleading. The `?uvSource=niwa`
> query-param toggle was removed since NIWA is no longer opt-in.
>
> **This is ahead of the product/service licence** requested in
> `docs/superpowers/specs/2026-08-07-niwa-licence-request-draft.md` (NIWA's
> standard Access Terms permit internal/staff use only). Defaulting the
> on-screen path to NIWA is only valid while this deployment has no visitors
> besides the maintainer — revisit before the app is opened up to other
> users (e.g. schools). Push notifications were switched to NIWA earlier, on
> 2026-08-11, under the same ahead-of-licence reasoning. See project memory
> ("NIWA UV data access") for status.
>
> Verified against the live NIWA API on 2026-08-06 and 2026-08-11: `/data`
> returns ~73 hourly points spanning ~72 hours (today + next 2 days), for both
> `cloudy_sky_uv_index` and `clear_sky_uv_index`. Timestamps are UTC with a `Z`
> suffix — unlike Open-Meteo, which returns naive NZ-local strings. Both
> consumers (`adaptNiwaResponse` in `app.js`, `adaptNiwaCurrentUV` in
> `workers/uv-notifier/index.js`) filter this down to NZ-local "today"/"current
> hour" before use — see "Filtering to today's data" below; this was a real bug
> found and fixed 2026-08-11, not just a theoretical concern.

---

## Authentication

Two options — both pass an API key:

| Method | Header/Param | Example |
|--------|-------------|---------|
| Header | `x-apikey: <key>` | `fetch(url, { headers: { 'x-apikey': KEY } })` |
| Query param | `?apikey=<key>` | `https://api.niwa.co.nz/uv/data?lat=...&long=...&apikey=KEY` |

**Important for GitHub Pages**: The API key cannot be kept secret in a pure static site. Options:
1. Use a Cloudflare Worker / Netlify Function as a thin proxy (recommended for production)
2. Accept key exposure for a public-benefit tool (lower risk — NIWA UV data is free/public)
3. Require users to enter their own API key (poor UX)

---

## Endpoints

### `GET /data` — Primary endpoint for this app

Returns a JSON time series of hourly UV index forecasts for a given lat/long.

**Parameters:**
| Param | Required | Type | Description |
|-------|----------|------|-------------|
| `lat` | Yes | number | Latitude (e.g. `-41.28` for Wellington) |
| `long` | Yes | number | Longitude (e.g. `174.77` for Wellington) |

**Response shape:**
```json
{
  "products": [
    {
      "name": "cloudy_sky_uv_index",
      "values": [
        { "time": "2026-03-03T00:00:00Z", "value": 3.22 },
        { "time": "2026-03-03T01:00:00Z", "value": 3.39 }
      ]
    },
    {
      "name": "clear_sky_uv_index",
      "values": [
        { "time": "2026-03-03T00:00:00Z", "value": 6.5 },
        { "time": "2026-03-03T01:00:00Z", "value": 6.7 }
      ]
    }
  ],
  "coord": "EPSG:4326,-39.0,174.0"
}
```

**Two products returned:**
- `cloudy_sky_uv_index` — adjusted for cloud forecast (more realistic for a given day)
- `clear_sky_uv_index` — worst-case clear sky UV (useful for showing maximum possible)

**For this app**: Display `cloudy_sky_uv_index` as the primary forecast (realistic), and optionally show `clear_sky_uv_index` as the upper bound.

---

### Other endpoints (available but likely unused)

| Endpoint | Description |
|----------|-------------|
| `GET /chart.png` | PNG chart of today's UVI forecast (cloud/clear/both) |
| `GET /chart.svg` | SVG chart of today's UVI forecast |
| `GET /max.png` | PNG showing today's max UVI |
| `GET /max.svg` | SVG showing today's max UVI |
| `GET /current.png` | PNG showing current UVI |
| `GET /current.svg` | SVG showing current UVI |

All image endpoints accept `lat`, `long`, and `sky` (`cloud`|`clear`|`both`) params.

**Note**: The app will build its own custom chart from `/data` so the chart images are likely not needed.

---

## Timestamps

- All `time` values are **UTC** (`Z` suffix, ISO 8601)
- New Zealand is UTC+12 (NZST) or UTC+13 (NZDT during daylight saving)
- **Daylight saving** in NZ: clocks go forward in September, back in April
- Must convert UTC → NZ local time before displaying to users
- Use `Intl.DateTimeFormat` with `timeZone: 'Pacific/Auckland'` for reliable conversion

---

## Data Interpretation for the App

### Deriving key display values from `/data`

Given hourly `{time, value}` pairs for today:

| Display value | How to derive |
|--------------|--------------|
| Daily max UVI | `Math.max(...values.map(v => v.value))` |
| Time of daily max | Time entry corresponding to max value |
| UVI ≥ 3 window start | First hour where `value >= 3` |
| UVI ≥ 3 window end | Last hour where `value >= 3` |
| Current UVI | Entry closest to current NZ local time |

### Filtering to today's data

The API may return multi-day data. Filter entries to only those where the NZ local date matches today before deriving the above values.

---

## NZ Location Reference Points

Useful for defaults and bounding box validation:

| Location | Lat | Long |
|----------|-----|------|
| Auckland | -36.85 | 174.76 |
| Wellington | -41.28 | 174.78 |
| Christchurch | -43.53 | 172.64 |
| Dunedin | -45.87 | 170.50 |
| Hamilton | -37.79 | 175.28 |
| Tauranga | -37.69 | 176.17 |

NZ bounding box (approximate): lat `-34` to `-47`, long `166` to `178`

---

## CORS / Client-side Considerations

- The NIWA API must support CORS for client-side fetch to work from GitHub Pages
- If it doesn't, a proxy worker will be required
- To be confirmed during development — test with a simple fetch before building UI

---

## Geocoding (Address → Lat/Long)

The API only accepts lat/long. For address search, a geocoding service is needed:

| Option | Notes |
|--------|-------|
| Browser Geolocation API | `navigator.geolocation.getCurrentPosition()` — no key needed |
| Nominatim (OpenStreetMap) | Free, no key — can be rate-limited; NZ coverage is good |
| Google Maps Geocoding API | Reliable but requires API key and billing |
| Mapbox Geocoding API | Reliable, generous free tier, requires API key |

Recommendation: Use **Nominatim** for address search (no key, NZ coverage good) + Browser Geolocation for device location.
