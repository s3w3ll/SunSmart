# SunSmart — Claude Agent Context

## What This Project Is

A static GitHub Pages webapp for New Zealand schools and Early Childhood Centres (ECCs) to understand their SunSmart obligations and get at-a-glance action guidance based on the current UV index.

## Tech Stack Intent

- **Pure static site** — HTML, CSS, vanilla JS (or lightweight framework TBD)
- **Hosted on GitHub Pages** — no backend, no server-side code
- **UV data** — fetched client-side from the NIWA UV API (`https://api.niwa.co.nz/uv/data`)
- **Geolocation** — browser Geolocation API + address search (geocoding TBD)

## Repository Structure

```
/
├── CLAUDE.md                  ← this file
├── PolicyDocs/                ← source .docx policy documents (do not modify)
│   ├── Sample-SunSmart-Policy-for-early-childhood-services_July-2025-v2.docx
│   ├── Sample-SunSmart-Policy-for-primary-intermediate-kura-July-2025-v2 (1).docx
│   └── Sample-SunSmart-Policy-secondary-schools-July-2025.docx
├── API_spec/
│   └── uv-api.yaml            ← NIWA UV API OpenAPI 3.0 spec
└── .claude/
    └── docs/
        ├── policy-rules.md        ← structured rules extracted from policy docs
        ├── api-notes.md           ← NIWA API usage notes
        └── project-overview.md    ← full project spec (to be written during brainstorm)
```

## Key Domain Concepts

- **UVI 3** is the threshold — all SunSmart measures apply at UVI ≥ 3
- **Three policy types**: Early Childhood (EC), Primary/Intermediate (P/I), Secondary (SEC)
- **Five sun protection measures**: shade, clothing, hat, sunscreen, sunglasses
- **Peak season**: September–April, 10am–4pm (NZ context)
- See `docs/policy-rules.md` for full structured rules

## NIWA UV API

- Endpoint: `GET https://api.niwa.co.nz/uv/data?lat={lat}&long={long}`
- Auth: API key via `x-apikey` header OR `apikey` query param
- Returns: two product arrays — `cloudy_sky_uv_index` and `clear_sky_uv_index` — each with hourly `{time, value}` entries (UTC timestamps)
- See `docs/api-notes.md` for full details

## Important Decisions / Constraints

- **No backend** — API key will need to be handled carefully (env var at build time, or proxied)
- **NZ-specific** — lat/long must be within New Zealand bounds
- The NIWA API data uses **UTC timestamps** — must convert to NZ local time (NZST/NZDT) for display
- Policy rules are **baked into the app** from the three policy documents — no CMS
- The app is **advisory only** — it helps schools understand their template policy, not enforce it

## What Has Been Done

- [ ] Brainstorming / design spec
- [ ] Implementation plan
- [ ] Core HTML/CSS/JS scaffold
- [ ] NIWA API integration
- [ ] UV chart component
- [ ] Policy action engine
- [ ] Location selector (address + device)
- [ ] GitHub Pages deployment
