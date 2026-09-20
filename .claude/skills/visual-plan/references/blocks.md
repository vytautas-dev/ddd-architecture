# Plan block library — copy-ready HTML patterns

This file is the authoritative block catalog for this skill. Every plan is a
single self-contained HTML file: copy `plan-template.html`, then assemble the
`<main>` document from the blocks below. Each block uses the exact `pb-*` classes
and `--wf-*` / `--pb-*` tokens already defined in the template's inline
`<style>` — **do not add new CSS, new `<style>` tags, external stylesheets,
fonts, or scripts.** The template's design system owns the look.

## Global rules

- **Zero third-party.** No `<link>`, no CDN, no external fonts, no `fetch`/XHR,
  no runtime chart/diagram libraries. Everything is inline. If a block needs a
  visual, draw it with inline SVG or CSS boxes.
- **Colors come from tokens, never hex.** Document chrome and blocks use
  `--pb-*`; diagrams and wireframes use `--wf-*` (so they flip on light/dark).
  Do not hard-code a hex/rgb/hsl value in block markup.
- **Wide content scrolls inside itself.** Tables, diffs, diagrams, file-trees,
  code, and wireframes must never widen the page. Each wide block already sits in
  an `overflow-x:auto` container in the template CSS; if you add a custom wide
  element, wrap it in `<div class="pb-scroll">…</div>`. The page body never
  scrolls horizontally.
- **Section + heading pattern.** Wrap each top-level section in
  `<section class="pb-section">` with a single `<h2>` — the table of contents is
  auto-built from these `<h2>` headings, so every section needs exactly one.
- **Whitespace in code is literal.** Inside `pb-code`, `pb-annotated-code`, and
  `pb-diff`, the browser renders `<pre>` whitespace verbatim. Write real
  newlines and real indentation; escape `<`, `>`, and `&` as `&lt;`, `&gt;`,
  `&amp;`. Do not indent the `<pre>` contents to match the surrounding HTML —
  leading spaces will show up in the rendered code.
- **Accessibility.** Keep the heading order sane (`h2` → `h3` → `h4`), give every
  meaningful control a label, and never remove focus outlines.

---

## Section wrapper + `pb-prose`

**When:** the default for prose — section intros, narrative, requirements,
rationale, ordered steps. Everything that is text.

```html
<section class="pb-section">
  <h2><span class="pb-section-num">01</span>Overview</h2>
  <p class="pb-section-lead">One sentence framing what this section decides.</p>

  <div class="pb-prose">
    <p>Plain paragraphs read at a comfortable measure. Inline
      <code>identifiers</code> use the mono face, and <strong>emphasis</strong>
      stays subtle. Keys render as <span class="pb-kbd">⌘K</span>.</p>
    <h3>A sub-heading</h3>
    <ul>
      <li>Reuse-first: point at the existing helper before adding one.</li>
      <li>Call out the hard-to-reverse decision explicitly.</li>
    </ul>
    <blockquote>A short aside or quoted constraint.</blockquote>
  </div>
</section>
```

The `pb-section-num` is optional — use it only when sections are genuinely a
numbered sequence a reader must follow in order. Drop it otherwise.

---

## `pb-callout` — note / warn / decision / deferred

**When:** to lift one point out of the flow. Pick the tone by intent:

- `note` — informational context the reader needs.
- `warn` — a risk, gotcha, or destructive/irreversible step.
- `decision` — a committed choice ("we are doing X, not Y, because…").
- `deferred` — explicitly out of scope / parked for later.

Set `data-tone` on the wrapper and swap the icon and title text to match.

```html
<div class="pb-callout" data-tone="decision">
  <svg class="pb-callout-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m5 12 5 5L20 7"/></svg>
  <div class="pb-callout-body">
    <div class="pb-callout-title">Decision — single writer path</div>
    <p>All writes go through <code>savePlan()</code>; the legacy direct-DB path
      is removed. Chosen because it keeps validation in one place.</p>
  </div>
</div>
```

