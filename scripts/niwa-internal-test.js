#!/usr/bin/env node
/**
 * NIWA UV API — internal testing tool. NOT part of the shipped app.
 *
 * NIWA's API Access Terms (https://developer.niwa.co.nz/terms) permit access
 * "for their own internal purposes and staff only" and prohibit publishing,
 * selling, or otherwise parting with the Data to any third party. This script
 * exists to satisfy exactly that permitted use — a developer, locally,
 * validating NIWA's data against the app's production source (Open-Meteo).
 *
 * DO NOT import this file, its credentials, or the NIWA fetch logic from
 * app.js or any other file that ships to the browser. The API key is not
 * licensed for that — see docs/superpowers/specs/2026-08-06-shadecall-rename-design.md
 * and the "NIWA licence" thread in project memory for the blocker tracking
 * when (if) that changes.
 *
 * Usage:
 *   node scripts/niwa-internal-test.js [lat] [long] [--compare]
 *
 * Defaults to Wellington (-41.28, 174.78). --compare also fetches Open-Meteo
 * for the same coordinates and prints both side by side.
 *
 * Credentials are read from a repo-root `.env` (gitignored, never committed):
 *   NIWA_API_KEY=...
 *   NIWA_API_SECRET=...   (loaded but unused today — no OAuth scheme is
 *                          documented in API_spec/uv-api.yaml; kept for when/
 *                          if NIWA's portal requires it)
 *   NIWA_APP_ID=...       (loaded but unused today, same reason)
 */

const fs = require('fs');
const path = require('path');

const ENV_PATH = path.join(__dirname, '..', '.env');
const NIWA_BASE = 'https://api.niwa.co.nz/uv';
const OPEN_METEO_BASE = 'https://api.open-meteo.com/v1/forecast';

const DEFAULT_LAT = -41.28;  // Wellington — matches the manual portal test done 2026-08-06
const DEFAULT_LONG = 174.78;

/** Minimal KEY=VALUE .env parser. No dependency — repo has no package.json. */
function loadEnv(envPath) {
  if (!fs.existsSync(envPath)) {
    throw new Error(
      `No .env found at ${envPath}\n` +
      `Create one with:\n  NIWA_API_KEY=...\n  NIWA_API_SECRET=...\n  NIWA_APP_ID=...`
    );
  }
  const out = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

function formatNZ(isoTime) {
  return new Intl.DateTimeFormat('en-NZ', {
    timeZone: 'Pacific/Auckland',
    dateStyle: 'short',
    timeStyle: 'short',
    hour12: false,
  }).format(new Date(isoTime));
}

/**
 * Fetch NIWA /data. Tries the documented header scheme first
 * (APIKeyHeader: x-apikey), then falls back to the query-param scheme
 * (APIKeyQueryParam: apikey) on 401/403 — API_spec/uv-api.yaml documents
 * both as valid, and the working method hasn't been confirmed for a raw
 * key outside the developer portal's own "Try this API" panel.
 */
async function fetchNiwa(lat, long, apiKey) {
  const url = `${NIWA_BASE}/data?lat=${lat}&long=${long}`;

  let res = await fetch(url, { headers: { 'x-apikey': apiKey } });
  let authMethod = 'x-apikey header';

  if (res.status === 401 || res.status === 403) {
    const retryUrl = `${url}&apikey=${encodeURIComponent(apiKey)}`;
    res = await fetch(retryUrl);
    authMethod = 'apikey query param (header was rejected)';
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '(no body)');
    throw new Error(
      `NIWA /data returned ${res.status} ${res.statusText} (tried ${authMethod})\n${body}`
    );
  }

  return { json: await res.json(), authMethod };
}

async function fetchOpenMeteo(lat, long) {
  const url = new URL(OPEN_METEO_BASE);
  url.searchParams.set('latitude', lat);
  url.searchParams.set('longitude', long);
  url.searchParams.set('hourly', 'uv_index');
  url.searchParams.set('timezone', 'Pacific/Auckland');
  url.searchParams.set('forecast_days', '1');

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo returned ${res.status}`);
  const json = await res.json();
  return json.hourly; // { time: [...], uv_index: [...] }
}

function summariseNiwaProduct(product) {
  const values = product.values;
  const times = values.map(v => new Date(v.time));
  const steps = [...new Set(times.slice(1).map((t, i) => (t - times[i]) / 60000))];
  const max = values.reduce((a, b) => (b.value > a.value ? b : a));

  return {
    name: product.name,
    count: values.length,
    intervalMinutes: steps,
    firstNZ: formatNZ(values[0].time),
    lastNZ: formatNZ(values[values.length - 1].time),
    spanHours: (times[times.length - 1] - times[0]) / 3600000,
    maxValue: Math.round(max.value * 100) / 100,
    maxAtNZ: formatNZ(max.time),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const compare = args.includes('--compare');
  const positional = args.filter(a => !a.startsWith('--'));
  const lat = positional[0] ? Number(positional[0]) : DEFAULT_LAT;
  const long = positional[1] ? Number(positional[1]) : DEFAULT_LONG;

  if (!Number.isFinite(lat) || !Number.isFinite(long)) {
    throw new Error(`Invalid lat/long: ${positional[0]}, ${positional[1]}`);
  }

  const env = loadEnv(ENV_PATH);
  if (!env.NIWA_API_KEY) {
    throw new Error(`NIWA_API_KEY missing from ${ENV_PATH}`);
  }

  console.log(`\n=== NIWA UV API — internal test (lat=${lat}, long=${long}) ===\n`);

  const { json: niwaData, authMethod } = await fetchNiwa(lat, long, env.NIWA_API_KEY);
  console.log(`Auth: ${authMethod}`);
  console.log(`Coord: ${niwaData.coord}\n`);

  for (const product of niwaData.products) {
    const s = summariseNiwaProduct(product);
    console.log(`${s.name}`);
    console.log(`  points:        ${s.count} (every ${s.intervalMinutes.join('/')} min)`);
    console.log(`  span:          ${s.firstNZ} NZ  ->  ${s.lastNZ} NZ  (${s.spanHours}h)`);
    console.log(`  max:           ${s.maxValue}  at ${s.maxAtNZ} NZ`);
    console.log('');
  }

  if (compare) {
    console.log('--- Open-Meteo (current production source) ---\n');
    const omHourly = await fetchOpenMeteo(lat, long);
    const omValues = omHourly.uv_index.map((v, i) => ({ time: omHourly.time[i] + ':00', value: v ?? 0 }));
    const omMax = omValues.reduce((a, b) => (b.value > a.value ? b : a));
    console.log(`open-meteo_uv_index`);
    console.log(`  points:        ${omValues.length}`);
    console.log(`  span:          ${omHourly.time[0]} NZ  ->  ${omHourly.time[omHourly.time.length - 1]} NZ`);
    console.log(`  max:           ${Math.round(omMax.value * 100) / 100}  at ${omMax.time}`);
    console.log('');
  }

  console.log('Done. This data was fetched for internal testing only — see the');
  console.log('header comment before using NIWA data anywhere user-facing.\n');
}

main().catch(err => {
  console.error(`\nFAILED: ${err.message}\n`);
  process.exitCode = 1;
});
