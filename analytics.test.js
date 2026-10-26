/* analytics.test.js — consent and privacy regressions for G-CAFL-QC.
 * Run: node analytics.test.js. No network, browser, or third-party dependencies.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, 'analytics.js'), 'utf8');

function harness(endpoint) {
  const data = new Map();
  const calls = [];
  const warnings = [];
  const root = {
    localStorage: {
      getItem(key) { return data.has(key) ? data.get(key) : null; },
      setItem(key, value) { data.set(key, String(value)); },
      removeItem(key) { data.delete(key); }
    },
    crypto: { getRandomValues(bytes) { for (let i = 0; i < bytes.length; i++) bytes[i] = i + 1; return bytes; } },
    console: { warn(...args) { warnings.push(args); } },
    fetch(url, options) {
      calls.push({ url, options });
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) });
    }
  };
  if (endpoint !== undefined) root.GCAFLQC_ANALYTICS_ENDPOINT = endpoint;
  const module = { exports: {} };
  vm.runInNewContext(source, { window: root, module, Uint8Array, Date, Number, JSON, Array, String, Math, RegExp, Object, Promise });
  return { metrics: module.exports, root, data, calls, warnings };
}

async function main() {
  let h = harness('https://metrics.example.test');
  assert.equal(h.metrics.isEnabled(), false, 'analytics starts disabled');
  assert.equal(h.metrics.recordSeal(5000), false, 'seal is not recorded before consent');
  assert.equal(h.calls.length, 0, 'no request before consent');
  assert.equal(h.data.size, 0, 'no analytics storage before consent');

  assert.equal(h.metrics.setEnabled(true), true, 'explicit consent enables local counting');
  assert.equal(h.metrics.isEnabled(), true, 'consent state persists');
  assert.equal(h.metrics.recordSeal(5200), true, 'opted-in seal is recorded');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(h.calls.length, 1, 'one opted-in seal sends one aggregate event');
  assert.equal(h.calls[0].url, 'https://metrics.example.test/ping', 'base endpoint normalizes to /ping');
  assert.equal(h.calls[0].options.method, 'POST', 'event uses POST');
  assert.equal(h.calls[0].options.credentials, 'omit', 'cross-origin credentials are omitted');
  const payload = JSON.parse(h.calls[0].options.body);
  assert.deepEqual(Object.keys(payload).sort(), ['at', 'deviceId', 'durationSeconds', 'event', 'v'].sort(), 'payload schema is allow-listed');
  assert.equal(payload.event, 'seal', 'only seal event is transmitted');
  assert.equal(payload.durationSeconds, 5, 'duration is rounded to seconds');
  assert.equal(JSON.stringify(payload).includes('private brief text'), false, 'brief text is absent from telemetry');
  assert.equal(h.metrics.deliveryStatus().state, 'delivered', 'successful endpoint response is reported');

  const beforeOptOutCalls = h.calls.length;
  assert.equal(h.metrics.setEnabled(false), false, 'opt-out returns disabled state');
  assert.equal(h.metrics.isEnabled(), false, 'opt-out revokes consent');
  assert.equal(h.data.size, 0, 'opt-out clears the local analytics record');
  assert.equal(h.metrics.recordSeal(9000), false, 'future seals are not counted after opt-out');
  assert.equal(h.calls.length, beforeOptOutCalls, 'future seals send no requests after opt-out');

  h = harness('http://insecure.example.test');
  assert.equal(h.metrics.setEnabled(true), true, 'local opt-in works without remote reporting');
  assert.equal(h.metrics.recordSeal(1000), true, 'local counting works with non-HTTPS endpoint configured');
  assert.equal(h.calls.length, 0, 'non-HTTPS endpoint is never contacted');
  assert.equal(h.metrics.snapshot().weekSeals, 1, 'local-only count remains available');

  h = harness();
  assert.equal(h.metrics.setEnabled(true), true, 'local-only opt-in succeeds when no endpoint exists');
  assert.equal(h.metrics.recordSeal(-1), true, 'invalid duration does not block local seal counting');
  assert.equal(h.calls.length, 0, 'no configured endpoint means no network request');
  assert.equal(h.metrics.snapshot().firstSealSeconds, null, 'invalid duration is stored as unknown, not a fabricated value');

  h = harness('https://metrics.example.test');
  h.root.crypto = null;
  assert.equal(h.metrics.setEnabled(true), false, 'consent is not stored when secure randomness is unavailable');
  assert.equal(h.metrics.isEnabled(), false, 'analytics stays disabled without a secure device ID');
  assert.equal(h.metrics.recordSeal(1000), false, 'no telemetry without a valid opt-in record');
  assert.equal(h.calls.length, 0, 'no request without a valid consent record');

  console.log('analytics.test.js: 33 privacy/consent assertions passed.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