Icon per tone (drop-in, all inline SVG, all `stroke="currentColor"`):

```html
<!-- note -->
<svg class="pb-callout-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>
<!-- warn -->
<svg class="pb-callout-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4M12 17h.01"/></svg>
<!-- decision -->
<svg class="pb-callout-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m5 12 5 5L20 7"/></svg>
<!-- deferred -->
<svg class="pb-callout-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
```

---

## `pb-diagram` — architecture / flow (inline SVG or CSS boxes)

**When:** to show a spatial relationship — architecture, data flow, dependency,
or state. No Mermaid, no runtime. Two authoring styles; pick per diagram.

### Style A — CSS box/flow (fastest, fully theme-aware)

Uses `pb-flow` / `pb-node` / `pb-arrow`. Nodes and arrows read from `--wf-*`
tokens, so they match wireframes and flip on theme automatically.

```html
<figure class="pb-diagram">
  <div class="pb-diagram-canvas">
    <div class="pb-flow">
      <div class="pb-node">Editor<span class="pb-node-sub">client</span></div>
      <span class="pb-arrow" aria-hidden="true"></span>
      <div class="pb-node is-accent">savePlan()<span class="pb-node-sub">validate + write</span></div>
      <span class="pb-arrow" aria-hidden="true"></span>
      <div class="pb-node">plans<span class="pb-node-sub">postgres</span></div>
    </div>
  </div>
  <figcaption class="pb-diagram-caption">Single write path through the validator.</figcaption>
</figure>
```

For a vertical flow, add `pb-flow-col` to the container and use
`<span class="pb-arrow is-down">` between nodes.

### Style B — inline SVG (for precise 2-D layouts)

Style shapes with `stroke="currentColor"` / token-driven fills so the diagram
inherits theme color. Give the `<svg>` a `viewBox` and let CSS cap its width
(`max-width:100%` is already applied). Never set a fixed pixel width that could
overflow.

```html
<figure class="pb-diagram">
  <div class="pb-diagram-canvas">
    <svg viewBox="0 0 420 130" role="img" aria-label="Request lifecycle: client to API to queue">
      <g fill="none" stroke="var(--wf-line)" stroke-width="1.4">
        <rect x="8" y="40" width="110" height="48" rx="8" />
        <rect x="300" y="40" width="110" height="48" rx="8" />
      </g>
      <rect x="154" y="40" width="110" height="48" rx="8" fill="var(--wf-accent-soft)" stroke="var(--wf-accent)" stroke-width="1.4" />
      <g fill="var(--wf-ink)" font-family="ui-monospace, monospace" font-size="13" text-anchor="middle">
        <text x="63" y="68">client</text>
        <text x="209" y="68">api</text>
        <text x="355" y="68">queue</text>
      </g>
      <g stroke="var(--wf-muted)" stroke-width="1.4" marker-end="url(#pb-ah)">
        <line x1="118" y1="64" x2="150" y2="64" />
        <line x1="264" y1="64" x2="296" y2="64" />
      </g>
      <defs>
        <marker id="pb-ah" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0 0 L6 3 L0 6 Z" fill="var(--wf-muted)" />
        </marker>
      </defs>
    </svg>
  </div>
  <figcaption class="pb-diagram-caption">Client → API → async queue.</figcaption>
</figure>
```

Keep SVG `id`s unique per document (e.g. suffix them) so markers/gradients do
not collide across diagrams.

---

## `pb-file-tree` — files touched

**When:** to show which files are added / modified / removed / renamed. Set
`data-change` per row and `style="--depth:N"` for nesting depth (0-based). The
marker glyph and color are supplied by CSS.

