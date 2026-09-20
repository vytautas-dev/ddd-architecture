---
name: visual-plan
description: >-
  Turn ordinary text plans into a structured visual plan delivered as a single
  local self-contained HTML file — inline diagrams, file maps, annotated code,
  wireframes, and open questions — that opens in a browser for review and
  approval before you write code.
metadata:
  visibility: exported
---

# Visual Plan

A visual plan is a structured, scannable planning document you would normally
write in Markdown, rendered instead as a single self-contained HTML file with
editable visual blocks mixed into the prose: inline diagrams, file trees, code
snippets, annotated code, diffs, API/data-model tables, open questions, and an
optional top visual review area (wireframe canvas, lightweight prototype, or both
in tabs). Architecture and backend plans stay document-only; UI and product plans
start with the top canvas (the Visual Surface Choice section owns that rule).

The plan is one HTML file with zero network dependencies — no CDN, no external
fonts, no third-party scripts, nothing fetched at runtime. Everything (the design
system, diagrams, and interactivity) is inlined so the file opens and works
offline straight from disk.

`/visual-plan` is the packaged command and main entry point. Pick the review
surface from the task: document-only for architecture / backend / data / refactor
/ API work, canvas-first when the work is primarily product UI and review should
start with screens, or canvas + prototype when the reviewer needs to operate a
multi-step flow. When a Codex, Claude Code, Markdown, or pasted plan already
exists, `/visual-plan` uses that source plan as the starting point and builds the
review surface from it instead of starting over.

## When To Use

Create or adapt a visual plan whenever the plan would be better as a reviewable
artifact than a chat paragraph. This includes modest work such as a single UI
surface with states, a small workflow, a before/after product change, or a
component/API/data-shape decision that needs alignment, plus larger multi-file,
ambiguous, long-running, risky, or UI-heavy work. Use it when architecture / data
flow / UI direction / options / open questions would benefit from inline diagrams
or structured blocks, when the user needs to react to a direction before you
implement, or when an existing text plan needs a richer review surface.

## Plan Discipline

- **Gate thoughtfully.** A visual plan is a richer review surface, not only a
  tool for giant projects. Use it when the user needs to see, compare, comment
  on, or approve a direction before code, even for a modest UI/state/workflow
  change. Skip it for truly trivial, unambiguous work — typos, one-line fixes, a
  single well-specified function, anything whose diff you could describe in one
  sentence — and just make the change. Never pad a plan with filler and never
  ship a single-step plan.
- **Research before you draft.** Read the real files, actions, schema, and
  patterns first; name actual files, symbols, and data shapes instead of
  inventing them. Check existing `actions/` before proposing endpoints and prefer
  named client helpers over raw fetch. Delegate wide exploration to a sub-agent.
  Lead with reuse: for each step, name what it reuses — existing actions, schema,
  components, helpers — before what it adds, so the plan explains the genuinely
  new delta instead of redescribing what already exists.
- **Decide the hard-to-reverse bets first.** For non-trivial backend, data, or
  API work, sketch where the feature is headed, then call out the decisions that
  are expensive to undo once data or callers depend on them — wire format, public
  ids, data-model shape, auth and ownership boundaries — and get those right in
  the plan even if most of the feature ships later. Then scope to the smallest
  first cut that proves the approach without foreclosing it, stating both what is
  in and what is explicitly deferred.
- **Keep examples at the right altitude.** When the user's idea is a broad
  framework, product, or operating-model change, do not collapse it into the
  first concrete example, provider, or sync path they mention. Separate the core
  abstraction from motivating examples and app/provider adapters. Use examples to
  make the plan legible, but label them as examples unless they are the whole
  requested scope.
- **Publish standalone plans.** If the user pasted, referenced, or already has a
  Codex / Claude Code / Markdown plan, treat it as source material, but rewrite
  the published plan as a clean standalone proposal. Preserve the source plan's
  useful intent and codebase facts, label inferred visuals as inferred, and avoid
  revision language such as "preserve the prior plan", "do not drop the old
  idea", "unlike the previous version", or "this revision changes...". A reader
  who never saw the chat or earlier drafts should understand the plan.
