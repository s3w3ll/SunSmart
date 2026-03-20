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
const POLICY_DATA = {};
function getActions(policyType, uviAtHour) {}

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
