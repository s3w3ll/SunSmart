/* ============================================================
   CONFIG
   ============================================================ */
const NZ_BOUNDS = { latMin: -47, latMax: -34, longMin: 166, longMax: 178 };
const SUNSMART_THRESHOLD = 3;
const CHART_START_HOUR = 6;   // 6am NZ local
const CHART_END_HOUR = 19;    // 7pm NZ local
const END_OF_DAY_HOUR = 19;   // past 7pm → "check back tomorrow"
const SUNSCREEN_APPLY_BEFORE_MIN = 20;
const SUNSCREEN_REAPPLY_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hours

/* ============================================================
   POLICY DATA
   ============================================================ */
const POLICY_DATA = {
  ec: {
    items: [
      'Wear a compliant hat outside — legionnaire, broad-brim (≥7.5cm), or bucket (≥6cm). No baseball caps or visors.',
      'Sunscreen SPF 30+ (water-resistant, broad-spectrum) applied 20 min before going outside. Written parental permission required before staff apply sunscreen.',
      'Reapply sunscreen every 2 hours (or after swimming or sweating). Provide routine breaks for reapplication.',
      'Seek and use available shade during outdoor activities.',
      'Sun-protective clothing — loose-fitting, sleeves and collar, knee-length or longer.',
      'Sunglasses recommended (must meet AS/NZS 1067).',
      'Staff must follow and model all SunSmart measures.',
      'No hat? Child must play in shade or indoors.',
      'Provide spare sunhats for any children without one.',
    ],
    babyCallout: '🍼 Infants: Babies under 12 months must be kept out of direct sun at all times when UVI ≥ 3. Sunscreen is not recommended for babies under 6 months — use shade and clothing only. For babies 6–12 months, apply sunscreen to small exposed areas only using a sensitive children\'s formulation (patch test first).',
  },
  primary: {
    items: [
      'Wear a compliant hat outside — legionnaire, broad-brim (≥7.5cm), or bucket (≥6cm). No baseball caps or visors.',
      'Sunscreen SPF 30+ (water-resistant, broad-spectrum) applied 20 min before going outside.',
      'Reapply sunscreen every 2 hours (or after swimming or sweating).',
      'Seek and use available shade during outdoor activities.',
      'Sun-protective clothing — loose-fitting, sleeves and collar, knee-length or longer.',
      'Sunglasses recommended (must meet AS/NZS 1067).',
      'Staff must follow and model all SunSmart measures.',
      'No hat? Student must play in shade or indoors.',
      'Rash tops required for water play and swimming.',
    ],
  },
  secondary: {
    items: [
      'Wear a compliant hat outside — legionnaire, broad-brim (≥7.5cm), or bucket (≥6cm). No baseball caps or visors.',
      'Sunscreen SPF 30+ (water-resistant, broad-spectrum) applied 20 min before going outside.',
      'Reapply sunscreen every 2 hours (or after swimming or sweating).',
      'Seek and use available shade during outdoor activities.',
      'Sun-protective clothing — loose-fitting with sleeves and collar.',
      'Sunglasses recommended (must meet AS/NZS 1067).',
      'Staff must follow and model all SunSmart measures.',
      'Rash tops required for swimming sports and outdoor water activities.',
    ],
  },
};

function getActions(policyType, uviAtHour) {
  const policy = POLICY_DATA[policyType];
  if (!policy) return { active: false, items: [] };
  const active = (uviAtHour ?? 0) >= SUNSMART_THRESHOLD;
  const result = { active, items: active ? policy.items : [] };
  if (policyType === 'ec' && active) {
    result.babyCallout = policy.babyCallout;
  }
  return result;
}

/* ============================================================
   UV DATA UTILITIES
   ============================================================ */
function getNZLocalDate(timestamp) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Pacific/Auckland',
  }).format(new Date(timestamp));
}