- **Make the first read concrete.** If the plan is meant to be shared with
  someone outside the chat, or if the concept is abstract, lead near the top with
  one concrete product example before mode tables, architecture, or roadmaps. For
  UI-capable concepts, that usually means a top-canvas app state that shows the
  real user workflow in product terms. Do not rely on phrases that only make
  sense in conversation, and do not frame the plan as "not the old idea"; state
  the positive model directly.
- **Planning is read-only.** Make no source edits while building or reviewing the
  plan. Start editing only after the user approves the direction.
- **Clarify vs. assume.** Do not ask how to build it — explore and present the
  approach and options in the plan. Ask a clarifying question only when an
  ambiguity would change the design and you cannot resolve it from the code; use
  the host agent's normal ask-user-question flow and batch 2-4 high-leverage
  questions before finalizing. Otherwise state the assumption explicitly and
  proceed, and keep anything unresolved in the plan's single bottom
  `pb-open-questions` block. For complex plans, do a final open-question pass
  before handoff: if a decision would affect architecture, scope, UX, data shape,
  or rollout, either decide it in the plan with rationale or put it in that bottom
  block with a recommended default.
- **The plan is the approval gate.** After surfacing it, ask the user to review
  and approve before you write code, and name which files/areas the work touches.
  Presenting the plan and requesting sign-off is the approval step — do not ask a
  separate "does this look good?" question.
- **The document is the source of truth, not the chat.** When scope shifts,
  update the HTML file rather than only changing course in chat, and make the
  updated document stand alone. Do not describe the update as a correction to an
  earlier draft inside the plan itself. Re-read the approved plan before major
  steps.

## The Deliverable Is A Local HTML File — Never Raw Chat

The deliverable is ALWAYS a generated self-contained HTML file, never a chat-only
plan. Do not hand the plan over as inline chat content — no Markdown prose, ASCII
sketch, table, or fenced wireframe standing in for the plan. Build the plan you
would normally write in Markdown, but render it to `plans/<slug>/plan.html` (or a
private scratch location) and hand over the file path. The chat message points at
the file; it never *is* the plan.

Author the file by copying `references/plan-template.html` and filling its
`<main>` with blocks from `references/blocks.md` — do not hand-roll a fresh
document skeleton or invent block markup from memory. The template carries the
whole design system (inline `<style>` tokens for light/dark/print) and a small
vanilla inline `<script>` (collapsible sections, tab switching, copy-code, theme
toggle persisted in `localStorage`), so the file stays fully offline and
self-contained. Never add a `<link>` to a CDN, an external font, a Mermaid
runtime, or any `fetch`/XHR — every asset lives inline.

## Core Workflow

1. **Research before drafting.** Inspect the real codebase — files, actions,
   schema, patterns — and gather what you need before generating anything.
   Reuse-first: name what each step reuses before what it adds. Delegate wide
   exploration to a sub-agent. If a source plan already exists, gather its exact
   text from the user's paste, a referenced file, or recent visible agent
   context; do not invent source text. Planning is read-only — make no source
   edits yet.
2. **Choose the visual surface.** Decide document-only vs. canvas UI vs. canvas +
   prototype before you compose; the Visual Surface Choice section owns the rule.
   Do not add visual chrome by default.
3. **Compose the file.** Copy `references/plan-template.html` and fill its
   `<main>` with blocks from `references/blocks.md`. Render diagrams as inline SVG
   or CSS box/flow layouts — never Mermaid or any runtime loaded from the network.
   For UI/product plans, build the top canvas first with the primary wireframes
   and annotated states, then write the document body below (see
   `references/canvas.md` and `references/document-quality.md`). For document-only
   plans, omit the top canvas and place `pb-diagram`, `pb-data-model`, `pb-api`,
   `pb-diff`, `pb-file-tree`, `pb-code`, and `pb-annotated-code` blocks directly
   next to the relevant prose. Keep the document close to the standalone Markdown
   plan you would normally output, and keep unresolved decisions in the single
   bottom `pb-open-questions` block.
