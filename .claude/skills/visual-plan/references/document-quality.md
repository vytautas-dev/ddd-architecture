# Plan document quality — single source of truth

This file is the canonical quality bar for the plan document: how it reads, which
blocks to use, how open questions are surfaced, and the pre-handoff check. Read it
in full before authoring the plan document; it is the quality bar. Do not write
the document from memory or paraphrase these rules per mode.

<!-- SHARED-CORE:document-quality START -->

**The document is a serious technical plan, not marketing.** Write it the way a
strong Claude or Codex implementation plan reads: outcome-first, prose-first,
self-contained, and specific. State the objective and what "done" means, the
scope and non-goals, the proposed approach with the key decisions and their
rationale, ordered steps that name real files, symbols, actions, and data shapes,
the risks, and a closing verification step (tests, build, or a checkable
behavior). Replace vague prose with specifics; never ship a step like "make it
work." No hero art, gradients, logos, nav bars, slogans, value props, giant
landing-page headings, or marketing cards unless the user explicitly asks.

**Every plan must stand alone.** Even when you are revising an existing plan, the
output is a plan to do the work, not a changelog of the conversation. Do not
write phrases like "preserve the previous plan", "do not drop the old idea", "as
discussed above", "this revision", "unlike the prior version", or "correction
from the earlier plan". Fold the right decisions into the plan as normal
objective, architecture, scope, and roadmap prose. A reviewer who opens the plan
file with no chat history should understand it. Avoid negative framing that only
makes sense against absent context ("not the old mode", "not just X") unless the
contrast is defined in the plan and genuinely helps; state the positive model
directly.

**Make abstract plans instantly legible.** If the idea is broad, strategic, or
intended for a third-party reviewer, put one concrete product snapshot near the
top before dense architecture, mode tables, manifests, or roadmaps. For
UI-capable concepts, that snapshot is usually a `pb-wireframe` app state in the
Canvas tab plus a short paragraph that says what the user sees and what changes
under the hood. Then put mechanics, data flow, sync boundaries, and
implementation detail in separate diagrams or document sections.

**Preserve the user's level of abstraction.** A motivating use case is not
automatically the architecture. When the prompt describes a broader framework,
product mode, or reusable primitive, separate the reusable core from specific
apps, providers, customers, scripts, or launch examples. Use the concrete example
to make the plan understandable, then make clear which parts are core, which are
app-specific adapters, and which are future examples.

**When top visuals exist, they and the document never duplicate each other.** For
UI work, the UI story lives in the top visual surface: Canvas artboards for static
inspection, plus a Prototype tab when the flow should be steppable. The document
carries the technical depth the visuals cannot show — concrete file/symbol maps,
API and data contracts, code snippets, migration or implementation phases, risks,
and validation. For architecture/code reviews, invert that: the document is the
visual surface, and each recommendation carries its own nearby inline
`pb-diagram` / `pb-data-model` block plus file evidence (the `pb-diagram` bullet
below owns how to author those diagrams). Repeat a wireframe in the document only
for a genuinely new detail view or comparison. Skip the visual surface entirely
for non-visual work and write a clean rich document. For a simple binary UI visual
choice, show the two directions in the Canvas only; do not repeat the same options
as body wireframes or prose. Put the actual choice in the bottom Open Questions
block.

**Use the right block, and make it carry substance.** `references/blocks.md` is
the authoritative catalog of block types and their copy-ready markup — the `pb-*`
classes and `--wf-*` / `--pb-*` tokens are all defined in the template's inline
`<style>`, so consult it and reuse its patterns rather than inventing new markup,
new CSS, `<style>` tags, external stylesheets, fonts, or scripts:

- `pb-prose` for plan prose with real bold/italic/code/links and nested lists;
  its lists and inline tables carry scannable structure, and `pb-callout` lifts a
  single note/risk/decision out of the flow.
- `pb-annotated-code` for the file map: when a load-bearing file is worth
  highlighting, prefer the annotated walkthrough over a bare `pb-code` block —
  carry the real code AND anchor short margin notes to the lines that actually
  change (the new function, the changed schema, the wiring point), so the reader
  sees what matters and why instead of code for code's sake. Keep a few
  high-signal notes per file, not one per line. Highlight only the files worth
  reading; never an exhaustive list of every touched file, and never a prose-only
  description of a file. Drop to a plain `pb-code` block only for a throwaway
  snippet with nothing to call out. When more than one file matters, present each
  as its own `pb-annotated-code` / `pb-code` block in sequence, and use a
  `pb-file-tree` to show the full set of files touched at a glance. If the exact
  code is unknown, show the smallest plausible planned shape or a commented stub
  naming what to fill in.
- For a decision: if the reviewer must still pick between a genuinely-open
  either/or, put it in the bottom `pb-open-questions` block — one option per real
  alternative, each with a short detail and `data-recommended` on the one you
  would choose; do not also restate the same choice elsewhere. If you have
  already committed to an approach, state it as settled prose or a `pb-callout`
  with `data-tone="decision"`, optionally with a side-by-side before/after
  comparison of the options you weighed — not as a confusing mid-document form for
  a question you have already answered.
