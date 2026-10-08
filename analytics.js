/* analytics.js — opt-in, content-free seal measurement for G-CAFL-QC.
 * Stores only local usage timestamps and completion duration; never brief text.
 * Remote aggregate reporting is DISABLED until a trusted HTTPS endpoint is
 * explicitly configured in window.GCAFLQC_ANALYTICS_ENDPOINT.
 * No cookies, external dependencies, or network calls before opt-in.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(root);
  else root.GCAFLQCMetrics = factory(root);
}(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (root) {
  'use strict';
  var KEY = 'gcaflqc.analytics.v1';
  function storage() { try { return root.localStorage || null; } catch (e) { return null; } }
  function read() {
    try {
      var raw = storage() && storage().getItem(KEY);
      var obj = raw && JSON.parse(raw);
      return obj && obj.version === 1 ? obj : null;
    } catch (e) { return null; }
  }
  function save(data) {
    try { if (storage()) storage().setItem(KEY, JSON.stringify(data)); return true; }
    catch (e) { return false; }
  }
  function newDeviceId() {
    var bytes = new Uint8Array(16);
    if (root.crypto && typeof root.crypto.getRandomValues === 'function') root.crypto.getRandomValues(bytes);
    else return null; // Cannot promise a private random identifier without secure randomness.
    return Array.prototype.map.call(bytes, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
  }
  function isEnabled() { var d = read(); return !!(d && d.consent === true); }
  function setEnabled(yes) {
    if (!yes) {
      try { if (storage()) storage().removeItem(KEY); } catch (e) {}
      return false;
    }
    var existing = read();
    if (existing && existing.consent) return true;
    var id = newDeviceId();
    if (!id) return false;
    return save({version:1, consent:true, deviceId:id, events:[], enabledAt:new Date().toISOString()});
  }
  function recordSeal(elapsedMs) {
    var d = read();
    if (!d || !d.consent) return false;
    var duration = Number.isFinite(elapsedMs) && elapsedMs >= 0 ? Math.min(Math.round(elapsedMs / 1000), 86400 * 30) : null;
    var now = new Date().toISOString();
    var ev = {at:now, durationSeconds:duration};
    d.events = Array.isArray(d.events) ? d.events : [];
    d.events.push(ev);
    // Retain at most 90 days and 1000 events, on this browser only.
    var cutoff = Date.now() - 90 * 86400000;
    d.events = d.events.filter(function (x) { return x && Date.parse(x.at) >= cutoff; }).slice(-1000);
    if (!save(d)) return false;
    var endpoint = typeof root.GCAFLQC_ANALYTICS_ENDPOINT === 'string' ? root.GCAFLQC_ANALYTICS_ENDPOINT.trim() : '';
    if (/^https:\/\//i.test(endpoint)) {
      var payload = JSON.stringify({v:1, event:'seal', deviceId:d.deviceId, at:now, durationSeconds:duration});
      try {
        if (root.navigator && typeof root.navigator.sendBeacon === 'function') {
          root.navigator.sendBeacon(endpoint, new Blob([payload], {type:'application/json'}));
        } else if (typeof root.fetch === 'function') {
          root.fetch(endpoint, {method:'POST', headers:{'Content-Type':'application/json'}, body:payload, keepalive:true}).catch(function () {});
        }
      } catch (e) {} // Measurement must never interrupt sealing.
    }
    return true;
  }
  function snapshot() {
    var d = read();
    if (!d || !d.consent) return {enabled:false, weekSeals:0, returningDevice:false, firstSealSeconds:null};
    var events = Array.isArray(d.events) ? d.events : [];
    var weekAgo = Date.now() - 7 * 86400000;
    var current = events.filter(function (x) { return Date.parse(x.at) >= weekAgo; });
    return {
      enabled:true,
      weekSeals:current.length,
      returningDevice:current.length > 0 && events.some(function (x) { return Date.parse(x.at) < weekAgo; }),
      firstSealSeconds:events.length ? events[0].durationSeconds : null
    };
  }
  return {isEnabled:isEnabled, setEnabled:setEnabled, recordSeal:recordSeal, snapshot:snapshot};
}));