4. **Save.** Write the file to `plans/<slug>/plan.html` when it should be checked
   in, or to a repo-ignored / temp location such as
   `/tmp/visual-plans/<slug>/plan.html` when it should stay private scratch.
5. **Hand off.** Open it for the user — on macOS run `open <path>` — and give the
   exact file path in chat, then ask the user to review and approve before you
   write code, naming which files/areas the work touches. Presenting the plan and
   requesting sign-off is the approval step; do not ask a separate "does this look
   good?" question. For high-stakes plans (architecture, backend, data,
   multi-file, or risky), kick off the self-review pass while the user reads
   instead of blocking handoff on it.
6. **Iterate.** Take feedback from chat, edit the HTML file directly, and re-open
   it. Use no network tools at any point.

## Self-Review Before Handoff

For high-stakes plans — architecture, backend, data-model, migration, multi-file,
or otherwise risky work — run one adversarial self-review pass before treating the
plan as final. Skip it for small, UI-only, or single-decision plans where the cost
outweighs the value. Keep the pass cheap and non-blocking:

- **Surface the plan first, review concurrently.** Open the file and let the user
  start reading, then run the review in parallel — never make the user wait on it.
- **Review the written plan; do not re-research.** Critique the plan text and its
  own blocks. The grounding was already done while drafting, so the review checks
  the output instead of re-exploring the repo.