function getNZHourString() {
  // Returns "YYYY-MM-DDTHH:00" matching Open-Meteo timestamp format, in NZ local time
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Pacific/Auckland',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hour12: false,
  }).formatToParts(now);
  const get = (type) => parts.find(p => p.type === type).value;
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:00`;
}

function formatHour(isoHourString) {
  // "2026-03-20T14:00" → "2:00pm"
  const hour = parseInt(isoHourString.split('T')[1].split(':')[0], 10);
  if (hour === 0)  return '12:00am';
  if (hour < 12)  return `${hour}:00am`;
  if (hour === 12) return '12:00pm';
  return `${hour - 12}:00pm`;
}

function getUVLevel(uvi) {
  const v = uvi ?? 0;
  if (v >= 11) return 'extreme';
  if (v >= 8)  return 'very-high';
  if (v >= 6)  return 'high';
  if (v >= 3)  return 'moderate';
  return 'low';
}

function getCurrentUVI(hourlyData) {
  const nowHour = getNZHourString();
  const idx = hourlyData.time.indexOf(nowHour);
  if (idx === -1) return 0;
  return hourlyData.uv_index[idx] ?? 0;
}

function getDailyPeak(hourlyData) {
  let maxVal = -1;
  let maxIdx = -1;
  hourlyData.uv_index.forEach((v, i) => {
    const val = v ?? 0;
    if (val > maxVal) { maxVal = val; maxIdx = i; }
  });
  if (maxVal <= 0) return null;
  return { value: maxVal, time: hourlyData.time[maxIdx] };
}

function getSunSmartWindow(hourlyData) {
  const activeIdxs = hourlyData.uv_index
    .map((v, i) => ({ v: v ?? 0, i }))
    .filter(({ v }) => v >= SUNSMART_THRESHOLD)
    .map(({ i }) => i);
  if (activeIdxs.length === 0) return null;
  return {
    start: hourlyData.time[activeIdxs[0]],
    end:   hourlyData.time[activeIdxs[activeIdxs.length - 1]],
  };
}

function getSunscreenTiming(hourlyData) {
  const window = getSunSmartWindow(hourlyData);
  if (!window) return null;

  const firstActive = new Date(window.start);
  const lastActive  = new Date(window.end);
  const applyBy     = new Date(firstActive.getTime() - SUNSCREEN_APPLY_BEFORE_MIN * 60 * 1000);

  const reapplyTimes = [];
  let t = new Date(firstActive);
  while (t <= lastActive) {
    reapplyTimes.push(new Date(t));
    t = new Date(t.getTime() + SUNSCREEN_REAPPLY_INTERVAL_MS);
  }

  return { applyBy, reapplyTimes };
}

/* ============================================================
   CACHE & STATE
   ============================================================ */
function loadState() {
  try {
    return {
      location: JSON.parse(localStorage.getItem('sunsmart_location') || 'null'),
      policy:   localStorage.getItem('sunsmart_policy') || null,
      uvCache:  JSON.parse(localStorage.getItem('sunsmart_uv_cache') || 'null'),
    };
  } catch {
    return { location: null, policy: null, uvCache: null };
  }
}

function saveState(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* storage full — silently ignore */ }
}

function clearState(key) {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

function isCacheValid(cache, lat, long) {
  if (!cache || !cache.fetchedAt || !cache.data) return false;
  const cacheDate = getNZLocalDate(cache.fetchedAt);
  const todayDate = getNZLocalDate(Date.now());
  if (cacheDate !== todayDate) return false;
  if (Math.abs((cache.lat ?? 999) - lat)  > 0.01) return false;
  if (Math.abs((cache.long ?? 999) - long) > 0.01) return false;
  return true;
}

function cacheUVData(data, lat, long) {
  saveState('sunsmart_uv_cache', { data, fetchedAt: Date.now(), lat, long });
}

function loadCachedUV() {
  const state = loadState();
  return state.uvCache;
}

/* ============================================================
   API
   ============================================================ */
let currentFetchController = null;
async function fetchUVData(lat, long) {}
async function searchAddress(query) {}
async function reverseGeocode(lat, long) {}

/* ============================================================
   RENDERING
   ============================================================ */
function showLocationSelector() {}
function hideLocationSelector() {}
function renderUVCard(hourlyData, location) {}
function renderChart(hourlyData) {}
function renderDataTable(hourlyData) {}
function renderPolicyPanel(policyType, hourlyData) {}
function renderChecklist(policyType, hourlyData) {}
function renderTimeline(policyType, hourlyData) {}
function showLoading(show) {}
function showAPIError(message) {}
function hideAPIError() {}
function showStaleWarning(fetchedAt) {}
function hideStaleWarning() {}

/* ============================================================
   BOOT
   ============================================================ */
async function init() {}
document.addEventListener('DOMContentLoaded', init);

/* ============================================================
   CONDITIONAL EXPORTS FOR NODE.JS TESTING
   ============================================================ */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getActions,
    getNZLocalDate,
    getNZHourString,
    formatHour,
    getUVLevel,
    getCurrentUVI,
    getDailyPeak,
    getSunSmartWindow,
    getSunscreenTiming,
    isCacheValid,
  };
}
