# Seal Analytics — deploy guide

One tiny Cloudflare Worker + KV namespace. Free tier is plenty (100k requests/day).
It exists for exactly one number: **weekly active sealers** (distinct install IDs
with a seal in the last 7 days, split new vs. returning).

## Privacy contract

- Stores **only**: a random install ID + first/last seal timestamps.
- **Never**: brief content, IPs, user agents, or anything identifying.
- Participation is **opt-in** in the app drawer. Default: off.
- Records auto-expire after 45 days.

## Deploy (about 10 minutes)

1. **Cloudflare account** → Workers & Pages → Create Worker → name it
   e.g. `gcaflqc-analytics`. Delete the default code; paste in
   `analytics/worker.js`. Deploy.
2. **KV namespace**: Workers & Pages → KV → Create namespace, e.g. `gcaflqc-seals`.
   Back in the Worker → Settings → Bindings → Add binding → KV namespace,
   variable name `SEALS`, namespace `gcaflqc-seals`.
3. **Admin secret**: Worker → Settings → Variables → Add variable →
   name `ADMIN_KEY`, value = a long random string (keep it private).
4. **Wire the app**: in `index.html`, set
   `window.GCAFLQC_ANALYTICS_ENDPOINT = 'https://gcaflqc-analytics.<you>.workers.dev';`
   (no trailing slash). The in-app `GCAFLQCMetrics` module (`analytics.js`)
   beacons here on each opted-in seal. Commit + push. Until the URL is set,
   only local on-device counts work.
5. **Verify**: seal a brief with the toggle on, then open
   `https://gcaflqc-analytics.<you>.workers.dev/stats?key=YOUR_ADMIN_KEY`
   → `{ ok:true, active_7d, new_7d, returning_7d }`.

## Reading the metric

- `active_7d` = weekly active sealers (the one metric).
- `new_7d` = first seal inside the window. `returning_7d` = the rest.
- Opt-in rates typically run 10–30%, so treat the count as **directional**,
  not a census. Watch the trend, not the absolute.

## Notes / limits

- 5-minute dedupe: beacon retries and double taps count once.
- `GET /stats` requires the admin key; aggregates only, no per-device data exposed.
- At very large scale, the stats scan is O(devices) — fine for thousands of
  sealers; revisit if you ever outgrow it (good problem).
- Cloudflare's own edge telemetry is outside this code's control; the Worker
  itself persists nothing but install ID + timestamps.
- Until `GCAFLQC_ANALYTICS_ENDPOINT` is set, the app toggle only drives
  local on-device counts and nothing leaves the browser.
