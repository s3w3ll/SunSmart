# SunSmart Webapp — Project Overview

> Status: Brainstorming / pre-design
> Last updated: 2026-03-20

---

## Purpose

A GitHub Pages static webapp that helps New Zealand schools and Early Childhood Centres (ECCs) understand their SunSmart obligations and get an at-a-glance daily action guide based on current UV forecasts from NIWA.

## Target Users

- School administrators and principals
- ECC directors and managers
- Teachers and staff on duty
- Anyone responsible for outdoor supervision in a NZ educational setting

## Core User Need

> "What UV protection actions does my school need to take today, and when?"

---

## Key Features (Requirements)

### 1. UV Data Card
- Today's **peak UVI** and the time it will occur
- **Time window** when UVI ≥ 3 (i.e. when SunSmart policy is active)
- A **table** of hourly UV data for the day
- A **chart** showing UV index over the day with a UVI 3 threshold line marked

### 2. Policy Action Panel
- User selects their **policy type**: Early Childhood | Primary & Intermediate | Secondary
- Displays the **required actions** for today based on UVI forecast
- Actions time-indexed to the day (e.g. "apply sunscreen at X:XX before going out")
- Covers: hats, sunscreen (timing + frequency), clothing, shade, sunglasses

### 3. Location Selector
- Option A: **Device location** (browser Geolocation API)
- Option B: **Address search** (geocoding → lat/long)
- Selected location persists (localStorage)

---

## Out of Scope (for initial version)

- Multi-day forecasting (today only)
- Push notifications or reminders
- User accounts or saved settings (beyond localStorage)
- Admin/management features
- PDF exports
- Translations (English only for v1)

---

## Technical Architecture

- **Pure static site** — no backend
- **Hosted**: GitHub Pages
- **UV data**: NIWA UV API (`GET /data?lat=&long=`)
- **Geocoding**: Nominatim (OpenStreetMap) for address → lat/long
- **Device location**: Browser Geolocation API
- **Data persistence**: localStorage (location, policy type selection)
- **API key**: NIWA key embedded at build time (or user-supplied) — to be decided

---

## Data Flow

```
User opens app
  → Load saved location + policy type from localStorage
  → If no saved location → prompt user to select location
  → Fetch UV data from NIWA API (lat/long)
  → Parse response: filter to today, derive max UVI, UVI≥3 window, hourly table
  → Render UV card (max, time, window, chart, table)
  → Render policy actions based on policy type + today's UV data
```

---

## Design Direction (to be confirmed)

- Clean, accessible design — usable on a phone by a busy teacher
- Colour-coded by UV severity (green/yellow/orange/red/violet)
- Prominent current UV level
- Actions presented as a clear checklist or timeline

---

## Open Questions (to resolve during brainstorming)

1. How should the API key be handled for a public GitHub Pages site?
2. Should the app show both cloudy and clear sky forecasts, or just cloudy (realistic)?
3. Should policy selection be persistent or reset each visit?
4. What geocoding service for address search?
5. Should UV data refresh automatically during the day?
6. Are there any NZ-specific UV index display conventions to follow?

---

## Related Files

- `docs/policy-rules.md` — structured rules from the three policy documents
- `docs/api-notes.md` — NIWA API usage guide and data interpretation
- `PolicyDocs/` — original .docx source policy documents
- `API_spec/uv-api.yaml` — OpenAPI 3.0 spec for the NIWA UV API
