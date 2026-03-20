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
function getNZLocalDate(timestamp) {}
function getNZHourString() {}
function formatHour(isoHourString) {}
function getUVLevel(uvi) {}
function getCurrentUVI(hourlyData) {}
function getDailyPeak(hourlyData) {}
function getSunSmartWindow(hourlyData) {}
function getSunscreenTiming(hourlyData) {}

/* ============================================================
   CACHE & STATE
   ============================================================ */
function loadState() {}
function saveState(key, value) {}
function clearState(key) {}
function isCacheValid(cache, lat, long) {}
function cacheUVData(data, lat, long) {}
function loadCachedUV() {}

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