- For side-by-side before/after or current/target comparisons: use `pb-diff` for
  an exact code edit, neighboring `pb-wireframe` frames with `Before`/`After`
  labels for a UI change, or a single before/after `pb-diagram` (two panels in one
  figure) for architecture. Label each side clearly; do not stack comparison
  blocks vertically when parallel reading is the point.
- `pb-diagram` for two-dimensional architecture, dependency, data-flow, or state
  relationships, only when it clarifies something real. Prefer standard
  two-dimensional layouts — paired before/after panels, layered diagrams,
  swimlanes, dependency maps, matrices, or grouped regions; do not default to
  left-to-right chains, and use a line only when the relationship is truly a
  sequence. Do not use a body `pb-diagram` as the primary artifact for a requested
  product canvas, light storyboard, UI flow, screen flow, or wireframe; those
  belong in the Canvas tab as `pb-wireframe` artboards first. Use diagrams below
  that canvas only for architecture, data flow, or implementation mechanics.
  Author diagrams as inline SVG or CSS boxes/flow (`pb-flow`, `pb-node`,
  `pb-arrow`) — no runtime, no chart library. They read from `--wf-ink`,
  `--wf-muted`, `--wf-line`, `--wf-paper`, `--wf-card`, `--wf-accent`,
  `--wf-accent-soft`, `--wf-warn`, and `--wf-ok`, so they flip on light/dark. Do
  not set `font-family` and do not hard-code hex, rgb, or hsl colors in diagram
  markup. Leave room for labels: keep them short, give nodes generous width, and
  place boundary/annotation labels in unused space instead of over nodes; labels
  must not overlap nodes, connectors, or each other. To change a diagram, edit its
  inline SVG/HTML directly. In architecture/code plans, prefer a repeated section
  rhythm: recommendation title, confidence and category badges (as a `pb-callout`
  or prose lead), code-path evidence (`pb-file-tree` / `pb-annotated-code`), a
  local before/after or current/target spatial diagram, then concise
  Problem/Solution/Why text.
- The `Canvas` / `Prototype` / `Document` tabs are the only tabs — reserve them
  for UI plans with a real visual surface. Use them for multiple UI states and the
  steppable flow; do not hide plan prose behind a tab.
- `pb-data-model` for entities/schema, `pb-api` for endpoint contracts, and
  `pb-callout` / `pb-prose` lists for scannable structure.

**Open questions live at the bottom in one `pb-open-questions` block when answers
would change the plan.** Surface answerable unresolved decisions in a single final
`pb-open-questions` section titled "Open questions". That bottom block is the ONLY
place that enumerates the open questions: never add a second "Open questions"
heading, list, or recap of the same questions earlier in the document. A one-line
pointer in the overview prose ("a few decisions are still open — see Open
questions below") is fine, but do not reproduce the question list or a parallel
questions/decisions section above it. List each question's real options and mark
the default you would pick with `data-recommended`; add a `pb-oq-context` line for
constraints. The block is static — there is no submission form (out of scope by
design); the reviewer answers in chat or by editing the file. Keep non-answerable
assumptions or risks as concise `pb-callout` blocks in the relevant section. Never
bury a questions/decisions wall inside the plan narrative, and never ask the same
question twice.

For complex plans, do not end without an open-question audit. If architecture,
scope, UX, data shape, rollout, provider mapping, or ownership still depends on a
choice, either commit to a recommendation with rationale or add it to the bottom
block with a recommended default. A complex plan with no open questions is fine
only when every meaningful decision has been explicitly made.

**Verification must exercise the real workflow.** The final verification section
should go beyond typecheck/unit tests when the plan changes UI, local files,
providers, browser behavior, or multi-step flows. Include at least one end-to-end
smoke that matches the user journey, such as a fresh repo/folder, a real manifest
or data fixture, a browser interaction, a save action, and an on-disk or database
assertion. Name the command or manual browser path when it is known.

**The template's design system owns the look — do not add raw styling.** The
whole plan is one self-contained HTML file, but you never add `<style>` tags,
`<script>` beyond the template's, external `<link>`/font/CDN references, or new
CSS. Assemble the document only from the `pb-*` blocks in `blocks.md`. When a
block needs a bespoke visual, draw it with inline SVG or CSS boxes inside a
`pb-diagram`, styled through `--wf-*` tokens — never a hard-coded hex/rgb/hsl
palette such as white cards with dark ink, because the same markup must read in
dark mode without a patch. For UI/product work, an inline visual is never the
primary home for a requested mockup, UI state, or comparison; that belongs in a
`pb-wireframe` on the Canvas.

**Before handoff, open the plan and check it.** Open the HTML file in a browser
(`open <file>`) and review it in **both** light and dark themes, in print
preview, and at a narrow width. Fix overlap, excessive whitespace, clipped
fragments, misleading inactive controls, poor contrast, and unreadable diagrams
before asking for approval. Confirm the body never scrolls horizontally and the
console is clean. If a frame or diagram only works in one theme, rewrite it with
`--wf-*` tokens and semantic helper classes before surfacing the plan.

<!-- SHARED-CORE:document-quality END -->
