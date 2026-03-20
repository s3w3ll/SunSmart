# Auth & User Preferences — Specification
_Written: 2026-03-20_

## Overview

Add user authentication and cloud-synced school preferences to SunSmart. Users can sign in with Google SSO, save their school's location, policy type, and open hours, and have those settings follow them across devices. Guest mode retains existing localStorage-only behaviour.

## Backend: Supabase

**Why Supabase:**
- Built-in OAuth (Google now, Microsoft future)
- PostgreSQL with Row Level Security — uid-scoped data isolation with no application-layer auth logic
- Browser JS client talks directly to Supabase — no backend code to write
- Free tier: 50k MAU, 500MB database — sufficient for this use case
- Works natively with Cloudflare Pages static sites
- Self-hostable later if needed

**Supabase project setup:**
1. Create project at supabase.com
2. Enable Google OAuth provider (Client ID + Secret from Google Cloud Console)
3. Add Cloudflare Pages URL to allowed redirect URLs
4. Apply database schema (see below)
5. Enable RLS on all user tables
6. Add Supabase JS client via CDN (`@supabase/supabase-js`)

**Environment values needed (baked into app.js at deploy time or hardcoded as public):**
- `SUPABASE_URL` — project URL (safe to expose, public)
- `SUPABASE_ANON_KEY` — anon/public key (safe to expose, RLS enforces access)

---

## Data Model

### `user_profiles`
Auto-created by a Supabase Auth trigger on first sign-in.

```sql
create table public.user_profiles (
  id           uuid  references auth.users  on delete cascade  primary key,
  display_name text,
  avatar_url   text,
  created_at   timestamptz  default now()
);

-- Trigger to create profile on new user sign-up
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.user_profiles (id, display_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

### `school_preferences`
One row per authenticated user. Upserted on any preference change.

```sql
create table public.school_preferences (
  id             uuid         primary key  default gen_random_uuid(),
  user_id        uuid         references auth.users  on delete cascade  unique  not null,
  school_name    text,
  location_label text,
  lat            float8,
  long           float8,
  policy_type    text         check (policy_type in ('ec', 'primary', 'secondary')),
  open_time      time,        -- e.g. '08:30' (NZ local, no timezone)
  close_time     time,        -- e.g. '15:00'
  open_days      int[],       -- [1,2,3,4,5] = Mon–Fri (0=Sun, 6=Sat)
  created_at     timestamptz  default now(),
  updated_at     timestamptz  default now()
);

-- Auto-update updated_at on change
create function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger school_preferences_updated_at
  before update on public.school_preferences
  for each row execute procedure public.update_updated_at();
```

### Row Level Security

```sql
-- user_profiles
alter table public.user_profiles enable row level security;
create policy "Users can read own profile"
  on public.user_profiles for select using (auth.uid() = id);
create policy "Users can update own profile"
  on public.user_profiles for update using (auth.uid() = id);

-- school_preferences
alter table public.school_preferences enable row level security;
create policy "Users can read own preferences"
  on public.school_preferences for select using (auth.uid() = user_id);
create policy "Users can insert own preferences"
  on public.school_preferences for insert with check (auth.uid() = user_id);
create policy "Users can update own preferences"
  on public.school_preferences for update using (auth.uid() = user_id);
create policy "Users can delete own preferences"
  on public.school_preferences for delete using (auth.uid() = user_id);
```

---

## Auth Flows

### First visit — no session
Show full-screen auth modal before any app content.

```
┌────────────────────────────────────┐
│  🌞 SunSmart                       │
│  UV guidance for NZ schools        │
│                                    │
│  [G  Continue with Google      ]   │
│                                    │
│  ── or ──                          │
│                                    │
│  [Continue as Guest            ]   │
│  Settings saved on this device     │
│  only                              │
└────────────────────────────────────┘
```

### Google SSO flow
1. User taps "Continue with Google"
2. `supabase.auth.signInWithOAuth({ provider: 'google' })` → browser redirects to Google
3. Google redirects back to app with auth code
4. Supabase client exchanges code for session → JWT stored in localStorage by Supabase
5. `supabase.auth.onAuthStateChange` fires with `SIGNED_IN` event
6. App fetches `school_preferences` for `auth.uid()`
7a. Preferences exist → load into app state, render app
7b. No preferences yet (first login) → pre-fill from any existing localStorage values → show settings panel for confirmation → save to DB → render app

### Returning user (session still valid)
Supabase client restores session from localStorage on page load. `onAuthStateChange` fires immediately. Preferences fetched and app renders — same as returning guest but from DB instead of localStorage.

### Returning user (session expired)
Supabase refreshes the JWT silently using the refresh token. If refresh fails (token revoked) → show auth modal again.

### Guest flow
1. User taps "Continue as Guest"
2. Set `sunsmart_guest = true` in localStorage
3. App renders using existing localStorage behaviour
4. Persistent soft banner displayed: _"Sign in to sync your settings across devices →"_
5. Tapping banner shows auth modal — on sign-in, existing localStorage preferences are migrated to DB and guest flag cleared

### Sign out
- `supabase.auth.signOut()`
- Clear `sunsmart_location`, `sunsmart_policy`, `sunsmart_uv_cache` from localStorage
- Show auth modal

---

## State Merge Logic (localStorage → DB)

When a guest signs in for the first time:

```
if DB has no row for this user:
  if localStorage has location/policy → pre-fill settings form with those values
  show settings confirmation panel
  on confirm → upsert to DB