- **Spawn one skeptical reviewer** whose only job is to find what is weak,
  missing, or wrong — not to praise. Point it at: hard-to-reverse decisions made
  implicitly or not at all (wire format, public ids, data-model shape, auth,
  ownership); steps not anchored in real files or symbols; a menu of options where
  the plan should commit to one; obvious missing decisions ("what happens when
  X?", "why not Y?"); and padding or single-step filler.
- **Fix vs. ask.** Apply clear-cut fixes yourself by editing the HTML — vague
  non-goals, unanchored claims, an obvious missing decision. Route genuine
  judgment calls back to the user instead: add them to the bottom
  `pb-open-questions` block or batch them into the normal ask-user-question flow.
  Do not silently decide them.
- **Do not surprise the user mid-read.** Prefer to apply the edits before you open
  the file; otherwise note briefly that a self-review is running so the plan
  changing under them is expected. When you next respond, summarize what the
  review changed and what it surfaced for the user to decide.

## Visual Surface Choice

Choose the surface before composing the file or after reading the source plan. Do
not add visual chrome by default:

For UI/product plans, the top canvas is usually the primary review surface. Put
the first meaningful wireframes there in the `Canvas` tab, not buried as
document-body blocks. Use multiple artboards when states matter, such as the
default view, an overflow menu or popover, a side panel, loading, or error. Put
short annotations beside each frame, and keep implementation details, tradeoffs,
file maps, data contracts, risks, and verification in the document body below.

When the user asks for a flow, storyboard, journey, wireframe, canvas, or "what
this looks like", treat that as a canvas-first request. Make one artboard per
user-visible state, connect only adjacent transitions, and use short annotations
for the product notes. Do not substitute a document-body `pb-diagram` block for
the requested storyboard just because a diagram is faster to write; diagrams
belong in the document body for backend mechanics, architecture, or data-flow
explanation.

Keep product wireframes and explanatory/meta diagrams separate. Start with pure
screens that look like the app state under discussion, without callout prose or
architecture notes embedded inside the UI. Put arrows, labels, contracts, data
flow, and mode explanations in separate annotations, separate diagrams, or the
document body.

When the plan touches an existing app, inspect the current shell/components before
drawing. The first artboard should look like the real app at the same density:
existing sidebars, toolbar placement, overflow menus, and app chrome stay in their
real places. Model secondary surfaces as separate states — a top-right overflow
popover, sheet, panel, or loading state — rather than inventing a permanent
inspector or folding chrome into the product UI.

- **No visual surface** for architecture-only, backend-only, data migration,
  copy-only, or otherwise non-visual plans. Omit the top canvas and the tabs
  entirely — ship a document-only file. Do not use the top canvas for
  architecture diagrams, dependency maps, file plans, API contracts, or
  data-flow-only reviews. Use a strong document with local inline `pb-diagram`
  blocks only when relationships need a visual explanation, usually one spatial
  diagram per recommendation or decision. Prefer grouped regions, layers,
  quadrants, matrices, or before/after panels over a single-axis chain unless the
  relationship is truly sequential.
- **Canvas only** for one static screen, a before/after comparison, a component
  state, a small popover, or a visual direction that does not require clicking.
  Put those wireframes in the `Canvas` tab and omit the `Prototype` tab.
- **Canvas + prototype** for multi-step UI flows, onboarding, wizards,
  review/approval flows, navigation changes, or anything where the reviewer needs
  to operate the behavior. Keep the static wireframes in the `Canvas` tab, add the
  aligned lightweight prototype — static screens wired together with the
  template's inline vanilla JS — in the `Prototype` tab, and rely on the top tabs
  to switch between them.
- **Prototype-first** when the user asks to operate the UI or when interaction is
  the main question. Lead with the `Prototype` tab while still preserving static
  mocks where useful. The prototype stays a set of static screens plus light
  inline JS — never a separate app and never anything that loads from the network.

For mixed canvas + prototype plans, reuse the same real labels, app statuses, and
screen ids across both surfaces. The canvas is the inspectable static reference;
the prototype is the interactive version of that same flow, not a separate design
direction.

## Block catalog — read `references/blocks.md`

Every visual block is a `pb-*` class with a fixed HTML pattern: `pb-prose`,
`pb-callout` (variants `note` / `warn` / `decision` / `deferred`), `pb-diagram`
(inline SVG or CSS flow), `pb-file-tree`, `pb-code`, `pb-annotated-code`,
`pb-diff`, `pb-api`, `pb-data-model`, `pb-wireframe`, and the single bottom
`pb-open-questions`. Before filling the template's `<main>`, READ
`references/blocks.md` in this skill directory — it is the copy-paste library for
each block's exact markup. Do not invent block markup from memory.

## Wireframe quality — read `references/wireframe.md`

UI plan wireframes must meet a strict quality bar — full-width chrome, pinned
bottom bars, real product content, before/after comparability, the right surface
preset (`data-surface`), `--wf-*` tokens instead of hex, and no nested
`<html>`/`<head>`/`<style>`/font tags inside a screen. Before authoring ANY
wireframe / `pb-wireframe` screen, READ `references/wireframe.md` in this skill
directory — it is the single source of truth for HTML wireframe quality, shared
word for word with `/visual-recap`. Do not author wireframes from memory.

## Canvas — read `references/canvas.md`

The canvas is the single source of truth for static UI mockups: the surface locks
each artboard's footprint, mixed surfaces lay out in lanes, annotations are
plain-text designer notes anchored to a frame, and edits are surgical HTML edits.
Before authoring or editing ANY canvas, artboard, or annotation, READ
`references/canvas.md` in this skill directory — it is the single source of truth
for canvas/artboard mechanics. Do not author canvas layouts from memory. Canvas
artboards use the same `pb-wireframe` path as document-body wireframe screens:
author a `<div class="pb-wireframe" data-surface="...">` wrapping a semantic HTML
fragment.

## Document quality — read `references/document-quality.md`

The document is a serious technical plan, not marketing: outcome-first,
prose-first, self-contained, built from the right blocks, with open questions in a
single bottom `pb-open-questions` block and a pre-handoff visual check. Before
authoring the plan document, READ `references/document-quality.md` in this skill
directory — it is the single source of truth for the document quality bar. Do not
write the document from memory.

## Good vs. bad exemplar — read `references/exemplar.md`

For a worked example of the bar — a great UI-first visual plan, plus the
anti-patterns to avoid — READ `references/exemplar.md` in this skill directory
before authoring a plan.