```html
<div class="pb-file-tree">
  <div class="pb-file-tree-head">Files touched</div>
  <ul>
    <li class="pb-ft-item" data-change="modified" style="--depth:0"><span class="pb-ft-mark"></span><span class="pb-ft-dir">server/</span></li>
    <li class="pb-ft-item" data-change="modified" style="--depth:1"><span class="pb-ft-mark"></span><span class="pb-ft-name">plan-content.ts</span><span class="pb-ft-note">add per-block salvage</span></li>
    <li class="pb-ft-item" data-change="added" style="--depth:1"><span class="pb-ft-mark"></span><span class="pb-ft-name">plan-examples.ts</span><span class="pb-ft-note">new canonical examples</span></li>
    <li class="pb-ft-item" data-change="removed" style="--depth:1"><span class="pb-ft-mark"></span><span class="pb-ft-name">legacy-parse.ts</span></li>
    <li class="pb-ft-item" data-change="renamed" style="--depth:1"><span class="pb-ft-mark"></span><span class="pb-ft-name">render.tsx → view.tsx</span></li>
  </ul>
</div>
```

`--depth` values: `added` `modified` `removed` `renamed`. Keep rows on one line;
the container already has `overflow-x:auto` (it uses the mono face and clips).

---

## `pb-code` — a code snippet with language label + copy

**When:** a standalone snippet worth showing verbatim. The copy button is wired
by the template's script via `data-copy` — no config needed; it copies the code
inside this block. Include `data-label` so the label restores after "Copied".

```html
<div class="pb-code">
  <div class="pb-code-head">
    <span class="pb-code-file">server/save-plan.ts</span>
    <span class="pb-code-lang">ts</span>
    <span class="pb-code-head-spacer"></span>
    <button type="button" class="pb-copy" data-copy data-label="Copy">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
      <span>Copy</span>
    </button>
  </div>
  <pre><code>export async function savePlan(input: PlanInput) {
  const clean = planSchema.parse(input);
  return db.plans.upsert(clean);
}</code></pre>
</div>
```

Do not indent the lines inside `<code>` to match the HTML nesting — whatever sits
between `<code>` and `</code>` renders literally.

---

## `pb-annotated-code` — code with a side notes rail

**When:** a walkthrough where specific lines need explanation. Wrap each line in
`<span class="pb-line">` (the CSS numbers them); mark referenced lines with
`is-hot`. The notes rail sits beside the code on wide screens and stacks below on
narrow ones.

```html
<div class="pb-annotated-code">
  <div class="pb-code-head">
    <span class="pb-code-file">server/plan-content.ts</span>
    <span class="pb-code-lang">ts</span>
    <span class="pb-code-head-spacer"></span>
    <button type="button" class="pb-copy" data-copy data-label="Copy"><span>Copy</span></button>
  </div>
  <div class="pb-annotated-grid">
    <pre><code><span class="pb-line">export function normalizePlanContent(</span><span class="pb-line">  content: PlanContentInput | undefined,</span><span class="pb-line is-hot">  options: { salvageInvalidBlocks?: boolean } = {},</span><span class="pb-line">) {</span><span class="pb-line is-hot">  const migrated = migratePlanContent(content);</span><span class="pb-line">  return sanitize(planSchema.parse(migrated));</span><span class="pb-line">}</span></code></pre>
    <div class="pb-annotated-notes">
      <div class="pb-annot">
        <span class="pb-annot-lines">L3</span>
        <div class="pb-annot-label">Salvage flag</div>
        <div class="pb-annot-note">Recaps pass <code>salvageInvalidBlocks: true</code>; plans stay strict.</div>
      </div>
      <div class="pb-annot">
        <span class="pb-annot-lines">L5</span>
        <div class="pb-annot-note">Migrate legacy shapes before validating.</div>
      </div>
    </div>
  </div>
</div>
```

Put every `<span class="pb-line">…</span>` back-to-back on one physical line (as
above) so no stray whitespace becomes a blank code line.

---

## `pb-diff` — before/after line diff

**When:** to show an exact edit to a file. Each row is `<tr class="pb-diff-row">`
with `data-kind="add" | "del"` (context rows omit `data-kind`). The gutter shows
line numbers; the sign column is filled by CSS.