else:
  DB values win — overwrite localStorage with DB values
  (DB is the source of truth for authenticated users)
```

For authenticated users, localStorage is used only as a local cache of the last-fetched DB values — the DB is always the authoritative source.

---

## School Hours Feature

School hours contextualise the UV timeline — blocks outside school hours are visually dimmed (SunSmart may still apply, but the school is not responsible for supervising students at that time).

**Defaults if not set:** 8:30am – 3:00pm, Monday – Friday

**Effect on UI:**
- Timeline blocks outside school hours: dimmed, labelled "Outside school hours"
- Sunscreen reapply markers only shown within school hours
- Checklist status: if current time is outside school hours, add note "Outside school hours — SunSmart applies during school day"
- "Today's school day" span shown in UV card header when within school hours

**Settings UI:**
```
School name    [                              ]
Location       [Ponsonby, Auckland    ] [↗ change]
Policy type    ( Early Childhood )  ( Primary )  ( Secondary )
School hours   [08] : [30] am   to   [15] : [00] pm
Open days      [✓ Mon] [✓ Tue] [✓ Wed] [✓ Thu] [✓ Fri] [ Sat] [ Sun]

               [  Save settings  ]
```

Settings accessible via profile icon (top right of app header). On save → upsert to DB → re-render timeline and checklist.

---

## UI Changes Summary

### `index.html`
- Auth modal (full-screen, shown before app on no session)
- Profile/settings panel (slide-in drawer or modal)
- Sign-in button / user avatar in app header
- Guest banner (persistent, dismissible per session only)
- Settings form fields (school name, hours, days)

### `app.js`
- Supabase client initialisation (`createClient(url, anonKey)`)
- `initAuth()` — check session, wire `onAuthStateChange`
- `loadPreferences(userId)` — fetch from `school_preferences`
- `savePreferences(prefs)` — upsert to `school_preferences` (debounced, 500ms)
- `migrateGuestToAccount(userId)` — merge localStorage → DB on first sign-in
- School hours awareness in `renderTimeline()` and `renderChecklist()`
- `isWithinSchoolHours(hour, openTime, closeTime, openDays)` utility

### `style.css`
- Auth modal styles
- Settings panel / drawer styles
- Guest banner styles
- Sync status indicator (small dot: synced / syncing / offline)
- "Outside school hours" dimmed timeline block style
- User avatar / profile button in header

---

## Microsoft SSO — Future Implementation Notes

> ⚠️ **Requires IT admin involvement at the school/organisation level**

NZ schools are heavily Microsoft 365 environments. Key considerations before implementation:

- **Supabase side**: Microsoft Azure AD OAuth is a supported Supabase provider. Configuration is straightforward — Client ID + Secret from Azure Portal, added to Supabase Auth providers.
- **Azure AD app registration**: Must be configured for "Work and school accounts" (multi-tenant) — not personal Microsoft accounts. Reply/redirect URLs must include the Supabase callback URL and the app's Cloudflare Pages URL.
- **Admin consent**: The first login from a school's Azure AD tenant may trigger an admin consent prompt if the tenant restricts third-party OAuth apps (common in MOE-managed and regional IT-managed tenants). School IT admin must approve the app for their tenant before staff can sign in.
- **Conditional Access**: Some schools have Conditional Access policies (device compliance, MFA requirements, app allowlists) that may block the OAuth flow. Needs testing against a sample school tenant before rollout.
- **Tenant configuration**: Using `tenant: 'common'` in the Azure AD app allows sign-in from any Microsoft org — but requires admin consent from each organisation the first time. Using a specific tenant ID locks the app to one organisation.
- **MOE integration**: If the Ministry of Education manages identity for a school cluster, the OAuth app may need to be registered through the MOE's Azure AD rather than the school's own tenant.
- **Recommendation**: Flag Microsoft SSO as a separate workstream. Engage with a sample school's IT team early to test the consent and Conditional Access flow before building the UI.

---

## Implementation Order

1. Supabase project setup + schema applied
2. Google OAuth configured in Supabase + Google Cloud Console
3. Supabase JS client added to `index.html` (CDN)
4. Auth modal UI + guest flow wired up
5. `initAuth()` + `onAuthStateChange` in `app.js`
6. `loadPreferences()` + `savePreferences()` wired to existing state
7. Guest → account migration logic
8. Settings panel UI + school hours fields
9. School hours awareness in timeline + checklist rendering
10. Sync status indicator
11. Microsoft SSO (separate workstream — see notes above)
