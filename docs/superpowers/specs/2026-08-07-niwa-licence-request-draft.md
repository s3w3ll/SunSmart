# NIWA UV API — Product/Service Licence Request (Draft)

**Status:** Draft for review — not sent. Recipient TBD (see note at end).

---

**Subject: Product/service licence enquiry — UV API — ShadeCall (free tool for NZ schools)**

Kia ora,

I'm writing to ask about a product/service licence for NIWA's UV API, per the
note in your Access Terms that "where the User wishes to develop a product or
service based on the data, then the User should contact NIWA to discuss."

**What we've built:** ShadeCall (`sun.forgesync.co.nz`) is a free webapp that
helps New Zealand schools and Early Childhood Centres understand their
SunSmart sun-protection obligations, and gives them at-a-glance guidance —
current UV index, when protection is required, sunscreen reapplication
timing — based on their location and their policy type (Early Childhood,
Primary/Intermediate, or Secondary). It's built directly from the three
Ministry-aligned SunSmart policy templates for those sectors.

**Why we're asking:** we currently use a general-purpose global forecast
model for UV data. We'd like to use NIWA's UV API instead — it's NZ-specific,
and returns both cloudy-sky and clear-sky forecasts, which is a meaningfully
better fit for a tool schools rely on for a health-and-safety decision. We
registered for API access and have been testing the `/data` endpoint
internally (app registration `d83f47a1-e6cf-4e53-b17c-aacca9921f93`,
`uv-api` v1.3.0) — it works well and returns exactly what we need: a rolling
72-hour hourly forecast.

We understand the standard API Access Terms are for internal/staff use only
and don't cover serving the data to a public site's visitors, which is why
we're asking before doing that, rather than after.

**What we'd like to request:**

1. Permission to display NIWA UV forecast data (`/data` endpoint) to
   ShadeCall's visitors — school and ECC staff checking today's UV guidance.
2. If there's a lightweight way to establish this (a specific licence class,
   an update to our developer account, or something else), we're glad to
   follow whatever process works for you.

We'd also welcome any guidance on:

- **Near-real-time measured UV data**, if there's a feed we're not aware of
  beyond the forecast API — we understand the measurement network is quite
  limited (five sites) and that the Climate Database / DataHub archive
  currently runs about a month behind, so we suspect this may not be
  practical, but wanted to ask rather than assume.
- Any usage expectations (attribution, rate limits, review process) that
  would come with this kind of licence.

**Some context that might help place the request:** we understand NIWA
developed its real-time UV displays in consultation with the Cancer Society
and the SunSmart programme, and that the UVNZ app already serves free,
NIWA-backed UV data to the public with Cancer Society support. ShadeCall
serves the same public-health goal for the schools sector specifically — free
to use, no ads, no commercial model, built to help schools meet an existing
obligation rather than to sell anything.

Happy to share the app, walk through how the data would be used, or answer
anything else that would help you assess this.

Ngā mihi,
[Your name]
[Contact email]
ShadeCall — sun.forgesync.co.nz

---

## Notes for review (not part of the email)

- **Recipient is intentionally left open.** Research this session found a
  developer support channel at `developer.niwa.co.nz` and a named contact
  (John Robinson, Principal Technician – Atmosphere) for the real-time UV
  *display hardware* specifically — a different thing from an API product
  licence, so I haven't assumed he's the right person. The safest first move
  is probably the general enquiries channel (`0800 RING NIWA` /
  `developer.niwa.co.nz` support) asking to be routed to whoever handles UV
  API product licensing, rather than guessing a named contact and being
  wrong.
- **The near-real-time ask is framed as secondary and tentative on purpose**
  — the research this session found no evidence a practical feed exists
  (DataHub is ~1 month lagged, bulk-download only), so the draft doesn't lead
  with it or make it sound expected.
- **Traffic/scale isn't mentioned** — worth adding if you have a rough sense
  of expected visitor volume; NIWA may want it to assess API load.
- **[Your name] / [Contact email]** — placeholders, deliberately not filled
  in from anything on file.
