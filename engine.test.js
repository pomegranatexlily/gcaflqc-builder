/* engine.test.js — G-CAFL-QC Builder regression suite.
 *
 * Run: node engine.test.js
 * No dependencies. Exits 0 when all tests pass, 1 otherwise.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const sharpen = require('./engine-sharpen.js');
const handoff = require('./engine-handoff.js');
const quality = require('./engine-quality.js');

let pass = 0, fail = 0;
const failures = [];

function eq(actual, expected, name) {
  if (actual === expected) { pass++; }
  else {
    fail++;
    failures.push(name + '\n  expected: ' + JSON.stringify(expected) +
                          '\n  actual:   ' + JSON.stringify(actual));
  }
}
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; failures.push(name + '\n  condition was false'); }
}
function t(text, dim) { return sharpen.transform(text, dim).text; }

/* ---------------- Defect A: preservation verb precedence ---------------- */
eq(t("Don't change the legal definitions", 'limits'), 'Keep: legal definitions', 'A1 change');
eq(t('do not alter the citation format', 'limits'), 'Keep: citation format', 'A2 alter');
eq(t('never modify the contract headers', 'limits'), 'Keep: contract headers', 'A3 modify');
eq(t("don't touch the approved language", 'limits'), 'Keep: approved language', 'A4 touch');

/* ---------------- Defect B: mixed directives ---------------- */
eq(t("I don't want filler and don't change the terms", 'limits'),
   'Never: filler\nKeep: terms', 'B mixed directives');

/* ---------------- Defect C: independent sentence-level prohibitions ---------------- */
eq(t('Do not fabricate. Do not invent numbers.', 'limits'),
   'Never: fabricate\nNever: invent numbers', 'C1 two generic prohibitions');
eq(t('Do not fabricate. Do not alter dates.', 'limits'),
   'Never: fabricate\nKeep: dates', 'C2 fabricate + alter dates');

/* ---------------- Defect D: leading bare Never ---------------- */
eq(t('Never invent numbers; only return the table', 'limits'),
   'Never: invent numbers\nReturn only: table', 'D bare Never + Return only');

/* ---------------- Defect E: Format / Sections extraction ---------------- */
eq(t('output as a one-page memo with sections for risks', 'format'),
   'Format: a one-page memo\nSections: risks', 'E format + sections');

/* ---------------- Defect F: Audience / Register punctuation ---------------- */
eq(t('written for CFOs, make sure the tone is formal', 'audience'),
   'Audience: CFOs\nRegister: formal', 'F1 written for');
eq(t('targeted at senior staff, make sure the tone is formal,', 'audience'),
   'Audience: senior staff\nRegister: formal', 'F2 targeted at');

/* ---------------- Defect G: mask sentinel collision ---------------- */
(function () {
  const E0 = '', E1 = '';
  // Literal private-use chars in user text survive byte-identical.
  eq(t('Cost is ' + E0 + '5 and ' + E1 + 'x done.', 'limits'),
     'Cost is ' + E0 + '5 and ' + E1 + 'x done.', 'G1 literal sentinels survive');
  // Adjacent digits/words survive.
  eq(t(E0 + '123 ' + E1 + 'word', 'limits'), E0 + '123 ' + E1 + 'word', 'G2 adjacent digits/words');
  // Mask/unmask round-trip with protected content restores exactly.
  const src = 'see ' + E0 + " 'quoted' https://example.com/a [[slot]] `code` " + E1;
  const m = sharpen._internals.maskSpans(src);
  ok(m.s0 !== E0 && m.s0 !== E1 && m.s1 !== E0 && m.s1 !== E1, 'G3 sentinels avoid user content');
  eq(sharpen._internals.unmaskSpans(m), src, 'G4 round-trip restores nested content');
  // No user content is mistaken for an internal placeholder.
  ok(m.masked.indexOf(E0) !== -1 && m.masked.indexOf(E1) !== -1, 'G5 literal sentinels pass through masking');
})();

/* ---------------- Defect H: contraction + quoted phrase ---------------- */
eq(t("don't use 'very best' and don't change the terms", 'limits'),
   "Never: use 'very best'\nKeep: terms", 'H contraction + quote');

