# SunSmart

A webapp for New Zealand schools and Early Childhood Centres (ECCs) to understand their SunSmart obligations and get at-a-glance UV protection guidance for the day.

**Live:** [sun.forgesync.co.nz](https://sun.forgesync.co.nz)

---

## What It Does

SunSmart answers the question every NZ school administrator, teacher, and duty supervisor needs answered each morning:

> "What UV protection actions does my school need to take today, and when?"

When the UV Index reaches 3 — the threshold at which all SunSmart sun protection measures apply — the app shows exactly what staff need to do, tailored to the school's policy type.

---

## Features

- **Live UV forecast** — current and hourly UV index for any NZ location, fetched from Open-Meteo
- **UV chart** — visual timeline of UV index across the day (7am–6pm), with the UVI 3 threshold marked
- **Policy action engine** — required sun protection actions for three policy types:
  - Early Childhood (ECCs)
  - Primary & Intermediate schools
  - Secondary schools
- **Location selector** — GPS detection or address search, persisted across sessions
- **UV threshold alerts** — optional push notifications when UV rises above 3 at your location
- **School hours awareness** — timeline highlights in-school hours
- **Google SSO** — optional sign-in to sync preferences across devices
- **Guest mode** — fully functional without an account (localStorage only)

---

## SunSmart Policy Background

New Zealand follows a **UV Index threshold of 3** — when UVI reaches or exceeds 3, all five sun protection measures are required:

| Measure | Requirement |
|---------|-------------|
| Hat | Legionnaire, broad-brim (≥7.5cm), or bucket (≥6cm). No caps or visors. |
| Sunscreen | SPF 30+ broad-spectrum, water-resistant. Applied 20 min before going outside. Reapply every 2 hours. |
| Clothing | Loose-fitting, sleeves, collar, knee-length or longer. |
| Shade | Seek and use available shade during outdoor activities. |
| Sunglasses | Recommended (AS/NZS 1067). |

Policy rules differ slightly by institution type — early childhood centres have additional requirements around infant care and parental consent for sunscreen application.

Source: [Cancer Society NZ / SunSmart template policy documents](PolicyDocs/) (July 2025 v2).

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML, CSS, vanilla JS — three files (`index.html`, `style.css`, `app.js`) |
| Hosting | Cloudflare Pages |
| UV data | [Open-Meteo API](https://open-meteo.com/) — free, no key required |
| Geocoding | [Nominatim](https://nominatim.org/) (OpenStreetMap) — free, no key required |
| Charts | Chart.js (CDN) |
| Auth + preferences | Supabase (Google SSO, PostgreSQL with RLS) |
| Push notifications | Cloudflare Worker (`uv-notifier.forgesync.workers.dev`) + Web Push API |

---

## Repository Structure

```
/
├── index.html              app shell and UI structure
├── style.css               mobile-first styles
├── app.js                  all application logic
├── CNAME                   custom domain config
├── PolicyDocs/             source .docx policy documents (read-only reference)
├── API_spec/
│   └── uv-api.yaml         NIWA UV API OpenAPI spec (future reference)
└── .claude/
    └── docs/
        ├── policy-rules.md          structured rules from the policy documents
        ├── api-notes.md             Open-Meteo + Nominatim usage notes
        ├── project-overview.md      full project spec
        └── auth-preferences-spec.md auth and preferences design
```

---

## Local Development

No build step required — the app is plain HTML/CSS/JS.

```bash
# Serve locally (any static server works)
npx serve .
# or
python -m http.server 8080
```

Then open `http://localhost:8080`.

> Note: Geolocation requires HTTPS or localhost. Address search works on any origin.

---

## Deployment

The app deploys automatically via Cloudflare Pages on push to `main`. No build configuration needed — Cloudflare serves the static files directly.

---

## Key Constraints

- **NZ-only** — coordinates are validated against NZ bounds (`lat: -47 to -34`, `long: 166 to 178`)
- **Advisory only** — the app helps staff understand their template policy obligations; it does not replace official policy documents
- **Supabase anon key is intentionally public** — Row Level Security enforces per-user data isolation
- **Microsoft SSO** is not yet supported — NZ schools use org Microsoft 365 accounts managed by MOE/regional IT, which requires Azure AD admin consent per tenant

---

## localStorage Keys

| Key | Description |
|-----|-------------|
| `sunsmart_location` | `{ lat, long, label }` — last selected location |
| `sunsmart_policy` | `"ec"`, `"primary"`, or `"secondary"` — selected policy type |
| `sunsmart_uv_cache` | Cached UV data with fetch timestamp |
| `sunsmart_guest` | `true` when using guest (no-auth) mode |

For signed-in users, localStorage is a local cache — Supabase is the source of truth.
