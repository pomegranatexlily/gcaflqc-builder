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
