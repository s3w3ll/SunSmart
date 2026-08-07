export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (!authorised(request, env)) {
      return new Response('Forbidden', { status: 403, headers: corsHeaders() });
    }

    if (request.method === 'POST' && url.pathname === '/subscribe') {
      return handleSubscribe(request, env);
    }
    if (request.method === 'DELETE' && url.pathname === '/unsubscribe') {
      return handleUnsubscribe(request, env);
    }
    return new Response('Not found', { status: 404, headers: corsHeaders() });
  },

  async scheduled(event, env) {
    if (event.cron === '0 0 * * *') {
      await resetLastUV(env);
    } else {
      await checkAndNotify(env);
    }
  },
};

// ── CORS ──────────────────────────────────────────────────────────────────────

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Subscribe-Secret',
  };
}

// ── Auth ──────────────────────────────────────────────────────────────────────

function authorised(request, env) {
  return request.headers.get('X-Subscribe-Secret') === env.SUBSCRIBE_SECRET;
}

// ── Routes ────────────────────────────────────────────────────────────────────

async function handleSubscribe(request, env) {
  const { subscription, location } = await request.json();
  if (!subscription?.endpoint || !location?.lat || !location?.long) {
    return new Response('Bad request', { status: 400, headers: corsHeaders() });
  }
  const key = await endpointKey(subscription.endpoint);
  const entry = { pushSubscription: subscription, location, lastUV: 0, lastNotifiedAt: null };
  await env.shadecall_subscriptions.put(key, JSON.stringify(entry));
  return new Response('OK', { status: 200, headers: corsHeaders() });
}

async function handleUnsubscribe(request, env) {
  const { endpoint } = await request.json();
  if (!endpoint) return new Response('Bad request', { status: 400, headers: corsHeaders() });
  const key = await endpointKey(endpoint);
  await env.shadecall_subscriptions.delete(key);
  return new Response('OK', { status: 200, headers: corsHeaders() });
}

// ── Cron: UV check ────────────────────────────────────────────────────────────

async function checkAndNotify(env) {
  if (!isWithinNotifyWindow(new Date())) return;

  let cursor;
  do {
    const list = await env.shadecall_subscriptions.list({ cursor, limit: 1000 });
    cursor = list.cursor;

    await Promise.all(list.keys.map(async ({ name }) => {
      const raw = await env.shadecall_subscriptions.get(name);
      if (!raw) return;
      const entry = JSON.parse(raw);

      const currentUV = await fetchCurrentUV(entry.location.lat, entry.location.long);
      if (currentUV === null) return;

      if (shouldNotify(entry.lastUV, currentUV)) {
        const sent = await sendPush(entry.pushSubscription, entry.location.label, currentUV, env);
        if (sent === 'gone') {
          await env.shadecall_subscriptions.delete(name);
          return;
        }
        entry.lastNotifiedAt = new Date().toISOString();
      }

      entry.lastUV = currentUV;
      await env.shadecall_subscriptions.put(name, JSON.stringify(entry));
    }));
  } while (cursor);
}

// ── Cron: midnight reset ──────────────────────────────────────────────────────

