/* engine-handoff.js — G-CAFL-QC Builder handoff adapters.
 *
 * Transport only: moves rendered text to a destination. Never modifies the
 * canonical brief. No AI, no network calls by this module itself, no
 * dependencies. Browser (global `HandoffEngine`) and Node compatible
 * (pure helpers only under Node) via UMD — no build step.
 *
 * Transport doctrine:
 *   DEFAULT: copy complete prompt -> open destination -> user pastes.
 *   Prefill (Perplexity only) is explicit opt-in, length-bounded, and
 *   falls back to copy + base URL. Prompt text in URLs can leak into
 *   history/logs, so it is never the default.
 * iOS Safari: the clipboard write is STARTED, then the destination is
 * opened synchronously in the same task (transient user activation),
 * then the clipboard result is resolved. Never await clipboard first.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.HandoffEngine = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DESTINATIONS = [
    { id: 'copy',       label: 'Copy only',  url: null, supportsPrefill: false, maxSafeLength: 0 },
    { id: 'chatgpt',    label: 'ChatGPT',    url: 'https://chat.openai.com/', supportsPrefill: false, maxSafeLength: 0 },
    { id: 'claude',     label: 'Claude',     url: 'https://claude.ai/new', supportsPrefill: false, maxSafeLength: 0 },
    { id: 'perplexity', label: 'Perplexity', url: 'https://www.perplexity.ai/search', supportsPrefill: true, prefillParam: 'q', maxSafeLength: 6000 },
    { id: 'grok',       label: 'Grok',       url: 'https://grok.com/', supportsPrefill: false, maxSafeLength: 0 }
  ];

  function findDest(id) {
    for (var i = 0; i < DESTINATIONS.length; i++) {
      if (DESTINATIONS[i].id === id) return DESTINATIONS[i];
    }
    return null;
  }

  // Pure: decide the navigation URL. Prefill only when explicitly wanted,
  // supported by the destination, and within the encoded-length guard.
  function buildUrl(dest, text, wantPrefill) {
    if (wantPrefill && dest.supportsPrefill) {
      var cand = dest.url + '?' + dest.prefillParam + '=' + encodeURIComponent(text);
      if (cand.length <= dest.maxSafeLength) return { url: cand, prefilled: true };
    }
    return { url: dest.url, prefilled: false };
  }

  function fallbackCopy(t) {
    try {
      if (typeof document === 'undefined') return false;
      var ta = document.createElement('textarea');
      ta.value = t;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      return !!ok;
    } catch (e) { return false; }
  }

  // Resolves true/false; never rejects — failures are reported, not thrown.
  function copyText(t) {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard &&
          typeof navigator.clipboard.writeText === 'function') {
        return navigator.clipboard.writeText(t).then(
          function () { return true; },
          function () { return fallbackCopy(t); }
        );
      }
    } catch (e) { /* fall through to fallback */ }
    return Promise.resolve(fallbackCopy(t));
  }

  function openUrl(url) {
    try {
      if (typeof window === 'undefined' || typeof window.open !== 'function') return false;
      var w = window.open(url, '_blank', 'noopener');
      return !!w;
    } catch (e) { return false; }
  }

  // handoff(destId, text, { prefill }) -> Promise<result>.
  // result: { ok, destId, copied, opened, prefilled, message }.
  // ok reflects the navigation, not the clipboard; both are reported honestly.
  function handoff(destId, text, opts) {
    opts = opts || {};
    if (typeof window === 'undefined') {
      return Promise.resolve({
        ok: false, destId: destId, copied: false, opened: false, prefilled: false,
        message: 'Handoff requires a browser.'
      });
    }
    var d = findDest(destId);
    if (!d) {
      return Promise.resolve({
        ok: false, destId: destId, copied: false, opened: false, prefilled: false,
        message: 'Unknown destination.'
      });
    }

    // Start the clipboard write, then synchronously open the destination in
    // the same task so iOS Safari keeps transient user activation.
    var copying = copyText(text);

    if (destId === 'copy') {
      return copying.then(function (copied) {
        return {
          ok: copied, destId: destId, copied: copied, opened: false, prefilled: false,
          message: copied ? 'Copied.' : 'Copy failed — nothing was placed on the clipboard.'
        };
      });
    }

    var built = buildUrl(d, text, !!opts.prefill);
    var opened = openUrl(built.url);

    return copying.then(function (copied) {
      var message;
      if (!opened) {
        message = 'Could not open ' + d.label + ' (popup blocked).' +
          (copied ? ' Your prompt was copied — open it manually and paste.'
                   : ' Copy also failed — copy the prompt manually.');
      } else if (built.prefilled) {
        message = 'Opening ' + d.label + ' with your prompt pre-filled.' +
          (copied ? '' : ' (Clipboard copy failed — the pre-filled tab still works.)');
      } else {
        message = copied ? 'Prompt copied — paste it into ' + d.label + '.'
                         : 'Copy failed — opening ' + d.label + ' anyway; copy the prompt manually.';
      }
      return {
        ok: opened, destId: destId, copied: copied, opened: opened,
        prefilled: built.prefilled, message: message
      };
    });
  }

  return {
    DESTINATIONS: DESTINATIONS,
    buildUrl: buildUrl,
    copyText: copyText,
    handoff: handoff
  };
}));
