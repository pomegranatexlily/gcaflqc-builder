# G-CAFL-QC Builder

A mobile-first, offline-capable production-brief editor built on the
**G-CAFL-QC Framework™** — Goal, Context, Audience, Format, Limits, Quality Check.

Governing principle: **THE BRIEF IS THE DOCUMENT.** One canonical editable
G-C-A-F-L brief. The software audits; the human author seals.

> "AI is not the education — execution is."

**POMEGRANATE × LILY · Freedom Arkives**
G-CAFL-QC Framework™ © 2026 Christopher Turner, writing and publishing as
Dr. Nachamasha Yahsharala. All Rights Reserved.

## Files

| File | Purpose |
|---|---|
| `index.html` | The real mobile-first application (no framework, no build step). Loads the browser engines and provides the brief editor, QC, Seal, renderers, handoff, sharing, and local persistence. |
| `engine-sharpen.js` | Deterministic Sharpen + audit engine. No AI, no network. Shared between the browser and the Node test suite via a UMD wrapper. |
| `engine-quality.js` | Deterministic cross-field QC for missing thesis statements, vague source boundaries, redundant limitations, and readable compact prompt output. |
| `engine-handoff.js` | Handoff transport adapters (Copy, ChatGPT, Claude, Perplexity, Grok). Copy-first; prefill is opt-in and length-guarded. |
| `engine.test.js` | Executable Node regression suite. Run it with `node engine.test.js`. |
| `analytics.js` | Opt-in, content-free seal-counting module. Local-only until a trusted HTTPS reporting endpoint is configured. |
| `README.md` | This file. |

Static hosting only — deploy the directory as-is to GitHub Pages. There is no
backend, no account system, and no cloud sync. Briefs persist in the browser's
`localStorage` under the versioned key `gcaflqc.v3` (autosave; historical
`gcaflqc.briefs.v1` data is never destructively replaced).

## First-layer growth release (October 2026)

- **Immediate entry:** a new visitor starts directly in a live draft, with a Goal textarea ready to use. No duplicate Start Brief screen; the typed goal is saved once under the canonical `Success:` label.
- **Editing:** the remaining Context, Audience, Format, and Limits fields retain their reviewable editor sheets. The Goal has an explicit **Sharpen goal** shortcut. Default line labels are supplied as needed; `Keep:` is optional so it does not repeat `Never:` budget limits.
- **Mobile:** editor sheets respect `visualViewport` height and offset for on-screen keyboards, keep 16px text, and scroll within the available area. Physical iPhone testing is still required.
- **Measurement:** use **Briefs → Optional usage measurement** to opt in. Seals and completion durations are counted per device, not full briefs. Turning it off deletes that browser's count data. Storage key: `gcaflqc.analytics.v1`.
- **Sitewide reporting is not enabled:** GitHub Pages has no server. To enable opt-in aggregate seal reporting later, configure a trusted HTTPS receiver as `window.GCAFLQC_ANALYTICS_ENDPOINT` before `analytics.js` loads and publish clear privacy information. Until then, on-device counts cannot be combined or interpreted as unique users across devices. The receiver should minimize IP retention and other identifiers; never accept brief text.
- **Existing data:** user-owned briefs continue in the unchanged `gcaflqc.v3` localStorage schema; AI handoff and sharing remain as before.

## The workflow

```
Assignment → Canonical Brief → Audit → Optional Sharpen → Human Review
    → Seal → Render → Handoff
```

- **QC is reviewable.** Structural and missing-thesis findings can block
  sealing; source specificity and repetition findings are advisory. The UI
  foregrounds the highest-priority issue. No scores, percentages, or XP.
- **Sharpen is deterministic and reviewable.** It offers mechanical
  tightening (never meaning changes); the human previews and applies it.
  One-level Undo is supported.
- **The human seals.** `sealedAt` records approval. Any material edit to the
  five dimensions clears the seal.
- **Renderers** turn the one brief into a prompt, full brief, visual
  directive, Markdown, JSON, or share payload — one brief, many renderings.
- **Handoff** transports rendered text. Default: copy → open destination →
  user pastes. URL prefill (Perplexity only) is explicit opt-in because prompt
  text in URLs can leak into history and logs.

## Sharpen behaviors (tested)

Preservation verbs are recognized before generic prohibitions:

- `Don't change the legal definitions` → `Keep: legal definitions`
- `do not alter the citation format` → `Keep: citation format`
- `never modify the contract headers` → `Keep: contract headers`
- `don't touch the approved language` → `Keep: approved language`

Multi-clause directives normalize per sentence:

- `I don't want filler and don't change the terms` → `Never: filler` + `Keep: terms`
- `Do not fabricate. Do not invent numbers.` → `Never: fabricate` + `Never: invent numbers`
- `Do not fabricate. Do not alter dates.` → `Never: fabricate` + `Keep: dates`
- `Never invent numbers; only return the table` → `Never: invent numbers` + `Return only: table`
- `output as a one-page memo with sections for risks` → `Format: a one-page memo` + `Sections: risks`
- `written for CFOs, make sure the tone is formal` → `Audience: CFOs` + `Register: formal`
- `don't use 'very best' and don't change the terms` → `Never: use 'very best'` + `Keep: terms`

Protected content (quotes, URLs, inline code, `[[slots]]`) is masked before
transformation with collision-free sentinels and restored byte-identical —
including literal Unicode private-use characters in user input.

## Real-world brief corrections

- `Success: Produce to do an assignment about Abe Lincoln` → `Success: Complete an assignment about Abe Lincoln` after human-approved Sharpen.
- `Sources: Civil war evidence` → `Sources: Civil War evidence` (capitalization only; no source fabrication).
- `Return: MLA FORMAT 5 pages` → `Return: MLA format, 5 pages` (formatting only).
- Referring to **my thesis** without providing `Thesis: ...` triggers a blocking QC prompt rather than inventing one.
- Generic `Sources: Civil War evidence` produces an advisory asking for actual research boundaries or source documents.
- Compact handoff puts each G-C-A-F-L field and QC in separate paragraphs, preserving the user's words.

## Testing

```sh
node engine.test.js
```

The suite covers every behavior above plus idempotence (second pass is a
no-op with zero edits), no double-tagging, undo semantics, vague-language
audit with idiom exceptions, determinism, edit-count sanity, and an iOS
Safari 15+ compatibility scan (no regex lookbehind in the three engines).

## Browser support

Vanilla HTML/CSS/JS. iOS Safari 15+ baseline — no regex lookbehind, no
framework, no build step. Clipboard uses `navigator.clipboard` with a
focused-textarea fallback; the destination tab is opened synchronously in the
same task as the copy so mobile browsers keep transient user activation.

## Deployment

Serve the repository at its root on any static host, or use GitHub Pages. No build, no environment variables, no server.