async function resetLastUV(env) {
  let cursor;
  do {
    const list = await env.shadecall_subscriptions.list({ cursor, limit: 1000 });
    cursor = list.cursor;
    await Promise.all(list.keys.map(async ({ name }) => {
      const raw = await env.shadecall_subscriptions.get(name);
      if (!raw) return;
      const entry = JSON.parse(raw);
      entry.lastUV = 0;
      await env.shadecall_subscriptions.put(name, JSON.stringify(entry));
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
    body: 'Sun protection required — hats, sunscreen, shade.',
  });
  try {
    const status = await webPushSend(subscription, payload, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
    if (status === 410 || status === 404) return 'gone';
    if (status >= 200 && status < 300) return 'ok';
    return 'error';
  } catch {
    return 'error';
  }
}

async function endpointKey(endpoint) {
  const data = new TextEncoder().encode(endpoint);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Native Web Push (RFC 8291 + RFC 8292) ─────────────────────────────────────
// No npm dependencies — uses crypto.subtle and fetch, both native to Workers.

async function webPushSend(subscription, payload, vapidPublicKey, vapidPrivateKey) {
  const { endpoint, keys } = subscription;
  const uaPublicKey = b64Decode(keys.p256dh);
  const authSecret = b64Decode(keys.auth);

  const encrypted = await encryptPayload(new TextEncoder().encode(payload), uaPublicKey, authSecret);
  const authorization = await buildVapidHeader(endpoint, vapidPublicKey, vapidPrivateKey);

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      TTL: '86400',
    },
    body: encrypted,
  });
  return res.status;
}

// RFC 8291 §3 — encrypt plaintext for a Web Push subscriber
async function encryptPayload(plaintext, uaPublicKeyBytes, authSecret) {
  // Ephemeral sender key pair
  const senderPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const senderSpki = await crypto.subtle.exportKey('spki', senderPair.publicKey);
  // Uncompressed P-256 point is the last 65 bytes of the SPKI encoding
  const senderPublicKey = new Uint8Array(senderSpki).slice(-65);

  // Import recipient key and derive ECDH secret
  const uaKey = await crypto.subtle.importKey('raw', uaPublicKeyBytes, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhBits = await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, senderPair.privateKey, 256);
  const ecdhSecret = new Uint8Array(ecdhBits);

  // PRK_combine = HKDF-Extract(auth_secret, ecdh_secret)
  const prkCombine = await hkdfExtract(authSecret, ecdhSecret);

  // IKM = HKDF-Expand(prkCombine, "WebPush: info\0" || ua_public || sender_public, 32)
  const wpInfo = concatBytes(new TextEncoder().encode('WebPush: info\x00'), uaPublicKeyBytes, senderPublicKey);
  const ikm = await hkdfExpand(prkCombine, wpInfo, 32);

  // PRK = HKDF-Extract(salt, IKM)
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hkdfExtract(salt, ikm);

  // CEK and nonce
  const cek = await hkdfExpand(prk, new TextEncoder().encode('Content-Encoding: aes128gcm\x00'), 16);
  const nonce = await hkdfExpand(prk, new TextEncoder().encode('Content-Encoding: nonce\x00'), 12);

  // Pad: append 0x02 delimiter (no padding)
  const padded = new Uint8Array(plaintext.length + 1);
  padded.set(plaintext);
  padded[plaintext.length] = 0x02;

  // AES-128-GCM encrypt
  const cekKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, cekKey, padded));

  // RFC 8188 content-encoding header: salt(16) | rs(4 BE) | idlen(1) | sender_public(65) | ciphertext
  const header = new Uint8Array(86);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096, false);
  header[20] = 65;
  header.set(senderPublicKey, 21);
  return concatBytes(header, ciphertext);
}

// RFC 8292 §2 — VAPID authorization header
async function buildVapidHeader(endpoint, vapidPublicKey, vapidPrivateKey) {
  const audience = new URL(endpoint).origin;
  const exp = Math.floor(Date.now() / 1000) + 43200;

  const headerB64 = b64Encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const payloadB64 = b64Encode(JSON.stringify({ aud: audience, exp, sub: 'mailto:hayden.sewell@gmail.com' }));
  const signingInput = `${headerB64}.${payloadB64}`;

  // Reconstruct JWK from raw VAPID keys (public = 04||x||y, private = d)
  const pubBytes = b64Decode(vapidPublicKey);
  const jwk = {
    kty: 'EC', crv: 'P-256',
    x: bytesToB64(pubBytes.slice(1, 33)),
    y: bytesToB64(pubBytes.slice(33, 65)),
    d: vapidPrivateKey,
  };
  const signingKey = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);

  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, signingKey, new TextEncoder().encode(signingInput)));
  const jwt = `${signingInput}.${bytesToB64(sig)}`;
  return `vapid t=${jwt},k=${vapidPublicKey}`;
}

// ── Crypto utilities ──────────────────────────────────────────────────────────

// HKDF-Extract(salt, IKM) = HMAC-SHA-256(key=salt, data=IKM)
async function hkdfExtract(salt, ikm) {
  const k = await crypto.subtle.importKey('raw', salt, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, ikm));
}

// HKDF-Expand(PRK, info, length) — single-block only (length ≤ 32)
async function hkdfExpand(prk, info, length) {
  const input = new Uint8Array(info.length + 1);
  input.set(info);
  input[info.length] = 0x01;
  const k = await crypto.subtle.importKey('raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const t1 = new Uint8Array(await crypto.subtle.sign('HMAC', k, input));
  return t1.slice(0, length);
}

function concatBytes(...arrays) {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) { out.set(a, offset); offset += a.length; }
  return out;
}

// base64url decode → Uint8Array
function b64Decode(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(str.length + (4 - str.length % 4) % 4, '=');
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

// string → base64url (for JWT header/payload)
function b64Encode(str) {
  return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// Uint8Array → base64url (for JWT signature and JWK components)
function bytesToB64(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