**Unified view:**

```html
<div class="pb-diff" data-mode="unified">
  <div class="pb-code-head">
    <span class="pb-code-file">server/parse.ts</span>
    <span class="pb-code-lang">ts</span>
    <span class="pb-code-head-spacer"></span>
    <button type="button" class="pb-copy" data-copy data-label="Copy"><span>Copy</span></button>
  </div>
  <div class="pb-diff-body">
    <table>
      <tbody>
        <tr class="pb-diff-row"><td class="pb-diff-gutter">1</td><td class="pb-diff-sign"></td><td class="pb-diff-text">function parse(value) {</td></tr>
        <tr class="pb-diff-row" data-kind="del"><td class="pb-diff-gutter">2</td><td class="pb-diff-sign"></td><td class="pb-diff-text">  return JSON.parse(value);</td></tr>
        <tr class="pb-diff-row" data-kind="add"><td class="pb-diff-gutter">2</td><td class="pb-diff-sign"></td><td class="pb-diff-text">  try { return JSON.parse(value); } catch { return null; }</td></tr>
        <tr class="pb-diff-row"><td class="pb-diff-gutter">3</td><td class="pb-diff-sign"></td><td class="pb-diff-text">}</td></tr>
      </tbody>
    </table>
  </div>
</div>
```

**Split view:** set `data-mode="split"` and put two `<div class="pb-diff-pane">`
inside `pb-diff-body` (before | after), each with its own `<table>`. The CSS lays
them side by side and stacks them under 640px.

---

## `pb-api` — API endpoint reference

**When:** to specify one endpoint. It is a `<details>` so it collapses to a
method + path row and expands to params / request / responses. Set `data-method`
on the pill (`GET`/`POST`/`PUT`/`PATCH`/`DELETE`) for its color.

```html
<details class="pb-api">
  <summary>
    <span class="pb-api-method" data-method="POST">POST</span>
    <span class="pb-api-path">/v1/plans/:id/publish</span>
    <span class="pb-api-summary">Publish a draft plan</span>
    <svg class="pb-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
  </summary>
  <div class="pb-api-body">
    <h4>Path params</h4>
    <div class="pb-prose"><ul><li><code>id</code> — plan uuid (required).</li></ul></div>

    <h4>Request body</h4>
    <div class="pb-code"><pre><code>{ "visibility": "team" }</code></pre></div>

    <h4>Responses</h4>
    <div class="pb-api-resp"><span class="pb-api-code" data-ok>200</span> Published plan returned.</div>
    <div class="pb-api-resp"><span class="pb-api-code" data-err>409</span> Already published.</div>
  </div>
</details>
```

Keep endpoints in normal single-column flow. `data-ok` colors a 2xx code green;
`data-err` colors a 4xx/5xx code red.

---

## `pb-data-model` — entities / schema

**When:** to model a data shape or ERD. Each entity is a `pb-entity` card with a
header and a field table. Flags: `pk` (primary key), `fk` (foreign key), `nn`
(not-null). Relations go in a `pb-relation` line spanning the grid.

```html
<div class="pb-data-model">
  <div class="pb-entity">
    <div class="pb-entity-head">plans <small>table</small></div>
    <table>
      <tbody>
        <tr><td><span class="pb-field-name">id</span><span class="pb-flag" data-flag="pk">PK</span></td><td class="pb-field-type">uuid</td></tr>
        <tr><td><span class="pb-field-name">owner_id</span><span class="pb-flag" data-flag="fk">FK</span></td><td class="pb-field-type">uuid → users.id</td></tr>
        <tr><td><span class="pb-field-name">content</span><span class="pb-flag" data-flag="nn">NN</span></td><td class="pb-field-type">jsonb</td></tr>
      </tbody>
    </table>
  </div>
  <div class="pb-entity">
    <div class="pb-entity-head">users <small>table</small></div>
    <table>
      <tbody>
        <tr><td><span class="pb-field-name">id</span><span class="pb-flag" data-flag="pk">PK</span></td><td class="pb-field-type">uuid</td></tr>
      </tbody>
    </table>
  </div>
  <div class="pb-relation">plans.owner_id → users.id · many-to-one</div>
</div>
```

