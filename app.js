/* ============================================================
   CONFIG
   ============================================================ */
const NZ_BOUNDS = { latMin: -47, latMax: -34, longMin: 166, longMax: 178 };
const SUNSMART_THRESHOLD = 3;
const CHART_START_HOUR = 7;   // 7am NZ local
const CHART_END_HOUR = 18;    // 6pm NZ local
const END_OF_DAY_HOUR = 19;   // past 7pm → "check back tomorrow"
const SUNSCREEN_APPLY_BEFORE_MIN = 20;
const SUNSCREEN_REAPPLY_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hours

let _listenersInitialized = false;  // prevents duplicate listeners on bfcache restore

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
  const active = meetsThreshold(uviAtHour);
  const result = { active, items: active ? policy.items : [] };
  if (policyType === 'ec' && active) {
    result.babyCallout = policy.babyCallout;
  }
  return result;
}

/* ============================================================
   UV DATA UTILITIES
   ============================================================ */
/** Returns the fixed chart/timeline hour window (7am–6pm). */
function getSchoolHourRange() {
  return { start: CHART_START_HOUR, end: CHART_END_HOUR };
}

function getNZLocalDate(timestamp) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Pacific/Auckland',
  }).format(new Date(timestamp));
}

/**
 * Converts a Date object back to a NZ local time string in the same
 * "YYYY-MM-DDTHH:MM" format that Open-Meteo uses. Always use this
 * instead of .toISOString() when the result will be passed to formatHour()
 * or compared against Open-Meteo timestamps — toISOString() is always
 * UTC, which is 12–13 hours off from NZ local time.
 */
