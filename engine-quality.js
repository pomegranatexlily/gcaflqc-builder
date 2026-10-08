/* engine-quality.js — deterministic editorial QC for canonical briefs.
 * Advisory diagnostics only: never writes into the brief or fabricates sources.
 * Browser (BriefQualityEngine) and Node CommonJS, no dependencies.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.BriefQualityEngine = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function val(brief, key) { return String(brief && brief[key] || ''); }

  function moneyValues(text) {
    var out = [], re = /\$\s*([\d,]+(?:\.\d{1,2})?)/g, m;
    while ((m = re.exec(text))) out.push(parseFloat(m[1].replace(/,/g, '')));
    return out;
  }
  function fmtMoney(n) {
    return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }

  function review(brief) {
    var goal = val(brief, 'goal');
    var context = val(brief, 'context');
    var audience = val(brief, 'audience');
    var format = val(brief, 'format');
    var limits = val(brief, 'limits');
    var all = [goal, context, audience, format, limits].join('\n');
    var findings = [];

    // If the user invokes a thesis without stating it, no honest renderer
    // can infer that thesis from an essay topic such as "Abe Lincoln".
    var referencesThesis = /\bthesis\b/i.test(all);
    var statesThesis = /(?:^|\n)\s*(?:thesis|central claim)\s*:\s*\S+/i.test(all) ||
      /\b(?:my|the|our)\s+thesis\s+(?:is|argues|states|maintains)\s+\S+/i.test(all);
    if (referencesThesis && !statesThesis) {
      findings.push({
        rule: 'thesis-unspecified', dimension: 'C', severity: 'blocking',
        message: 'Context — you refer to a thesis but do not state it. Add your thesis under Context (for example, "Thesis: ...") before sealing; do not invent one.'
      });
    }

    // A subject area is not a citation or evidence permission list.
    var sourceLine = context.split(/\r?\n/).filter(function (line) {
      return /^\s*Sources\s*:/i.test(line);
    })[0] || '';
    var sourceValue = sourceLine.replace(/^\s*Sources\s*:\s*/i, '').trim().replace(/[.!]\s*$/, '');
    if (/^(?:civil war evidence|historical evidence|evidence|research|general information|sources|stuff online|the internet)$/i.test(sourceValue)) {
      findings.push({
        rule: 'sources-unspecified', dimension: 'C', severity: 'advisory',
        message: 'Context — "' + sourceValue + '" names a topic, not verifiable sources. Identify documents, source types, or research boundaries. Do not fabricate citations.'
      });
    }

    if (/\b(?:Produce\s+to\s+do|do\s+an?\s+assignment)\b/i.test(goal)) {
      findings.push({
        rule: 'goal-unfocused', dimension: 'G', severity: 'advisory',
        message: 'Goal — replace the vague assignment wording with the actual deliverable and subject. Sharpen can repair "Produce to do an assignment"; you choose the final objective.'
      });
    }
    if (/\bget\s+off\s+topic\b/i.test(limits) &&
        /\bin\s+touch\s+with\s+(?:my|the|our)\s+thesis\b/i.test(limits)) {
      findings.push({
        rule: 'limits-redundant', dimension: 'L', severity: 'advisory',
        message: 'Limits — these two thesis restrictions overlap. Consider one precise instruction after you supply the thesis.'
      });
    }

    // Same $ cap stated twice (e.g. Keep: under $1500 / Never: never exceed
    // $1,500). Keep should hold the positive requirement, Never the
    // forbidden action — not the same rule twice.
    var limitAmounts = moneyValues(limits);
    var seenAmt = {}, dupAmt = null;
    for (var ai = 0; ai < limitAmounts.length; ai++) {
      var akey = String(limitAmounts[ai]);
      if (seenAmt[akey]) { dupAmt = limitAmounts[ai]; break; }
      seenAmt[akey] = true;
    }
    if (dupAmt !== null) {
      findings.push({
        rule: 'limits-cap-duplicated', dimension: 'L', severity: 'advisory',
        message: 'Limits — Keep and Never repeat the same ' + fmtMoney(dupAmt) + ' cap. Make Keep the positive requirement and Never the forbidden action.'
      });
    }

    // Internal consistency: a ceiling stated in Limits ("under $1500",
    // "cap of $1,500") versus $ amounts named anywhere else. Restatements
    // of the cap itself are excluded. Advisory only — the engine checks the
    // brief's own math, never external prices.
    var capMatch = limits.match(/\b(under|below|within|less\s+than|exceed(?:ing)?|no\s+more\s+than|capped?(?:\s+(?:at|of))?|maximum(?:\s+of)?|up\s+to)\b[^$\n]{0,30}\$\s*([\d,]+(?:\.\d{1,2})?)/i);
    if (capMatch) {
      var cap = parseFloat(capMatch[2].replace(/,/g, ''));
      var others = moneyValues(goal + '\n' + context + '\n' + audience + '\n' + format)
        .filter(function (n) { return n !== cap; });
      var othersTotal = others.reduce(function (a, b) { return a + b; }, 0);
      if (others.length && othersTotal > cap) {
        findings.push({
          rule: 'numbers-inconsistent', dimension: 'L', severity: 'advisory',
          message: 'Numbers — ' + fmtMoney(othersTotal) + ' named outside Limits exceeds the ' + fmtMoney(cap) + ' cap. Verify the math before sealing.'
        });
      }
    }

    // Completeness: money talk with no figure is not a constraint.
    if (/\b(budget|cost|spend(?:ing)?|price|fee|payment)\b/i.test(limits) && !/\d/.test(limits)) {
      findings.push({
        rule: 'limits-money-no-figure', dimension: 'L', severity: 'advisory',
        message: 'Limits — money is mentioned but no figure is stated. Add the cap (for example, "Never: exceed $1,500").'
      });
    }

    return findings;
  }

  // Compact handoff is still readable: one dimension per paragraph, exactly
  // as authored. No added requirements, source names, or invented content.
  function renderCompact(brief) {
    var pairs = [
      ['GOAL', val(brief, 'goal')], ['CONTEXT', val(brief, 'context')],
      ['AUDIENCE', val(brief, 'audience')], ['FORMAT', val(brief, 'format')],
      ['LIMITS', val(brief, 'limits')]
    ];
    var sections = pairs.filter(function (pair) { return pair[1].trim() !== ''; })
      .map(function (pair) { return '[' + pair[0] + ']\n' + pair[1].trim(); });
    sections.push('[QC]\nBefore outputting, verify evidence support, flag uncertainty, and confirm full compliance.');
    return sections.join('\n\n');
  }

  return { review: review, renderCompact: renderCompact };
}));
