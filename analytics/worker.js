/* analytics/worker.js — G-CAFL-QC Builder seal analytics (Cloudflare Worker + KV).
 *
 * Sitewide backend for the in-app GCAFLQCMetrics module (analytics.js), which
 * collects opt-in, content-free seal counts on-device and beacons here when
 * window.GCAFLQC_ANALYTICS_ENDPOINT is configured.
 *
 * Privacy contract (this is the whole point):
 *  - Stores ONLY: a random device id + first/last seal timestamps.
 *  - NEVER: brief content, IPs, user agents, or anything identifying.
 *  - Participation is OPT-IN, toggled in the app. Default: off.
 *
 * Endpoints:
 *  POST /ping   { v:1, event:"seal", deviceId, at, durationSeconds } -> { ok:true } | { ok:true, deduped:true }
 *  GET  /stats?key=ADMIN_KEY -> { ok:true, active_7d, new_7d, returning_7d, at }
 *
 * Setup: create a KV namespace, bind it as SEALS, set ADMIN_KEY secret.
 * See analytics/README.md for the 10-minute deploy.
 */

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST, GET, OPTIONS',
      'access-control-allow-headers': 'content-type',
    },
  });
}

function validId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(id);
}

async function handlePing(req, env) {
  var body;
  try { body = await req.json(); }
  catch (e) { return json({ ok: false, error: 'bad json' }, 400); }
  // Accept the GCAFLQCMetrics client shape { deviceId } and the generic { install_id }.
  var id = body.deviceId || body.install_id;
  if (!validId(id)) return json({ ok: false, error: 'bad id' }, 400);
  if (body.event !== 'seal') return json({ ok: false, error: 'bad event' }, 400);

  var key = 'seal:' + id;
  var now = Date.now();
  var existing = null;
  try { existing = await env.SEALS.get(key, 'json'); } catch (e) { /* treat as new */ }

  // 5-minute dedupe: beacon retries and double taps count once.
  if (existing && typeof existing.l === 'number' && now - existing.l < 5 * 60 * 1000) {
    return json({ ok: true, deduped: true });
  }
  var first = existing && typeof existing.f === 'number' ? existing.f : now;
  try {
    await env.SEALS.put(key, JSON.stringify({ f: first, l: now }), { expirationTtl: 45 * 24 * 3600 });
  } catch (e) { return json({ ok: false, error: 'store failed' }, 500); }
  return json({ ok: true });
}

async function handleStats(url, env) {
  if (!env.ADMIN_KEY || url.searchParams.get('key') !== env.ADMIN_KEY) {
    return json({ ok: false, error: 'forbidden' }, 403);
  }
  var WEEK = 7 * 24 * 3600 * 1000;
  var now = Date.now();
  var active = 0, fresh = 0, cursor = undefined;
  try {
    for (;;) {
      var page = await env.SEALS.list({ prefix: 'seal:', cursor: cursor });
      for (var i = 0; i < page.keys.length; i++) {
        var rec = await env.SEALS.get(page.keys[i].name, 'json');
        if (!rec || typeof rec.l !== 'number') continue;
        if (now - rec.l <= WEEK) {
          active++;
          if (typeof rec.f === 'number' && now - rec.f <= WEEK) fresh++;
        }
      }
      if (page.list_complete) break;
      cursor = page.cursor;
    }
  } catch (e) { return json({ ok: false, error: 'read failed' }, 500); }
  return json({
    ok: true,
    active_7d: active,        // weekly active sealers: the one metric
    new_7d: fresh,            // first seal within the window
    returning_7d: active - fresh,
    at: new Date(now).toISOString(),
  });
}

export default {
  async fetch(req, env) {
    var url = new URL(req.url);
    if (req.method === 'OPTIONS') return json({ ok: true });
    if (req.method === 'POST' && url.pathname === '/ping') return handlePing(req, env);
    if (req.method === 'GET' && url.pathname === '/stats') return handleStats(url, env);
    return json({ ok: false, error: 'not found' }, 404);
  },
};