---

## `pb-wireframe` — screen mockup

**When:** to show a real product screen, state, or before/after UI change. This
is a clean, flat, bordered mockup (there is no sketch/hand-drawn renderer in the
self-contained build — see the note below). It must still meet the full quality
bar in `wireframe.md`: real product content, full-width chrome, pinned bottom
bars, comparable before/after, token colors only.

**Shape:** `<div class="pb-wireframe" data-surface="…">` with a single
`pb-wf-screen` root inside that owns padding and fills the frame. Surfaces:
`desktop`, `browser`, `tablet`, `panel`, `mobile`, `popover`.

```html
<div class="pb-wireframe-wrap">
  <div class="pb-wireframe-label">Plan list — after</div>
  <div class="pb-wireframe" data-surface="browser">
    <div class="pb-wf-browserbar">
      <span class="pb-wf-dots"><i></i><i></i><i></i></span>
      <span class="pb-wf-url">app.example.com/plans</span>
    </div>
    <div class="pb-wf-screen">
      <div style="display:flex;align-items:center;gap:10px;width:100%">
        <h1>Plans</h1>
        <div style="flex:1"></div>
        <button class="primary">New plan</button>
      </div>
      <div style="display:flex;gap:6px">
        <span class="wf-pill accent">All 24</span>
        <span class="wf-pill">Drafts 6</span>
        <span class="wf-pill">Published 18</span>
      </div>
      <div class="wf-card" style="display:flex;flex-direction:column;gap:0;padding:0">
        <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-bottom:1.4px solid var(--wf-line)">
          <div style="width:30px;height:30px;border-radius:8px;background:var(--wf-accent-soft)"></div>
          <div style="flex:1"><strong>Checkout redesign</strong><br /><small>edited 2h ago · Jordan</small></div>
          <span class="wf-pill">Draft</span>
        </div>
        <div style="display:flex;align-items:center;gap:12px;padding:12px 14px">
          <div style="width:30px;height:30px;border-radius:8px;background:var(--wf-accent-soft)"></div>
          <div style="flex:1"><strong>Billing migration</strong><br /><small>edited yesterday · Sam</small></div>
          <span class="wf-pill accent">Published</span>
        </div>
      </div>
      <div style="flex:1"></div>
      <small>24 plans · 2 archived</small>
    </div>
  </div>
</div>
```

### Wireframe rules (carried from wireframe.md, adapted to self-contained HTML)

- **No sketch, no hand font.** The old renderer added rough.js sketch + a
  hand-drawn font; the self-contained build has neither. Wireframes render as
  clean flat bordered surfaces. Do **not** add `box-shadow`/`filter`
  drop-shadows to the frame or cards — keep them flat; separate with spacing,
  borders, and labels. Every rule about *content* quality still holds.
- **No nested document.** Never put `<html>`, `<head>`, `<body>`, `<style>`, or
  external `<link>`/font tags inside a wireframe. Write only the screen's body
  markup.
- **Tokens, not hex.** For any inline color use `--wf-*`:
  `--wf-ink`, `--wf-muted`, `--wf-line`, `--wf-paper`, `--wf-card`,
  `--wf-accent`, `--wf-accent-fg`, `--wf-accent-soft`, `--wf-warn`, `--wf-ok`,
  `--wf-radius`. Never set `font-family`. Use literal CSS lengths for spacing
  (`padding:16px`, `gap:12px`) — there are no `--wf-space-*` tokens.
