import webpush from 'web-push';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!authorised(request, env)) {
      return new Response('Forbidden', { status: 403 });
    }

    if (request.method === 'POST' && url.pathname === '/subscribe') {
      return handleSubscribe(request, env);
    }
    if (request.method === 'DELETE' && url.pathname === '/unsubscribe') {
      return handleUnsubscribe(request, env);
    }
    return new Response('Not found', { status: 404 });
  },

  async scheduled(event, env) {
    if (event.cron === '0 0 * * *') {
      await resetLastUV(env);
    } else {
      await checkAndNotify(env);
    }
  },
};

// ── Auth ──────────────────────────────────────────────────────────────────────

function authorised(request, env) {
  return request.headers.get('X-Subscribe-Secret') === env.SUBSCRIBE_SECRET;
}

// ── Routes ────────────────────────────────────────────────────────────────────

async function handleSubscribe(request, env) {
  const { subscription, location } = await request.json();
  if (!subscription?.endpoint || !location?.lat || !location?.long) {
    return new Response('Bad request', { status: 400 });
  }
  const key = await endpointKey(subscription.endpoint);
  const entry = { pushSubscription: subscription, location, lastUV: 0, lastNotifiedAt: null };
  await env.SUBSCRIPTIONS.put(key, JSON.stringify(entry));
  return new Response('OK', { status: 200 });
}

async function handleUnsubscribe(request, env) {
  const { endpoint } = await request.json();
  if (!endpoint) return new Response('Bad request', { status: 400 });
  const key = await endpointKey(endpoint);
  await env.SUBSCRIPTIONS.delete(key);
  return new Response('OK', { status: 200 });
}

// ── Cron: UV check ────────────────────────────────────────────────────────────

async function checkAndNotify(env) {
  if (!isWithinNotifyWindow(new Date())) return;

  webpush.setVapidDetails(
    'mailto:hayden.sewell@gmail.com',
    env.VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY,
  );

  let cursor;
  do {
    const list = await env.SUBSCRIPTIONS.list({ cursor, limit: 1000 });
    cursor = list.cursor;

    await Promise.all(list.keys.map(async ({ name }) => {
      const raw = await env.SUBSCRIPTIONS.get(name);
      if (!raw) return;
      const entry = JSON.parse(raw);

      const currentUV = await fetchCurrentUV(entry.location.lat, entry.location.long);
      if (currentUV === null) return; // Open-Meteo unavailable — skip, preserve lastUV

      if (shouldNotify(entry.lastUV, currentUV)) {
        const sent = await sendPush(entry.pushSubscription, entry.location.label, currentUV, env);
        if (sent === 'gone') {
          await env.SUBSCRIPTIONS.delete(name);
          return;
        }
        entry.lastNotifiedAt = new Date().toISOString();
      }

      entry.lastUV = currentUV;
      await env.SUBSCRIPTIONS.put(name, JSON.stringify(entry));
    }));
  } while (cursor);
}

// ── Cron: midnight reset ──────────────────────────────────────────────────────

async function resetLastUV(env) {
  let cursor;
  do {
    const list = await env.SUBSCRIPTIONS.list({ cursor, limit: 1000 });
    cursor = list.cursor;
    await Promise.all(list.keys.map(async ({ name }) => {
      const raw = await env.SUBSCRIPTIONS.get(name);
      if (!raw) return;
      const entry = JSON.parse(raw);
      entry.lastUV = 0;
      await env.SUBSCRIPTIONS.put(name, JSON.stringify(entry));
    }));
  } while (cursor);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isWithinNotifyWindow(date) {
  const nzHour = parseInt(
    new Intl.DateTimeFormat('en-NZ', {
      timeZone: 'Pacific/Auckland',
      hour: 'numeric',
      hour12: false,
    }).format(date),
    10
  );
  return nzHour >= 9 && nzHour < 16;
}

function shouldNotify(lastUV, currentUV) {
  return lastUV < 3 && currentUV >= 3;
}

async function fetchCurrentUV(lat, long) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${long}&hourly=uv_index&timezone=Pacific%2FAuckland&forecast_days=1`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const nzHour = parseInt(
      new Intl.DateTimeFormat('en-NZ', {
        timeZone: 'Pacific/Auckland',
        hour: 'numeric',
        hour12: false,
      }).format(new Date()),
      10
    );
    return Math.round(json.hourly.uv_index[nzHour] * 10) / 10;
  } catch {
    return null;
  }
}

async function sendPush(subscription, locationLabel, uvValue, env) {
  const payload = JSON.stringify({
    title: `☀️ UV is now ${uvValue} at ${locationLabel}`,
    body: 'SunSmart measures required — hats, sunscreen, shade.',
  });
  try {
    await webpush.sendNotification(subscription, payload);
    return 'ok';
  } catch (err) {
    if (err.statusCode === 410) return 'gone';
    return 'error';
  }
}

async function endpointKey(endpoint) {
  const data = new TextEncoder().encode(endpoint);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}