function nzISOString(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Pacific/Auckland',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date);
  const get = type => parts.find(p => p.type === type).value;
  const h = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}-${get('month')}-${get('day')}T${h}:${get('minute')}`;
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

/**
 * Rounds a raw UV float to 1 decimal place before threshold comparisons.
 * Open-Meteo returns values like 2.96 which displays as "3.0" but would
 * fail a raw `>= 3` check — rounding here keeps logic and display in sync.
 */
function roundUV(uvi) {
  return parseFloat((uvi ?? 0).toFixed(1));
}

function meetsThreshold(uvi) {
  return roundUV(uvi) >= SUNSMART_THRESHOLD;
}

function getUVLevel(uvi) {
  const v = roundUV(uvi);
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
    .filter(({ v }) => meetsThreshold(v))
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
      policy:   JSON.parse(localStorage.getItem('sunsmart_policy') || 'null'),
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

async function fetchUVData(lat, long) {
  if (currentFetchController) currentFetchController.abort();
  currentFetchController = new AbortController();

  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', lat);
  url.searchParams.set('longitude', long);
  url.searchParams.set('hourly', 'uv_index');
  url.searchParams.set('timezone', 'Pacific/Auckland');
  url.searchParams.set('forecast_days', '1');

  const response = await fetch(url, { signal: currentFetchController.signal });
  if (!response.ok) throw new Error(`Open-Meteo error: ${response.status}`);
  const json = await response.json();
  currentFetchController = null;
  return json.hourly; // { time: [...], uv_index: [...] }
}

async function searchAddress(query) {
  if (!query || query.trim().length < 2) return [];
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query.trim());
  url.searchParams.set('format', 'json');
  url.searchParams.set('countrycodes', 'nz');
  url.searchParams.set('limit', '5');
  url.searchParams.set('addressdetails', '1');

  const response = await fetch(url, {
    headers: { 'Accept-Language': 'en', 'User-Agent': 'SunSmart-NZ/1.0' },
  });
  if (!response.ok) throw new Error(`Nominatim error: ${response.status}`);
  const results = await response.json();
  return results.map(r => ({
    label: r.display_name,
    lat: parseFloat(r.lat),
    long: parseFloat(r.lon),
  }));
}

async function reverseGeocode(lat, long) {
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('lat', lat);
  url.searchParams.set('lon', long);
  url.searchParams.set('format', 'json');

  const response = await fetch(url, {
    headers: { 'Accept-Language': 'en', 'User-Agent': 'SunSmart-NZ/1.0' },
  });
  if (!response.ok) throw new Error(`Nominatim reverse error: ${response.status}`);
  const data = await response.json();
  const a = data.address || {};
  const label = [a.suburb || a.town || a.city_district, a.city || a.county]
    .filter(Boolean).join(', ') || data.display_name.split(',').slice(0, 2).join(',').trim();
  return label;
}

/* ============================================================
   RENDERING — Location Selector
   ============================================================ */
function showLocationSelector() {
  document.getElementById('location-selector').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
  document.getElementById('address-input').value = '';
  document.getElementById('address-results').classList.add('hidden');
  document.getElementById('location-error').classList.add('hidden');
}

function hideLocationSelector() {
  document.getElementById('location-selector').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
}

function initLocationSelector() {
  const input       = document.getElementById('address-input');
  const resultsList = document.getElementById('address-results');
  const errorEl     = document.getElementById('location-error');
  let debounceTimer = null;

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const query = input.value.trim();
    if (query.length < 2) {
      resultsList.classList.add('hidden');
      return;
    }
    debounceTimer = setTimeout(async () => {
      try {
        const results = await searchAddress(query);
        resultsList.innerHTML = '';
        if (results.length === 0) {
          resultsList.innerHTML = '<li class="search-results__empty">No results found — try a suburb name or school address</li>';
        } else {
          results.forEach(r => {
            const li = document.createElement('li');
            li.textContent = r.label;
            li.setAttribute('role', 'option');
            li.tabIndex = 0;
            li.addEventListener('click', () => selectLocation(r.lat, r.long, r.label));
            li.addEventListener('keydown', e => { if (e.key === 'Enter') selectLocation(r.lat, r.long, r.label); });
            resultsList.appendChild(li);
          });
        }
        resultsList.classList.remove('hidden');
      } catch (e) {
        console.warn('Address search failed:', e);
      }
    }, 300);
  });

  // Close results on outside click
  document.addEventListener('click', e => {
    if (!e.target.closest('.search-box')) resultsList.classList.add('hidden');
  });

  // GPS button
  document.getElementById('gps-btn').addEventListener('click', () => {
    errorEl.classList.add('hidden');
    if (!navigator.geolocation) {
      errorEl.textContent = 'Geolocation is not supported by your browser.';
      errorEl.classList.remove('hidden');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: long } = pos.coords;
        if (lat < NZ_BOUNDS.latMin || lat > NZ_BOUNDS.latMax ||
            long < NZ_BOUNDS.longMin || long > NZ_BOUNDS.longMax) {
          errorEl.textContent = 'Location not supported — this app covers mainland New Zealand. Try searching for your address instead.';
          errorEl.classList.remove('hidden');
          return;
        }
        try {
          const label = await reverseGeocode(lat, long);
          selectLocation(lat, long, label);
        } catch {
          selectLocation(lat, long, `${lat.toFixed(3)}, ${long.toFixed(3)}`);
        }
      },
      () => {
        // Permission denied — silently fall back to search
        input.focus();
      }
    );
  });
}

async function selectLocation(lat, long, label) {
  const location = { lat, long, label };
  saveState('sunsmart_location', location);
  hideLocationSelector();
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('location-label').textContent = label;
  await loadAndRenderUV(location);
}

/* ============================================================
   RENDERING — UV Data Card
   ============================================================ */
const UV_LEVEL_LABELS = {
  'low': 'Low', 'moderate': 'Moderate', 'high': 'High',
  'very-high': 'Very High', 'extreme': 'Extreme',
};

function renderUVCard(hourlyData, location, policyType) {
  const currentUVI = getCurrentUVI(hourlyData);
  const level      = getUVLevel(currentUVI);
  const peak       = getDailyPeak(hourlyData);
  const uvWindow   = getSunSmartWindow(hourlyData);

  // Card background
  document.getElementById('uv-card').setAttribute('data-level', level);

  // Location
  document.getElementById('location-label').textContent = location.label;

  // Current UVI
  document.getElementById('uv-current').textContent = currentUVI > 0 ? currentUVI.toFixed(1) : '–';
  document.getElementById('uv-level').textContent = UV_LEVEL_LABELS[level] || '';

  // Daily peak
  const peakEl = document.getElementById('uv-peak');
  peakEl.textContent = peak
    ? `Daily peak: ${peak.value.toFixed(1)} at ${formatHour(peak.time)}`
    : 'UV index is low all day';

  // SunSmart active window
  const windowEl   = document.getElementById('uv-window');
  const windowNote = document.getElementById('uv-window-note');
  if (!policyType) {
    windowEl.textContent = 'Select a Policy Type ↓';
    windowNote.classList.add('hidden');
  } else if (uvWindow) {
    windowEl.textContent = `SunSmart hours: ${formatHour(uvWindow.start)} – ${formatHour(uvWindow.end)}`;
    windowNote.classList.remove('hidden');
  } else {
    windowEl.textContent = 'No SunSmart hours today';
    windowNote.classList.add('hidden');
  }

  // End-of-day check
  const nowParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Pacific/Auckland', hour: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const currentHour = parseInt(nowParts.find(p => p.type === 'hour').value, 10);
  document.getElementById('end-of-day').classList.toggle('hidden', currentHour < END_OF_DAY_HOUR);
}

/* ============================================================
   RENDERING — UV Chart
   ============================================================ */
let chartInstance = null;

function renderChart(hourlyData) {
  const { start: chartStart, end: chartEnd } = getSchoolHourRange();
  const chartData = hourlyData.time
    .map((t, i) => ({ t, v: hourlyData.uv_index[i] }))
    .filter(({ t }) => {
      const hour = parseInt(t.split('T')[1].split(':')[0], 10);
      return hour >= chartStart && hour <= chartEnd;
    });

  const labels = chartData.map(d => formatHour(d.t));
  const values = chartData.map(d => d.v); // nulls kept — renders as gaps
  const nowHour = getNZHourString();
  const nowIdx  = chartData.findIndex(d => d.t === nowHour);

  const ctx = document.getElementById('uv-chart').getContext('2d');
  if (chartInstance) {
    try { chartInstance.destroy(); } catch { /* ignore stale canvas instance */ }
    chartInstance = null;
  }

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: values,
        borderColor: '#e65100',
        borderWidth: 2.5,
        pointRadius: 3,
        pointBackgroundColor: values.map(v => {
          const lvl = getUVLevel(v);
          return ({ low:'#4caf50', moderate:'#ffc107', high:'#ff9800', 'very-high':'#f44336', extreme:'#9c27b0' })[lvl] || '#e0e0e0';
        }),
        fill: {
          target: { value: SUNSMART_THRESHOLD },
          above: 'rgba(255, 193, 7, 0.25)',
          below: 'rgba(200, 200, 200, 0.15)',
        },
        spanGaps: false,
        tension: 0.3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 2.2,
      plugins: {
        legend: { display: false },
        annotation: {
          annotations: {
            threshold: {
              type: 'line',
              yMin: SUNSMART_THRESHOLD,
              yMax: SUNSMART_THRESHOLD,
              borderColor: 'rgba(220, 50, 50, 0.7)',
              borderWidth: 1.5,
              borderDash: [6, 4],
              label: {
                content: 'SunSmart threshold (UVI 3)',
                display: true,
                position: 'end',
                color: 'rgba(180,0,0,0.7)',
                font: { size: 10 },
                backgroundColor: 'rgba(255,255,255,0.7)',
              },
            },
            ...(nowIdx >= 0 ? {
              nowLine: {
                type: 'line',
                xMin: nowIdx,
                xMax: nowIdx,
                borderColor: 'rgba(33, 33, 33, 0.45)',
                borderWidth: 1.5,
                borderDash: [4, 4],
                label: {
                  content: 'Now',
                  display: true,
                  position: 'start',
                  font: { size: 10 },
                  backgroundColor: 'rgba(255,255,255,0.7)',
                  color: '#333',
                },
              },
            } : {}),
          },
        },
        tooltip: {
          callbacks: {
            label: ctx => `UV Index: ${ctx.parsed.y !== null ? ctx.parsed.y.toFixed(1) : '–'}`,
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 45 } },
        y: {
          min: 0,
          suggestedMax: 12,
          grid: { color: 'rgba(0,0,0,0.06)' },
          title: { display: true, text: 'UV Index', font: { size: 11 } },
          ticks: { stepSize: 2, font: { size: 10 } },
        },
      },
    },
  });
}


/* ============================================================
   RENDERING — Policy Action Panel
   ============================================================ */
function initPolicyPills() {
  document.querySelectorAll('.pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const policyType = btn.dataset.policy;
      saveState('sunsmart_policy', policyType);
      document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const cache = loadCachedUV();
      if (cache && cache.data) renderPolicyPanel(policyType, cache.data);
    });
  });
}

function renderPolicyPanel(policyType, hourlyData) {
  const promptEl    = document.getElementById('policy-prompt');
  const checklistEl = document.getElementById('checklist-section');
  const timelineEl  = document.getElementById('timeline-details');

  if (!policyType) {
    promptEl.classList.remove('hidden');
    checklistEl.classList.add('hidden');
    timelineEl.classList.add('hidden');
    return;
  }

  promptEl.classList.add('hidden');
  checklistEl.classList.remove('hidden');
  timelineEl.classList.remove('hidden');

  renderChecklist(policyType, hourlyData);
  renderTimeline(policyType, hourlyData);
}

function renderChecklist(policyType, hourlyData) {
  const currentUVI       = getCurrentUVI(hourlyData);
  const sunscreenTiming  = getSunscreenTiming(hourlyData);
  const actions          = getActions(policyType, currentUVI);
  const now              = new Date();

  const statusEl          = document.getElementById('checklist-status');
  const sunscreenPromptEl = document.getElementById('sunscreen-prompt');
  const babyCalloutEl     = document.getElementById('baby-callout');
  const listEl            = document.getElementById('checklist');

  // Status banner
  if (actions.active) {
    const lvl = getUVLevel(currentUVI);
    statusEl.textContent = `☀️ SunSmart is active now (UVI ${currentUVI.toFixed(1)} — ${UV_LEVEL_LABELS[lvl] || ''})`;
    statusEl.className = 'checklist-status checklist-status--active';
  } else {
    statusEl.textContent = '✓ No SunSmart measures required right now';
    statusEl.className = 'checklist-status checklist-status--inactive';
  }

  // Sunscreen apply-now prompt (between apply-by and first active hour)
  sunscreenPromptEl.classList.add('hidden');
  if (sunscreenTiming && !actions.active) {
    const firstActiveTime = sunscreenTiming.reapplyTimes[0];
    if (firstActiveTime && now >= sunscreenTiming.applyBy && now < firstActiveTime) {
      const startLabel = formatHour(nzISOString(firstActiveTime));
      sunscreenPromptEl.textContent = `🧴 Apply sunscreen now — UVI 3 or above starts at ${startLabel}`;
      sunscreenPromptEl.classList.remove('hidden');
    }
  }

  // Baby callout (EC only)
  if (actions.babyCallout) {
    babyCalloutEl.textContent = actions.babyCallout;
    babyCalloutEl.classList.remove('hidden');
  } else {
    babyCalloutEl.classList.add('hidden');
  }

  // Checklist items
  listEl.innerHTML = '';
  actions.items.forEach(item => {
    const li = document.createElement('li');
    li.textContent = item;
    listEl.appendChild(li);
  });
}

function renderTimeline(policyType, hourlyData) {
  const sunscreenTiming    = getSunscreenTiming(hourlyData);
  const reapplyISOStrings  = (sunscreenTiming?.reapplyTimes || [])
    .map(d => nzISOString(d));

  const { start: tlStart, end: tlEnd } = getSchoolHourRange();

  // Update the toggle label
  const toggleLabelEl = document.getElementById('timeline-toggle-label');
  if (toggleLabelEl) {
    toggleLabelEl.textContent = 'Plan your day';
  }

  const timelineEl   = document.getElementById('timeline');
  const hourDetailEl = document.getElementById('hour-detail');
  timelineEl.innerHTML = '';
  hourDetailEl.classList.add('hidden');

  hourlyData.time.forEach((t, i) => {
    const hour = parseInt(t.split('T')[1].split(':')[0], 10);
    if (hour < tlStart || hour > tlEnd) return;

    const uvi       = hourlyData.uv_index[i] ?? 0;
    const level     = getUVLevel(uvi);
    const isActive  = meetsThreshold(uvi);
    const isReapply = reapplyISOStrings.some(r => t.startsWith(r));

    const block = document.createElement('div');
    block.className = 'timeline-block';
    block.setAttribute('data-level', isActive ? level : 'none');
    block.setAttribute('role', 'listitem');
    block.setAttribute('aria-label', `${formatHour(t)}: UVI ${uvi > 0 ? uvi.toFixed(1) : '–'}`);
    block.tabIndex = 0;

    if (isReapply) {
      const dot = document.createElement('div');
      dot.className = 'timeline-block__reapply';
      dot.title = 'Sunscreen reapply time';
      block.appendChild(dot);
    }

    const timeLabel = document.createElement('span');
    timeLabel.className = 'timeline-block__time';
    timeLabel.textContent = formatHour(t).replace(':00', '');
    block.appendChild(timeLabel);

    const showDetail = () => {
      const hourActions = getActions(policyType, uvi);
      hourDetailEl.innerHTML = `
        <strong>${formatHour(t)}</strong> — UV Index: ${uvi > 0 ? uvi.toFixed(1) : '–'}
        ${hourActions.active
          ? `<ul>${hourActions.items.map(it => `<li>${it}</li>`).join('')}</ul>`
          : '<p style="margin-top:8px;color:#388e3c;">No SunSmart measures required at this hour.</p>'
        }
      `;
      hourDetailEl.classList.remove('hidden');
    };
    block.addEventListener('click', showDetail);
    block.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') showDetail(); });

    timelineEl.appendChild(block);
  });
}

/* ============================================================
   RENDERING — Status helpers
   ============================================================ */
function showLoading(show) {
  document.getElementById('loading-indicator').classList.toggle('hidden', !show);
}

function showAPIError(message) {
  document.getElementById('api-error-msg').textContent = message;
  document.getElementById('api-error').classList.remove('hidden');
}

function hideAPIError() {
  document.getElementById('api-error').classList.add('hidden');
}

function showStaleWarning(fetchedAt) {
  const el = document.getElementById('uv-stale-warning');
  const time = new Intl.DateTimeFormat('en-NZ', {
    timeZone: 'Pacific/Auckland',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(new Date(fetchedAt));
  el.textContent = `⚠ Last updated: ${time}`;
  el.classList.remove('hidden');
}

function hideStaleWarning() {
  document.getElementById('uv-stale-warning').classList.add('hidden');
}

/* ============================================================
   RESET
   ============================================================ */
function initResetBtn() {
  document.getElementById('reset-btn').addEventListener('click', () => {
    if (!confirm('Reset your location and policy selection?')) return;
    clearState('sunsmart_location');
    clearState('sunsmart_policy');
    clearState('sunsmart_uv_cache');
    if (currentFetchController) currentFetchController.abort();
    showLocationSelector();
  });
}


/* ============================================================
   BOOT
   ============================================================ */
function renderAll(hourlyData, location) {
  const state      = loadState();
  const policyType = state.policy;
  renderUVCard(hourlyData, location, policyType);
  renderChart(hourlyData);
  renderPolicyPanel(policyType, hourlyData);
  hideAPIError();
}

async function silentRefresh(location) {
  try {
    const fresh = await fetchUVData(location.lat, location.long);
    cacheUVData(fresh, location.lat, location.long);
    renderAll(fresh, location);
    hideStaleWarning();
  } catch { /* silent — don't show errors for background refreshes */ }
}

async function loadAndRenderUV(location) {
  const cache        = loadCachedUV();
  const hasValidCache = isCacheValid(cache, location.lat, location.long);
  const hasAnyCache   = cache && cache.data;

  if (hasValidCache) {
    try { renderAll(cache.data, location); } catch { /* canvas may be stale — refresh will fix it */ }
    silentRefresh(location); // background refresh, don't await
  } else if (hasAnyCache) {
    renderAll(cache.data, location);
    showStaleWarning(cache.fetchedAt);
    try {
      const fresh = await fetchUVData(location.lat, location.long);
      cacheUVData(fresh, location.lat, location.long);
      renderAll(fresh, location);
      hideStaleWarning();
    } catch (e) {
      if (e.name !== 'AbortError') {
        showAPIError('Could not refresh UV data. Showing last known data.');
        document.getElementById('retry-btn').onclick = () => loadAndRenderUV(location);
      }
    }
  } else {
    showLoading(true);
    hideAPIError();
    try {
      const fresh = await fetchUVData(location.lat, location.long);
      cacheUVData(fresh, location.lat, location.long);
      showLoading(false);
      renderAll(fresh, location);
    } catch (e) {
      showLoading(false);
      if (e.name !== 'AbortError') {
        showAPIError('Could not load UV data. Please check your connection and try again.');
        document.getElementById('retry-btn').onclick = () => loadAndRenderUV(location);
      }
    }
  }
}

async function bootApp() {
  const state      = loadState();
  const policyType = state.policy;

  // Restore policy pill active state
  if (policyType) {
    document.querySelectorAll('.pill').forEach(p => {
      p.classList.toggle('active', p.dataset.policy === policyType);
    });
  }

  if (!state.location) {
    showLocationSelector();
    return;
  }

  try {
    document.getElementById('location-selector').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    document.getElementById('location-label').textContent = state.location.label;
    await loadAndRenderUV(state.location);
  } catch (e) {
    showAPIError('Something went wrong loading your data. Please try again.');
    document.getElementById('retry-btn').onclick = () => { hideAPIError(); loadAndRenderUV(state.location); };
  }
}

async function init() {
  // Register event listeners once only — prevents duplicate handlers on bfcache restore
  if (!_listenersInitialized) {
    _listenersInitialized = true;

    initLocationSelector();
    initPolicyPills();
    initResetBtn();

    document.getElementById('change-location-btn').addEventListener('click', () => {
      if (currentFetchController) currentFetchController.abort();
      clearState('sunsmart_location');
      clearState('sunsmart_uv_cache');
      showLocationSelector();
    });
  }

  await bootApp();
}

document.addEventListener('DOMContentLoaded', init);

// Handle bfcache restore (mobile Safari caches the full page in memory —
// the canvas is cleared on restore but chartInstance still thinks it's valid)
window.addEventListener('pageshow', (e) => {
  if (e.persisted) {
    chartInstance = null; // force chart re-creation on stale canvas
    const state = loadState();
    if (state.location) {
      const cache = loadCachedUV();
      if (cache?.data) {
        try { renderAll(cache.data, state.location); } catch { /* ignore stale canvas */ }
      }
    }
  }
});

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