- **Helper classes:** `.wf-card` / `.wf-box` (bordered padded container),
  `.wf-pill` / `.wf-chip` (add `.accent` for the filled variant), `.wf-muted`
  (secondary text). Bare `h1`/`h2`/`h3`, `p`, `button`, `button.primary`,
  `input`, `select`, `textarea`, `label`, `a`, `small`, `hr` are auto-themed.
- **Icons are inline SVG.** There is no renderer to swap `data-icon` markers, so
  draw icons inline and add `class="wf-icon"` (it sizes to text and inherits
  color). Do not print visible words like "search" or "mail" where the product
  shows an icon.
  ```html
  <span class="wf-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg></span>
  ```
- **Full-width chrome; pinned bottom bars.** Lay top bars / headers / bottom nav
  as a single flex row filling the frame; push trailing actions right with a
  `<div style="flex:1"></div>` spacer. For a pinned bottom bar, the
  `pb-wf-screen` is already a `height:100%` flex column — give the scroll body
  `flex:1` and make the bar the last child (or `margin-top:auto`).
- **Fill the frame; short labels.** Compose enough real content to fill the
  surface top to bottom; keep every label on one line (`white-space:nowrap` on
  single-line rails).
- **Before/after comparability.** Put both states in neighboring wireframes and
  name them with the `pb-wireframe-label` above each frame (e.g. "Before" /
  "After") — never bake a Before/After pill inside the screen. Keep the same
  surface, size, and density on both sides; change only the delta.
- **Choose the right surface.** `popover` for a floating menu/dropdown, `panel`
  for a side panel/inspector, `mobile` only for genuinely phone work, `browser`
  for a web page needing chrome, `desktop` for an app shell. Do not default to
  desktop+mobile.

### Canvas placement

For UI plans, put the primary wireframes inside the template's Canvas panel
(`#panel-canvas .pb-canvas-lane`) as neighboring frames, and keep the Document
tab for the written plan. For document-only plans, delete the tabs and drop
wireframes inline where they are discussed.

---

## `pb-open-questions` — the single questions block

**When:** exactly once, at the bottom of the document, for genuinely open
decisions the reviewer must resolve. Each question lists options; mark the
recommended default with `data-recommended` (it gets a filled marker + a REC
badge). This is static — there is no submission form (out of scope by design);
the reviewer answers in chat or by editing the file.

```html
<section class="pb-section">
  <h2><span class="pb-section-num">09</span>Open questions</h2>
  <div class="pb-open-questions">
    <ol class="pb-oq-list">
      <li class="pb-oq-item">
        <div class="pb-oq-q">Where should salvaged blocks surface to the author?</div>
        <div class="pb-oq-context">Recaps salvage bad blocks silently today; plans stay strict.</div>
        <ul class="pb-oq-options">
          <li class="pb-oq-option" data-recommended>Inline warning banner in the recap header<span class="pb-oq-rec">rec</span></li>
          <li class="pb-oq-option">Console-only log, no UI</li>
          <li class="pb-oq-option">Block publish until resolved</li>
        </ul>
      </li>
      <li class="pb-oq-item">
        <div class="pb-oq-q">Do we migrate existing draft plans on read or in a batch job?</div>
        <ul class="pb-oq-options">
          <li class="pb-oq-option" data-recommended>Lazy migrate on read<span class="pb-oq-rec">rec</span></li>
          <li class="pb-oq-option">One-off backfill script</li>
        </ul>
      </li>
    </ol>
  </div>
</section>
```

---

## Assembly checklist

1. Copy `plan-template.html`; fill the header (`{{TITLE}}`, subtitle, meta,
   status pill).
2. Decide the surface: UI plan (keep Canvas/Prototype/Document tabs) vs
   document-only (delete tabs + canvas/prototype panels; move `data-toc-scope`
   onto the remaining container).
3. Assemble `<main>` sections from the blocks above; one `<h2>` per section.
4. End with a single `pb-open-questions` block if anything is unresolved.
5. Open the file in a browser; check it in **both** light and dark, print
   preview, and a narrow width. No horizontal page scroll, no console errors.
