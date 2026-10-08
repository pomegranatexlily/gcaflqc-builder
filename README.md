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
| `index.html` | The real mobile-first application (no framework, no build step). Loads the two engines below and provides the brief editor, QC, Seal, renderers, handoff, sharing, and local persistence. |
| `engine-sharpen.js` | Deterministic Sharpen + audit engine. No AI, no network. Shared between the browser and the Node test suite via a UMD wrapper. |
| `engine-handoff.js` | Handoff transport adapters (Copy, ChatGPT, Claude, Perplexity, Grok). Copy-first; prefill is opt-in and length-guarded. |
| `engine.test.js` | Executable Node regression suite. Run it with `node engine.test.js`. |
| `README.md` | This file. |

Static hosting only — deploy the directory as-is to GitHub Pages. There is no
backend, no account system, and no cloud sync. Briefs persist in the browser's
`localStorage` under the versioned key `gcaflqc.v3` (autosave; historical
`gcaflqc.briefs.v1` data is never destructively replaced).

## The workflow

```
Assignment → Canonical Brief → Audit → Optional Sharpen → Human Review
    → Seal → Render → Handoff
```

- **QC is advisory.** It surfaces the single most important structural
  weakness. No scores, no percentages, no XP.
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

## Testing

```sh
node engine.test.js
```

The suite covers every behavior above plus idempotence (second pass is a
no-op with zero edits), no double-tagging, undo semantics, vague-language
audit with idiom exceptions, determinism, edit-count sanity, and an iOS
Safari 15+ compatibility scan (no regex lookbehind in either engine).

## Browser support

Vanilla HTML/CSS/JS. iOS Safari 15+ baseline — no regex lookbehind, no
framework, no build step. Clipboard uses `navigator.clipboard` with a
focused-textarea fallback; the destination tab is opened synchronously in the
same task as the copy so mobile browsers keep transient user activation.

## Deployment

Copy the five files to any static host, or enable GitHub Pages on the
repository. No build, no environment variables, no server.