/* ---------------- Idempotence & double-tag protection ---------------- */
(function () {
  const cases = [
    ['Never: invent numbers', 'limits'],
    ['Never: invent numbers\nKeep: terms', 'limits'],
    ['Format: a one-page memo\nSections: risks', 'format'],
    ['Audience: CFOs\nRegister: formal', 'audience'],
    ["Never: use 'very best'\nKeep: terms", 'limits']
  ];
  cases.forEach(function ([text, dim], i) {
    const r1 = sharpen.transform(text, dim);
    const r2 = sharpen.transform(r1.text, dim);
    eq(r1.text, text, 'I' + (i + 1) + 'a already-clean unchanged');
    eq(r2.text, text, 'I' + (i + 1) + 'b second pass stable');
    eq(r2.edits, 0, 'I' + (i + 1) + 'c second pass zero edits');
  });
  ok(!/Never:\s*Never:/.test(t('Never invent numbers', 'limits')), 'no Never: Never: double-tag');
  ok(!/Keep:\s*Keep:/.test(t("don't change the terms", 'limits')), 'no Keep: Keep: double-tag');
})();

/* ---------------- Protected content ---------------- */
eq(t('see https://example.com/a?b=1 for details', 'limits'),
   'see https://example.com/a?b=1 for details', 'P1 URL byte-identical');
(function () {
  const r = t('draft for [[company]] leaders', 'audience');
  ok(r.indexOf('[[company]]') !== -1, 'P2 [[slot]] survives');
})();
(function () {
  const r = t('say "hello world" clearly', 'goal');
  ok(r.indexOf('"hello world"') !== -1, 'P3 double quotes survive');
})();
(function () {
  const r = t('run `npm test` first', 'goal');
  ok(r.indexOf('`npm test`') !== -1, 'P4 inline code survives');
})();
// Affirmative preservation verb is NOT converted (would reverse meaning).
eq(t('alter the schedule', 'limits'), 'alter the schedule', 'P5 affirmative alter untouched');
// "and" without a following directive is not a clause boundary.
eq(t('Do not use filler and fluff', 'limits'), 'Never: use filler and fluff', 'P6 and-without-directive');

/* ---------------- Legacy tightening (goal/context) ---------------- */
ok(t('I need a summary of the findings', 'goal').indexOf('Produce') === 0, 'L1 I need -> Produce');
ok(t('I want you to draft the memo', 'goal').toLowerCase().indexOf('draft the memo') !== -1, 'L2 request phrase stripped');
ok(t('do this in order to win', 'goal').indexOf('to win') !== -1, 'L3 in order to -> to');

/* ---------------- Undo ---------------- */
(function () {
  const r = sharpen.sharpen('f1', 'Do not fabricate.', 'limits');
  eq(r.text, 'Never: fabricate', 'U1 sharpen applies');
  eq(sharpen.undo('f1'), 'Do not fabricate.', 'U2 undo restores');
  eq(sharpen.undo('f1'), null, 'U3 undo is one-level');
  sharpen.sharpen('f2', 'Do not fabricate.', 'limits');
  sharpen.clearUndo('f2');
  eq(sharpen.undo('f2'), null, 'U4 clearUndo');
  const r2 = sharpen.sharpen('f3', 'Never: fabricate', 'limits');
  eq(r2.text, 'Never: fabricate', 'U5 no-change sharpen');
  eq(sharpen.undo('f3'), null, 'U6 no-change pushes no undo');
})();

/* ---------------- Audit (advisory; never rewrites) ---------------- */
(function () {
  const f = sharpen.audit('make it very good', 'goal');
  ok(f.length >= 2, 'A-audit1 vague words found');
  eq(sharpen.audit('follow best practices daily', 'goal').length, 0, 'A-audit2 idiom exception');
  eq(sharpen.audit('act in good faith', 'goal').length, 0, 'A-audit3 good faith exception');
  ok(sharpen.suggest('make it very good', 'goal') !== null, 'A-audit4 suggest returns nudge');
  eq(sharpen.suggest('Produce a one-page memo.', 'goal'), null, 'A-audit5 suggest null when clean');
})();

/* ---------------- Determinism & edit counts ---------------- */
(function () {
  const x = "I don't want filler and don't change the terms";
  const a = t(x, 'limits'), b = t(x, 'limits'), c = t(x, 'limits');
  ok(a === b && b === c, 'DET same input, same output');
  eq(sharpen.transform('', 'limits').text, '', 'EC1 empty');
  eq(sharpen.transform('', 'limits').edits, 0, 'EC2 empty zero edits');
  eq(sharpen.transform('Never: fabricate', 'limits').edits, 0, 'EC3 clean zero edits');
  ok(sharpen.transform('Do not fabricate.', 'limits').edits > 0, 'EC4 changed counts edits');
  eq(t("don't", 'limits'), "don't", 'EC5 degenerate input safe');
  eq(t('Do not fabricate.\nDo not invent numbers.', 'limits'),
     'Never: fabricate\nNever: invent numbers', 'EC6 multiline');
})();

