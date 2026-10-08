/* engine-sharpen.js — G-CAFL-QC Builder deterministic Sharpen + audit engine.
 *
 * No AI, no network, no dependencies. Works in the browser (global
 * `SharpenEngine`) and in Node (`require('./engine-sharpen.js')`) via the
 * UMD wrapper below — no build step.
 *
 * Compatibility: iOS Safari 15+. No regex lookbehind anywhere in this file.
 * Only lookahead, capture groups, and explicit scanning are used.
 *
 * Safety doctrine: SAFE MECHANICAL CHANGE -> Sharpen. MEANING-DEPENDENT
 * WEAKNESS -> QC (audit/suggest). Sharpen never invents facts, never
 * reverses polarity, never touches protected spans (quotes, URLs, inline
 * code, [[slots]]), and never auto-applies — the caller decides.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.SharpenEngine = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Masking: protect quotes, URLs, inline code, [[slots]]                */
  /* ------------------------------------------------------------------ */

  // Choose two private-use sentinel characters guaranteed absent from the
  // input, so user content can never collide with internal placeholders
  // (Defect G). The chosen pair travels with the masked payload.
  function pickSentinels(text) {
    var found = [];
    for (var code = 0xE000; code <= 0xE0FF && found.length < 2; code++) {
      var ch = String.fromCharCode(code);
      if (text.indexOf(ch) === -1) found.push(ch);
    }
    // Practically unreachable: input would need 255 distinct PUA chars.
    if (found.length < 2) { found = ['\uF8FF', '\uF8FE']; }
    return { s0: found[0], s1: found[1] };
  }

  function isWordChar(ch) {
    return ch >= 'a' && ch <= 'z' ||
           ch >= 'A' && ch <= 'Z' ||
           ch >= '0' && ch <= '9' || ch === '_';
  }

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Scan left to right; at each position try [[slot]], URL, `code`,
  // "double quotes", then 'single quotes' (with contraction guard: an
  // apostrophe between word characters, as in don't, never opens a quote).
  function maskSpans(text) {
    var pair = pickSentinels(text);
    var s0 = pair.s0, s1 = pair.s1;
    var vault = [];
    var out = '';
    var i = 0, n = text.length;

    while (i < n) {
      var ch = text[i];
      var span = null;

      // [[slot]]
      if (ch === '[' && text[i + 1] === '[') {
        var slotEnd = text.indexOf(']]', i + 2);
        if (slotEnd !== -1) span = text.slice(i, slotEnd + 2);
      }
      // URL
      else if (text.slice(i, i + 7) === 'http://' || text.slice(i, i + 8) === 'https://') {
        var j = i;
        while (j < n) {
          var c = text[j];
          if (c === ' ' || c === '\t' || c === '\n' || c === '\r' ||
              c === '<' || c === '>' || c === '"' || c === "'" || c === '`') break;
          j++;
        }
        var url = text.slice(i, j).replace(/[.,;:!?)\]]+$/, '');
        if (url.length > 10) span = url;
      }
      // `inline code`
      else if (ch === '`') {
        var codeEnd = text.indexOf('`', i + 1);
        if (codeEnd !== -1 && text.slice(i + 1, codeEnd).indexOf('\n') === -1) {
          span = text.slice(i, codeEnd + 1);
        }
      }
      // "double-quoted"
      else if (ch === '"') {
        var dqEnd = text.indexOf('"', i + 1);
        if (dqEnd !== -1 && text.slice(i + 1, dqEnd).indexOf('\n') === -1) {
          span = text.slice(i, dqEnd + 1);
        }
      }
      // 'single-quoted' — never when the apostrophe sits inside a word
      else if (ch === "'" && (i === 0 || !isWordChar(text[i - 1]))) {
        var k = text.indexOf("'", i + 1);
        while (k !== -1) {
          var after = text[k + 1];
          // A closing quote is not followed by a word char (protects don't).
          if (after === undefined || !isWordChar(after)) break;
          k = text.indexOf("'", k + 1);
        }
        if (k !== -1 && text.slice(i + 1, k).indexOf('\n') === -1) {
          span = text.slice(i, k + 1);
        }
      }

      if (span !== null) {
        vault.push(span);
        out += s0 + (vault.length - 1) + s1;
        i += span.length;
      } else {
        out += ch;
        i++;
      }
    }

    return { masked: out, vault: vault, s0: s0, s1: s1 };
  }

  function unmaskSpans(m) {
    var re = new RegExp(escapeRegExp(m.s0) + '(\\d+)' + escapeRegExp(m.s1), 'g');
    return m.masked.replace(re, function (match, idx) {
      var v = m.vault[Number(idx)];
      return v === undefined ? match : v;
    });
  }

  /* ------------------------------------------------------------------ */
  /* Legacy mechanical tightening (goal / context / fallback)             */
  /* ------------------------------------------------------------------ */

  // Stored as [source, flags, replacement]; fresh RegExp per call so no
  // shared global-regex lastIndex state can ever leak between calls.
  var TIGHTEN = [
    ['\\bin order to\\b', 'gi', 'to'],
    ['\\bdue to the fact that\\b', 'gi', 'because'],
    ['\\ba large number of\\b', 'gi', 'many'],
    ['\\ba small number of\\b', 'gi', 'few'],
    ['\\bit is important to note that\\b', 'gi', ''],
    ['\\bplease note that\\b', 'gi', ''],
    ['\\bas a matter of fact\\b', 'gi', ''],
    ['\\bat this point in time\\b', 'gi', 'now'],
    ['\\bin the event that\\b', 'gi', 'if'],
    ['\\bin spite of the fact that\\b', 'gi', 'although'],
    ['\\bfor the purpose of\\b', 'gi', 'to']
  ];

  function legacyTighten(t) {
    var s = String(t).replace(/\s+/g, ' ').trim();
    s = s.replace(/^(please\s+)?(i want you to|i need you to|i'd like you to|i would like you to|can you|could you|would you|will you)\s+/i, '');
    s = s.replace(/^i need\s+/i, 'Produce ');
    s = s.replace(/^i want\s+/i, 'Produce ');
    s = s.replace(/^help me\s+/i, '');
    for (var i = 0; i < TIGHTEN.length; i++) {
      s = s.replace(new RegExp(TIGHTEN[i][0], TIGHTEN[i][1]), TIGHTEN[i][2]);
    }
    s = s.replace(/\s+/g, ' ').replace(/\s+([.,;:!?])/g, '$1').trim();
    if (s) s = s.charAt(0).toUpperCase() + s.slice(1);
    return s;
  }

  /* ------------------------------------------------------------------ */
  /* Limits: clause splitting + directive normalization (Defects A–D, H)  */
  /* ------------------------------------------------------------------ */

  // Split only at boundaries followed by another directive trigger, so
  // "Do not use X and Y" is NOT split (Y is not a directive).
  // Lookahead only — no lookbehind (iOS Safari 15).
  var CLAUSE_SPLIT = /([.;]\s+|\s+and\s+)(?=(?:do not|don't|never)\b|only\s+return\b|return\s+only\b)/gi;

  function splitClauses(text) {
    var parts = String(text).split(CLAUSE_SPLIT);
    var out = [];
    for (var i = 0; i < parts.length; i += 2) {
      var p = (parts[i] || '').trim();
      if (p) out.push(p);
    }
    return out.length ? out : [String(text).trim()];
  }

  var PRESERVATION_VERBS = 'change|alter|modify|touch';

  // Clean a directive object: drop trailing punctuation, drop a leading
  // article ("the legal definitions" -> "legal definitions").
  function cleanObject(s) {
    return String(s).replace(/[.\s;!?,]+$/, '')
      .replace(/^(the|a|an)\s+/i, '').trim();
  }

  function normalizeLimitsClause(clause) {
    var c = clause.replace(/^please\s+/i, '').trim();
    if (!c) return c;

    // 1. Already canonical — never double-tag (idempotence).
    if (/^(Never|Keep|Return only|Success|Format|Sections|Audience|Register|Sources|Use only):/i.test(c)) {
      return c;
    }

    var m;
    // 2. Preservation BEFORE generic prohibition (Defect A).
    //    "Don't change the legal definitions" -> "Keep: legal definitions".
    //    "never modify the contract headers"  -> "Keep: contract headers".
    m = c.match(new RegExp('^(?:do not|don\'t|never)\\s+(' + PRESERVATION_VERBS + ')\\b\\s*(.*)$', 'i'));
    if (m) {
      var kept = cleanObject(m[2]);
      if (kept) return 'Keep: ' + kept;
      return c;
    }

    // 3. "I don't want filler" -> "Never: filler" (Defect B, first half).
    m = c.match(/^(?:i\s+)?(?:don't|do not)\s+want\s+(.+)$/i);
    if (m) {
      var obj = cleanObject(m[1]);
      if (obj) return 'Never: ' + obj;
      return c;
    }

    // 4. "only return the table" -> "Return only: table" (Defect D, line 2).
    m = c.match(/^(?:only\s+return|return\s+only)\s+(.+)$/i);
    if (m) {
      var ret = cleanObject(m[1]);
      if (ret) return 'Return only: ' + ret;
      return c;
    }

    // 5. Bare leading Never: "Never invent numbers" -> "Never: invent numbers".
    m = c.match(/^never\s+(.+)$/i);
    if (m) {
      var nv = cleanObject(m[1]);
      if (nv) return 'Never: ' + nv;
      return c;
    }

    // 6. Generic prohibition: "Do not fabricate" -> "Never: fabricate".
    m = c.match(/^(?:do not|don't|never)\s+(.+)$/i);
    if (m) {
      var g = cleanObject(m[1]);
      if (g) return 'Never: ' + g;
      return c;
    }

    // 7. Not a directive — leave meaning alone.
    return c;
  }

  function normalizeLimitsLine(line) {
    var clauses = splitClauses(line);
    return clauses.map(normalizeLimitsClause).join('\n');
  }

  /* ------------------------------------------------------------------ */
  /* Format / Audience extraction (Defects E, F)                           */
  /* ------------------------------------------------------------------ */

  function cleanTail(s) {
    return String(s).replace(/[\s.,;]+$/, '').trim();
  }

  function normalizeFormatLine(line) {
    var t = line.trim();
    // Preserve user-specified requirements; normalize only clear MLA/page syntax.
    var mla = t.match(/^(Return:\s*)MLA\s+FORMAT\s+(\d+(?:-\d+)?\s+pages?)\s*$/i);
    if (mla) return mla[1] + 'MLA format, ' + mla[2].toLowerCase();
    if (/^(Format|Sections):/i.test(t)) return t; // idempotent
    var m = t.match(/^output\s+as\s+(.+?)\s+with\s+sections\s+for\s+(.+)$/i);
    if (m) {
      var fmt = cleanTail(m[1]), secs = cleanTail(m[2]);
      if (fmt && secs) return 'Format: ' + fmt + '\nSections: ' + secs;
    }
    m = t.match(/^output\s+as\s+(.+)$/i);
    if (m) {
      var f2 = cleanTail(m[1]);
      if (f2) return 'Format: ' + f2;
    }
    m = t.match(/(?:with\s+)?sections\s+for\s+(.+)$/i);
    if (m) {
      var s2 = cleanTail(m[1]);
      if (s2) return 'Sections: ' + s2;
    }
    return legacyTighten(t);
  }

  function normalizeAudienceLine(line) {
    var t = line.trim();
    if (/^(Audience|Register):/i.test(t)) return t; // idempotent
    var m = t.match(/^(?:written\s+for|targeted\s+at|aimed\s+at|for)\s+(.+?)\s*,\s*(?:make\s+sure\s+)?(?:the\s+)?tone\s+is\s+([A-Za-z-]+)\s*[.,;]?\s*$/i);
    if (m) {
      var aud = cleanTail(m[1]), reg = cleanTail(m[2]);
      if (aud && reg) return 'Audience: ' + aud + '\nRegister: ' + reg;
    }
    return legacyTighten(t);
  }

  /* ------------------------------------------------------------------ */
  /* Public transform                                                    */
  /* ------------------------------------------------------------------ */

  // Narrow goal repairs: clean malformed request scaffolding without
  // inventing a topic, thesis, or academic requirements.
  function normalizeGoalLine(line) {
    var m = line.match(/^(Success:\s*)(.*)$/i);
    var label = m ? m[1] : '';
    var text = legacyTighten(m ? m[2] : line);
    // "I want to do an assignment" previously became "Produce to do...".
    text = text.replace(/^Produce to do (?=(?:an?|the)\s+assignment\b)/i, 'Complete ');
    return label + text;
  }

  function normalizeContextLine(line) {
    var t = legacyTighten(line);
    // Historical event capitalization; never insert a source or evidence.
    return t.replace(/\bcivil war\b/gi, 'Civil War');
  }

  function transformLine(line, dimension) {
    var t = line.trim();
    if (!t) return '';
    if (dimension === 'limits') return normalizeLimitsLine(t);
    if (dimension === 'format') return normalizeFormatLine(t);
    if (dimension === 'audience') return normalizeAudienceLine(t);
    if (dimension === 'goal') return normalizeGoalLine(t);
    if (dimension === 'context') return normalizeContextLine(t);
    return legacyTighten(t); // unknown dimension
  }

  // Pure: { text, edits }. edits counts lines whose masked form changed;
  // no rule can match an empty string, so phantom edits are impossible.
  function transform(rawText, dimension) {
    var text = rawText === null || rawText === undefined ? '' : String(rawText);
    var m = maskSpans(text);
    var lines = m.masked.split('\n');
    var edits = 0;
    var out = lines.map(function (line) {
      var r = transformLine(line, dimension);
      if (r !== line) edits++;
      return r;
    });
    var finalText = unmaskSpans({ masked: out.join('\n'), vault: m.vault, s0: m.s0, s1: m.s1 });
    return { text: finalText, edits: edits };
  }

  /* ------------------------------------------------------------------ */
  /* Undo (one level)                                                    */
  /* ------------------------------------------------------------------ */

  var undoStack = {};

  // Runs transform and remembers the pre-change text for one-level undo.
  function sharpen(fieldId, rawText, dimension) {
    var before = rawText === null || rawText === undefined ? '' : String(rawText);
    var r = transform(before, dimension);
    if (r.text !== before) undoStack[fieldId] = before;
    return r;
  }

  function undo(fieldId) {
    if (undoStack[fieldId] === undefined) return null;
    var prev = undoStack[fieldId];
    delete undoStack[fieldId];
    return prev;
  }

  function clearUndo(fieldId) {
    delete undoStack[fieldId];
  }

  /* ------------------------------------------------------------------ */
  /* Audit: vague-language detection (advisory; never rewrites)          */
  /* ------------------------------------------------------------------ */

  var VAGUE_BY_DIM = {
    goal: ['high quality', 'professional-grade', 'engaging', 'compelling', 'impactful', 'very', 'really', 'extremely', 'good', 'great', 'nice'],
    context: ['some articles', 'stuff online', 'general information', 'the internet', 'things', 'stuff', 'etc.'],
    audience: ['anyone', 'everyone', 'general public', 'all readers'],
    format: ['standard format', 'normal format', 'clean layout', 'usual way'],
    limits: ['try not to', 'be careful', 'avoid if possible', 'if possible', 'ideally']
  };

  // Legitimate idioms that must NOT be flagged for containing a vague word.
  var IDIOM_EXCEPTIONS = [
    'in good standing', 'good faith', 'common good', 'best practices', 'for good'
  ];

  function audit(text, dimension) {
    var terms = VAGUE_BY_DIM[dimension] || [];
    var t = ' ' + String(text || '').toLowerCase() + ' ';
    IDIOM_EXCEPTIONS.forEach(function (idiom) {
      t = t.split(idiom).join(' ');
    });
    var findings = [];
    terms.forEach(function (term) {
      var pat = escapeRegExp(term).replace(/ /g, '\\s+');
      // Lookahead (not lookbehind) for the trailing boundary: safe on iOS 15.
      if (new RegExp('[^a-z]' + pat + '(?![a-z])').test(t)) {
        findings.push({
          dimension: dimension,
          term: term,
          message: 'Vague language ("\u201c' + term + '\u201d") — sharpen for precision.'
        });
      }
    });
    return findings;
  }

  // Single weakest-link nudge for a dimension, or null when clean.
  function suggest(text, dimension) {
    var f = audit(text, dimension);
    return f.length ? f[0].message : null;
  }

  /* ------------------------------------------------------------------ */

  return {
    transform: transform,
    sharpen: sharpen,
    undo: undo,
    clearUndo: clearUndo,
    audit: audit,
    suggest: suggest,
    // Internals exposed for regression testing only.
    _internals: {
      maskSpans: maskSpans,
      unmaskSpans: unmaskSpans,
      pickSentinels: pickSentinels,
      splitClauses: splitClauses,
      normalizeLimitsClause: normalizeLimitsClause
    }
  };
}));
