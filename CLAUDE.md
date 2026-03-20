# SunSmart — Claude Agent Context

## What This Project Is

A webapp for New Zealand schools and Early Childhood Centres (ECCs) to understand their SunSmart obligations and get at-a-glance action guidance based on the current UV index. Hosted on Cloudflare Pages.

## Tech Stack

- **Static frontend** — HTML, CSS, vanilla JS (three files: `index.html`, `style.css`, `app.js`)
- **Hosted on Cloudflare Pages** — no server-side code
- **UV data** — Open-Meteo API (`https://api.open-meteo.com/v1/forecast`) — free, no key, CORS-friendly
- **Geocoding** — Nominatim (OpenStreetMap) — free, no key
- **Auth + preferences backend** — Supabase (Google SSO, PostgreSQL, RLS)
- **Chart** — Chart.js via CDN

## Repository Structure

```
/
├── CLAUDE.md                  ← this file
├── index.html                 ← app shell
├── style.css                  ← mobile-first styles
├── app.js                     ← all logic
├── PolicyDocs/                ← source .docx policy documents (do not modify)
│   ├── Sample-SunSmart-Policy-for-early-childhood-services_July-2025-v2.docx
│   ├── Sample-SunSmart-Policy-for-primary-intermediate-kura-July-2025-v2 (1).docx
│   └── Sample-SunSmart-Policy-secondary-schools-July-2025.docx
├── API_spec/
│   └── uv-api.yaml            ← NIWA UV API OpenAPI 3.0 spec (for future reference)
└── .claude/
    └── docs/
        ├── policy-rules.md          ← structured rules extracted from policy docs
        ├── api-notes.md             ← Open-Meteo + Nominatim usage notes
        ├── project-overview.md      ← full project spec
        └── auth-preferences-spec.md ← auth + school preferences design spec
```

## Key Domain Concepts

- **UVI 3** is the threshold — all SunSmart measures apply at UVI ≥ 3
- **Three policy types**: Early Childhood (EC), Primary/Intermediate (P/I), Secondary (SEC)
- **Five sun protection measures**: shade, clothing, hat, sunscreen, sunglasses
- **Peak season**: September–April, 10am–4pm (NZ context)
- See `.claude/docs/policy-rules.md` for full structured rules

## Supabase Credentials

| Key | Value |
|---|---|
| `SUPABASE_URL` | `https://ixeodnoimeewaafzwssx.supabase.co` |
| `SUPABASE_ANON_KEY` | `sb_publishable_7KhAjFqiaftJk0n6Y6i-9A_eY5BXNRg` |

Both hardcoded in `app.js` — safe to expose client-side. RLS enforces data isolation per user.

## Important Decisions / Constraints

- **Backend: Supabase** — auth (Google SSO now, Microsoft SSO future) + PostgreSQL for user preferences. Supabase anon key and URL are public/safe to expose. RLS enforces data isolation.
- **Microsoft SSO requires IT admin involvement** — NZ schools use org Microsoft 365 accounts managed by MOE or regional IT. Azure AD app registration + admin consent required per tenant. See `auth-preferences-spec.md` for full notes.
- **NZ-specific** — lat/long must be within New Zealand bounds (`latMin: -47, latMax: -34, longMin: 166, longMax: 178`)
- **Open-Meteo for UV data** — switched from NIWA. Free, no API key, CORS-friendly, returns NZ timezone natively.
- **Policy rules baked into app** — from the three policy documents, no CMS
- **App is advisory only** — helps schools understand their template policy, not enforce it
- **Guest mode** — localStorage-only (existing behaviour preserved). Guest can migrate to authenticated account.
- **School hours** — stored in Supabase, used to contextualise the timeline (outside hours = dimmed blocks)
- **`_listenersInitialized` flag** — prevents duplicate event listeners on iOS bfcache restores (blank page fix)
- **`_bootCompleted` flag** — prevents double-boot from concurrent `onAuthStateChange` + `getSession()` calls

## localStorage Keys

| Key | Value |
|---|---|
| `sunsmart_location` | `{ lat, long, label }` |
| `sunsmart_policy` | `"ec" \| "primary" \| "secondary"` |
| `sunsmart_uv_cache` | `{ data, fetchedAt, lat, long }` |
| `sunsmart_guest` | `true` (guest mode flag) |

For authenticated users, localStorage is a local cache only — Supabase DB is the source of truth.

## What Has Been Done

- [x] Design spec
- [x] Core HTML/CSS/JS scaffold
- [x] Open-Meteo UV data integration
- [x] UV chart component (Chart.js)
- [x] Policy action engine (all three policy types)
- [x] Location selector (address search + GPS)
- [x] localStorage state + cache management
- [x] bfcache / mobile refresh fix
- [x] Cloudflare Pages deployment
- [x] Supabase auth (Google SSO)
- [x] School preferences (cloud sync)
- [x] School hours UI + timeline awareness
- [ ] Microsoft SSO (separate workstream)