/* ---------------- iOS Safari: no regex lookbehind ---------------- */
(function () {
  ['engine-sharpen.js', 'engine-handoff.js'].forEach(function (f) {
    const src = fs.readFileSync(path.join(__dirname, f), 'utf8');
    ok(!/\(\?\<[=!]/.test(src), 'NOLB no lookbehind in ' + f);
  });
})();

/* ---------------- Handoff engine ---------------- */
(function () {
  const D = handoff.DESTINATIONS;
  ok(D.length >= 5, 'H1 destinations present');
  D.forEach(function (d) {
    ok(d.id && d.label, 'H2 destination has id+label: ' + d.id);
  });
  const px = D.filter(function (d) { return d.id === 'perplexity'; })[0];
  ok(px.supportsPrefill === true && px.maxSafeLength === 6000, 'H3 perplexity prefill config');
  const short = handoff.buildUrl(px, 'hello world', true);
  ok(short.prefilled && short.url.indexOf('?q=hello%20world') !== -1, 'H4 prefill within length');
  const long = handoff.buildUrl(px, new Array(7000).join('x'), true);
  ok(!long.prefilled && long.url === px.url, 'H5 over-length falls back to base URL');
  const off = handoff.buildUrl(px, 'hello', false);
  ok(!off.prefilled && off.url === px.url, 'H6 prefill opt-in default off');
  const cg = D.filter(function (d) { return d.id === 'chatgpt'; })[0];
  ok(handoff.buildUrl(cg, 'hello', true).prefilled === false, 'H7 no prefill where unsupported');
})();


/* ---------------- Real-user assignment: Lincoln brief quality ---------------- */
(function () {
  const rawGoal = 'Success: Produce to do an assignment about Abe Lincoln';
  eq(t(rawGoal, 'goal'), 'Success: Complete an assignment about Abe Lincoln',
     'LIN1 malformed goal repaired');
  eq(t('I want to do an assignment about Abe Lincoln', 'goal'),
     'Complete an assignment about Abe Lincoln', 'LIN2 natural goal repaired');
  eq(t('Sources: Civil war evidence', 'context'),
     'Sources: Civil War evidence', 'LIN3 proper noun capitalization');
  eq(t('Return: MLA FORMAT 5 pages', 'format'),
     'Return: MLA format, 5 pages', 'LIN4 exact formatting normalization');

  ['goal', 'context', 'format'].forEach((dim, i) => {
    const inputs = [rawGoal, 'Sources: Civil war evidence', 'Return: MLA FORMAT 5 pages'];
    const once = t(inputs[i], dim);
    eq(t(once, dim), once, 'LIN5 idempotent ' + dim);
  });

  const original = {
    goal: 'Success: Complete an assignment about Abe Lincoln',
    context: 'Sources: Civil War evidence',
    audience: 'My teacher',
    format: 'Return: MLA format, 5 pages',
    limits: 'Never: get off topic of the thesis\nKeep: In touch with my thesis'
  };
  const before = JSON.stringify(original);
  const findings = quality.review(original);
  ok(findings.some(f => f.rule === 'thesis-unspecified' && f.severity === 'blocking'),
    'LIN6 unspecified thesis is blocking');
  ok(findings.some(f => f.rule === 'sources-unspecified'),
    'LIN7 generic evidence prompts source nudge');
  ok(findings.some(f => f.rule === 'limits-redundant'),
    'LIN8 overlapping thesis boundaries caught');
  eq(JSON.stringify(original), before, 'LIN9 QC never modifies input');
  const rendered = quality.renderCompact(original);
  ok(rendered.indexOf('[GOAL]\n') === 0 && rendered.includes('\n\n[CONTEXT]\n') &&
    rendered.includes('\n\n[QC]\n'), 'LIN10 compact output separated by dimension');
  ok(rendered.includes('Civil War evidence') && !rendered.includes('Library of Congress'),
    'LIN11 renderer does not invent sources');
  const resolved = Object.assign({}, original, {
    context: 'Sources: Library of Congress records\nThesis: Lincoln changed policy during the Civil War.'
  });
  ok(!quality.review(resolved).some(f => f.rule === 'thesis-unspecified' || f.rule === 'sources-unspecified'),
    'LIN12 actual thesis and named source clear both warnings');
  eq(quality.review({goal:'Success: Summarize a memo',context:'Sources: Customer interview notes',
    audience:'Team',format:'Return: one-page memo',limits:'Never: invent facts'}).length,
    0, 'LIN13 unrelated complete brief no false warnings');

  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  ok(html.includes('src="engine-quality.js"') &&
    html.includes('BriefQualityEngine.review(brief)') &&
    html.includes('BriefQualityEngine.renderCompact(b)'),
    'LIN14 browser loads, audits and renders with quality module');
  ok(!/\(\?<[=!]/.test(fs.readFileSync(path.join(__dirname,'engine-quality.js'),'utf8')),
    'LIN15 module has no Safari-incompatible lookbehind');
  ok(html.includes("addEventListener('pagehide', persistNow)") &&
    html.includes("visibilityState === 'hidden') persistNow()"),
    'LIN16 iOS exit flushes local brief storage');
})();

/* ---------------- QC: cap duplication, number consistency, money completeness ---------------- */
(function () {
  const q = (b) => quality.review(b).map(f => f.rule);

  // limits-cap-duplicated: same $ cap in Keep and Never
  ok(q({goal:'Success: Plan a fair', context:'Sources: school gym', audience:'Principal',
    format:'Return: plan', limits:'Keep: keep the total budget under $1500\nNever: never exceed the budget cap of $1,500'})
    .includes('limits-cap-duplicated'), 'QCAP1 duplicated cap flagged');
  ok(!q({goal:'Success: Plan a fair', context:'Sources: school gym', audience:'Principal',
    format:'Return: plan', limits:'Keep: original voice\nNever: fabricate sources'})
    .includes('limits-cap-duplicated'), 'QCAP2 distinct limits not flagged');

  // numbers-inconsistent: itemized total above the stated cap
  ok(q({goal:'Success: Plan a fair', context:'Sources: school gym', audience:'Principal',
    format:'Return: itemized plan totaling $1,700', limits:'Never: exceed $1500'})
    .includes('numbers-inconsistent'), 'QNUM1 over-cap total flagged');
  // consistent: cap restatement in goal excluded, total under cap
  ok(!q({goal:'Success: Plan a fair with a $1,500 budget', context:'Sources: school gym', audience:'Principal',
    format:'Return: itemized plan totaling $1,400', limits:'Keep: keep total under $1500'})
    .includes('numbers-inconsistent'), 'QNUM2 consistent budget not flagged');
  // no cap detected: no finding, no crash
  ok(!q({goal:'Success: Write an essay', context:'Sources: class notes', audience:'Teacher',
    format:'Return: 5 pages', limits:'Keep: original voice\nNever: fabricate'})
    .includes('numbers-inconsistent'), 'QNUM3 no cap means no finding');
  // "up to 100 students" must never be read as a $ cap
  ok(!q({goal:'Success: Plan a fair', context:'Sources: school gym', audience:'Up to 100 students',
    format:'Return: plan costing $1,200', limits:'Keep: original voice\nNever: fabricate'})
    .includes('numbers-inconsistent'), 'QNUM4 non-money up-to not treated as cap');

  // limits-money-no-figure: money talk without a figure is not a constraint
  ok(q({goal:'Success: Plan a fair', context:'Sources: school gym', audience:'Principal',
    format:'Return: plan', limits:'Keep: stay on budget\nNever: overspend'})
    .includes('limits-money-no-figure'), 'QMONEY1 money without figure flagged');
  ok(!q({goal:'Success: Plan a fair', context:'Sources: school gym', audience:'Principal',
    format:'Return: plan', limits:'Keep: original voice\nNever: fabricate'})
    .includes('limits-money-no-figure'), 'QMONEY2 no money talk not flagged');
  ok(!q({goal:'Success: Plan a fair', context:'Sources: school gym', audience:'Principal',
    format:'Return: plan', limits:'Keep: budget under $1500\nNever: exceed it'})
    .includes('limits-money-no-figure'), 'QMONEY3 money with figure not flagged');

  // advisory severity, never blocking; input never mutated
  const b = {goal:'Success: Plan', context:'Sources: gym', audience:'P',
    format:'Return: plan totaling $1,700', limits:'Never: exceed $1500'};
  const before = JSON.stringify(b);
  const f = quality.review(b).filter(x => x.rule === 'numbers-inconsistent');
  eq(f.length, 1, 'QSEV1 exactly one inconsistency finding');
  eq(f[0].severity, 'advisory', 'QSEV2 inconsistency is advisory, not blocking');
  eq(JSON.stringify(b), before, 'QSEV3 QC never modifies input');
})();

/* ---------------- analytics.js: opt-in local measurement ---------------- */
(function () {
  // Stub the browser surfaces the module reads off its root (globalThis in Node).
  const store = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k),
    }, configurable: true, writable: true,
  });
  const beacons = [];
  Object.defineProperty(globalThis, 'navigator', {
    value: { sendBeacon: (url, blob) => { beacons.push({ url, blob }); return true; } },
    configurable: true, writable: true,
  });
  const metrics = require('./analytics.js');
  const reset = () => { store.clear(); beacons.length = 0; };

  reset();
  eq(metrics.isEnabled(), false, 'MET1 disabled by default');
  eq(metrics.recordSeal(1000), false, 'MET2 no seal recorded without consent');
  eq(metrics.setEnabled(false), false, 'MET3 opting out stays off');

  reset();
  eq(metrics.setEnabled(true), true, 'MET4 opt-in succeeds');
  eq(metrics.isEnabled(), true, 'MET5 enabled after opt-in');
  eq(metrics.recordSeal(5000), true, 'MET6 seal recorded after opt-in');
  let snap = metrics.snapshot();
  eq(snap.enabled, true, 'MET7 snapshot enabled');
  eq(snap.weekSeals, 1, 'MET8 one seal this week');

  eq(metrics.setEnabled(false), false, 'MET9 opt-out returns false');
  eq(metrics.isEnabled(), false, 'MET10 disabled after opt-out');
  eq(store.size, 0, 'MET11 opt-out clears stored data');

  reset();
  metrics.setEnabled(true);
  metrics.recordSeal(2000);
  eq(beacons.length, 0, 'MET12 no beacon without endpoint');
  globalThis.GCAFLQC_ANALYTICS_ENDPOINT = 'https://example.workers.dev';
  metrics.recordSeal(3000);
  eq(beacons.length, 1, 'MET13 beacon sent with endpoint');
  eq(beacons[0].url, 'https://example.workers.dev/ping', 'MET14 beacon routes to Worker /ping');
  eq(beacons[0].blob.type, 'application/json', 'MET15 beacon is JSON');
  globalThis.GCAFLQC_ANALYTICS_ENDPOINT = 'https://example.workers.dev/ping';
  metrics.recordSeal(3000);
  eq(beacons[1].url, 'https://example.workers.dev/ping', 'MET18 explicit /ping is not doubled');
  globalThis.GCAFLQC_ANALYTICS_ENDPOINT = 'https://example.workers.dev/';
  metrics.recordSeal(3000);
  eq(beacons[2].url, 'https://example.workers.dev/ping', 'MET19 trailing slash resolves to /ping');
  const oldFetch = globalThis.fetch;
  const fetches = [];
  globalThis.navigator.sendBeacon = () => false;
  globalThis.fetch = (url, options) => { fetches.push({url, options}); return Promise.resolve({ok:true}); };
  metrics.recordSeal(1000);
  eq(fetches.length, 1, 'MET20 rejected beacon falls back to fetch');
  eq(fetches[0].url, 'https://example.workers.dev/ping', 'MET21 fallback uses correct Worker route');
  eq(fetches[0].options.method, 'POST', 'MET22 fallback sends POST');
  globalThis.fetch = oldFetch;
  delete globalThis.GCAFLQC_ANALYTICS_ENDPOINT;

  reset();
  metrics.setEnabled(true);
  const raw = JSON.parse(store.get('gcaflqc.analytics.v1'));
  raw.events.push({ at: new Date(Date.now() - 10 * 86400000).toISOString(), durationSeconds: 5 });
  store.set('gcaflqc.analytics.v1', JSON.stringify(raw));
  metrics.recordSeal(1000);
  snap = metrics.snapshot();
  eq(snap.weekSeals, 1, 'MET16 only recent seal counts this week');
  eq(snap.returningDevice, true, 'MET17 older seal marks returning device');
})();

/* ---------------- Report ---------------- */
if (failures.length) {
  console.log('\nFAILURES (' + failures.length + '):\n');
  failures.forEach(function (f) { console.log('✗ ' + f + '\n'); });
}
console.log('----------------------------------------');
console.log('PASS: ' + pass + '  FAIL: ' + fail + '  TOTAL: ' + (pass + fail));
process.exit(fail ? 1 : 0);
