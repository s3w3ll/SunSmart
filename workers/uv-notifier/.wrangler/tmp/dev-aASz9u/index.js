var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-WgdCL5/checked-fetch.js
var urls = /* @__PURE__ */ new Set();
function checkURL(request, init) {
  const url = request instanceof URL ? request : new URL(
    (typeof request === "string" ? new Request(request, init) : request).url
  );
  if (url.port && url.port !== "443" && url.protocol === "https:") {
    if (!urls.has(url.toString())) {
      urls.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`
      );
    }
  }
}
__name(checkURL, "checkURL");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    const [request, init] = argArray;
    checkURL(request, init);
    return Reflect.apply(target, thisArg, argArray);
  }
});

// index.js
var index_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    if (!authorised(request, env)) {
      return new Response("Forbidden", { status: 403, headers: corsHeaders() });
    }
    if (request.method === "POST" && url.pathname === "/subscribe") {
      return handleSubscribe(request, env);
    }
    if (request.method === "DELETE" && url.pathname === "/unsubscribe") {
      return handleUnsubscribe(request, env);
    }
    return new Response("Not found", { status: 404, headers: corsHeaders() });
  },
  async scheduled(event, env) {
    if (event.cron === "0 0 * * *") {
      await resetLastUV(env);
    } else {
      await checkAndNotify(env);
    }
  }
};
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Subscribe-Secret"
  };
}
__name(corsHeaders, "corsHeaders");
function authorised(request, env) {
  return request.headers.get("X-Subscribe-Secret") === env.SUBSCRIBE_SECRET;
}
__name(authorised, "authorised");
async function handleSubscribe(request, env) {
  const { subscription, location } = await request.json();
  if (!subscription?.endpoint || !location?.lat || !location?.long) {
    return new Response("Bad request", { status: 400, headers: corsHeaders() });
  }
  const key = await endpointKey(subscription.endpoint);
  const entry = { pushSubscription: subscription, location, lastUV: 0, lastNotifiedAt: null };
  console.log("[subscribe] key:", key, "kv binding:", typeof env.sunsmart_subscriptions);
  try {
    await env.sunsmart_subscriptions.put(key, JSON.stringify(entry));
    console.log("[subscribe] KV put OK");
  } catch (err) {
    console.error("[subscribe] KV put failed:", err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders() });
  }
  const readback = await env.sunsmart_subscriptions.get(key);
  console.log("[subscribe] readback:", readback ? "found" : "NOT FOUND");
  return new Response(JSON.stringify({ ok: true, key, readback: readback ? "found" : "null" }), { status: 200, headers: { ...corsHeaders(), "Content-Type": "application/json" } });
}
__name(handleSubscribe, "handleSubscribe");
async function handleUnsubscribe(request, env) {
  const { endpoint } = await request.json();
  if (!endpoint) return new Response("Bad request", { status: 400, headers: corsHeaders() });
  const key = await endpointKey(endpoint);
  await env.sunsmart_subscriptions.delete(key);
  return new Response("OK", { status: 200, headers: corsHeaders() });
}
__name(handleUnsubscribe, "handleUnsubscribe");
async function checkAndNotify(env) {
  const now = /* @__PURE__ */ new Date();
  console.log("[cron] checkAndNotify start, NZ time:", now.toLocaleString("en-NZ", { timeZone: "Pacific/Auckland" }));
  if (!isWithinNotifyWindow(now)) {
    console.log("[cron] outside notify window, skipping");
    return;
  }
  const list0 = await env.sunsmart_subscriptions.list({ limit: 1e3 });
  console.log("[cron] subscriptions in KV:", list0.keys.length);
  let cursor;
  do {
    const list = await env.sunsmart_subscriptions.list({ cursor, limit: 1e3 });
    cursor = list.cursor;
    await Promise.all(list.keys.map(async ({ name }) => {
      const raw = await env.sunsmart_subscriptions.get(name);
      if (!raw) return;
      const entry = JSON.parse(raw);
      const currentUV = await fetchCurrentUV(entry.location.lat, entry.location.long);
      console.log("[cron] location:", entry.location.label, "lastUV:", entry.lastUV, "currentUV:", currentUV);
      if (currentUV === null) return;
      if (shouldNotify(entry.lastUV, currentUV)) {
        console.log("[cron] sending push to", entry.location.label, "UV:", currentUV);
        const sent = await sendPush(entry.pushSubscription, entry.location.label, currentUV, env);
        console.log("[cron] sendPush result:", sent);
        if (sent === "gone") {
          await env.sunsmart_subscriptions.delete(name);
          return;
        }
        entry.lastNotifiedAt = (/* @__PURE__ */ new Date()).toISOString();
      }
      entry.lastUV = currentUV;
      await env.sunsmart_subscriptions.put(name, JSON.stringify(entry));
    }));
  } while (cursor);
}
__name(checkAndNotify, "checkAndNotify");
async function resetLastUV(env) {
  let cursor;
  do {
    const list = await env.sunsmart_subscriptions.list({ cursor, limit: 1e3 });
    cursor = list.cursor;
    await Promise.all(list.keys.map(async ({ name }) => {
      const raw = await env.sunsmart_subscriptions.get(name);
      if (!raw) return;
      const entry = JSON.parse(raw);
      entry.lastUV = 0;
      await env.sunsmart_subscriptions.put(name, JSON.stringify(entry));
    }));
  } while (cursor);
}
__name(resetLastUV, "resetLastUV");
function isWithinNotifyWindow(date) {
  const nzHour = parseInt(
    new Intl.DateTimeFormat("en-NZ", {
      timeZone: "Pacific/Auckland",
      hour: "numeric",
      hour12: false
    }).format(date),
    10
  );
  return nzHour >= 9 && nzHour < 16;
}
__name(isWithinNotifyWindow, "isWithinNotifyWindow");
function shouldNotify(lastUV, currentUV) {
  return lastUV < 3 && currentUV >= 3;
}
__name(shouldNotify, "shouldNotify");
async function fetchCurrentUV(lat, long) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${long}&hourly=uv_index&timezone=Pacific%2FAuckland&forecast_days=1`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const nzHour = parseInt(
      new Intl.DateTimeFormat("en-NZ", {
        timeZone: "Pacific/Auckland",
        hour: "numeric",
        hour12: false
      }).format(/* @__PURE__ */ new Date()),
      10
    );
    return Math.round(json.hourly.uv_index[nzHour] * 10) / 10;
  } catch {
    return null;
  }
}
__name(fetchCurrentUV, "fetchCurrentUV");
async function sendPush(subscription, locationLabel, uvValue, env) {
  const payload = JSON.stringify({
    title: `\u2600\uFE0F UV is now ${uvValue} at ${locationLabel}`,
    body: "SunSmart measures required \u2014 hats, sunscreen, shade."
  });
  try {
    const status = await webPushSend(subscription, payload, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
    if (status === 410 || status === 404) return "gone";
    if (status >= 200 && status < 300) return "ok";
    return "error";
  } catch {
    return "error";
  }
}
__name(sendPush, "sendPush");
async function endpointKey(endpoint) {
  const data = new TextEncoder().encode(endpoint);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(endpointKey, "endpointKey");
async function webPushSend(subscription, payload, vapidPublicKey, vapidPrivateKey) {
  const { endpoint, keys } = subscription;
  const uaPublicKey = b64Decode(keys.p256dh);
  const authSecret = b64Decode(keys.auth);
  const encrypted = await encryptPayload(new TextEncoder().encode(payload), uaPublicKey, authSecret);
  const authorization = await buildVapidHeader(endpoint, vapidPublicKey, vapidPrivateKey);
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      TTL: "86400"
    },
    body: encrypted
  });
  return res.status;
}
__name(webPushSend, "webPushSend");
async function encryptPayload(plaintext, uaPublicKeyBytes, authSecret) {
  const senderPair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const senderSpki = await crypto.subtle.exportKey("spki", senderPair.publicKey);
  const senderPublicKey = new Uint8Array(senderSpki).slice(-65);
  const uaKey = await crypto.subtle.importKey("raw", uaPublicKeyBytes, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdhBits = await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, senderPair.privateKey, 256);
  const ecdhSecret = new Uint8Array(ecdhBits);
  const prkCombine = await hkdfExtract(authSecret, ecdhSecret);
  const wpInfo = concatBytes(new TextEncoder().encode("WebPush: info\0"), uaPublicKeyBytes, senderPublicKey);
  const ikm = await hkdfExpand(prkCombine, wpInfo, 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hkdfExtract(salt, ikm);
  const cek = await hkdfExpand(prk, new TextEncoder().encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdfExpand(prk, new TextEncoder().encode("Content-Encoding: nonce\0"), 12);
  const padded = new Uint8Array(plaintext.length + 1);
  padded.set(plaintext);
  padded[plaintext.length] = 2;
  const cekKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, cekKey, padded));
  const header = new Uint8Array(86);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096, false);
  header[20] = 65;
  header.set(senderPublicKey, 21);
  return concatBytes(header, ciphertext);
}
__name(encryptPayload, "encryptPayload");
async function buildVapidHeader(endpoint, vapidPublicKey, vapidPrivateKey) {
  const audience = new URL(endpoint).origin;
  const exp = Math.floor(Date.now() / 1e3) + 43200;
  const headerB64 = b64Encode(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const payloadB64 = b64Encode(JSON.stringify({ aud: audience, exp, sub: "mailto:hayden.sewell@gmail.com" }));
  const signingInput = `${headerB64}.${payloadB64}`;
  const pubBytes = b64Decode(vapidPublicKey);
  const jwk = {
    kty: "EC",
    crv: "P-256",
    x: bytesToB64(pubBytes.slice(1, 33)),
    y: bytesToB64(pubBytes.slice(33, 65)),
    d: vapidPrivateKey
  };
  const signingKey = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, signingKey, new TextEncoder().encode(signingInput)));
  const jwt = `${signingInput}.${bytesToB64(sig)}`;
  return `vapid t=${jwt},k=${vapidPublicKey}`;
}
__name(buildVapidHeader, "buildVapidHeader");
async function hkdfExtract(salt, ikm) {
  const k = await crypto.subtle.importKey("raw", salt, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, ikm));
}
__name(hkdfExtract, "hkdfExtract");
async function hkdfExpand(prk, info, length) {
  const input = new Uint8Array(info.length + 1);
  input.set(info);
  input[info.length] = 1;
  const k = await crypto.subtle.importKey("raw", prk, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const t1 = new Uint8Array(await crypto.subtle.sign("HMAC", k, input));
  return t1.slice(0, length);
}
__name(hkdfExpand, "hkdfExpand");
function concatBytes(...arrays) {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}
__name(concatBytes, "concatBytes");
function b64Decode(str) {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/").padEnd(str.length + (4 - str.length % 4) % 4, "=");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
__name(b64Decode, "b64Decode");
function b64Encode(str) {
  return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
__name(b64Encode, "b64Encode");
function bytesToB64(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
__name(bytesToB64, "bytesToB64");

// ../../../../Users/spark/AppData/Roaming/npm/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../../Users/spark/AppData/Roaming/npm/node_modules/wrangler/templates/middleware/middleware-scheduled.ts
var scheduled = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  const url = new URL(request.url);
  if (url.pathname === "/__scheduled") {
    const cron = url.searchParams.get("cron") ?? "";
    await middlewareCtx.dispatch("scheduled", { cron });
    return new Response("Ran scheduled event");
  }
  const resp = await middlewareCtx.next(request, env);
  if (request.headers.get("referer")?.endsWith("/__scheduled") && url.pathname === "/favicon.ico" && resp.status === 500) {
    return new Response(null, { status: 404 });
  }
  return resp;
}, "scheduled");
var middleware_scheduled_default = scheduled;

// .wrangler/tmp/bundle-WgdCL5/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_scheduled_default
];
var middleware_insertion_facade_default = index_default;

// ../../../../Users/spark/AppData/Roaming/npm/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-WgdCL5/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
