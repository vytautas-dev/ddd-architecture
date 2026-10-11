# Good vs. bad exemplar — single source of truth

This file is the canonical worked example of a great plan (and the anti-patterns
to avoid). Read it alongside the document-quality and canvas references before
authoring a plan; it is the bar these plans must clear.

<!-- SHARED-CORE:exemplar START -->

**GOOD.** A UI-first plan for a todo app: a Canvas tab with a `desktop`
`pb-wireframe` whose `pb-wf-screen` is a real flex layout — a sidebar of links
(`Inbox 12`, `Today 4`, `Done`), a main column with an `<h1>Today</h1>`, accent
`.wf-pill`s for the filters, a muted section label `OVERDUE`, and `.wf-card` task
rows carrying real titles, due dates, and a primary `button.primary` — styled only
through bare elements, helper classes, and `--wf-*` tokens, so the frame gets the
correct desktop footprint and theme. Plain-text designer notes sit spaced beside
the frame, pointing only at the controls that need explanation. In the Document
tab, a Claude/Codex-grade plan: objective and done-criteria, a few `pb-code`
blocks (each in sequence when more than one) showing the real shape of the
load-bearing files, a `pb-callout` with `data-tone="decision"` stating the chosen
approach with a before/after comparison weighing the two real options behind it,
and a validation step — none of it repeating the canvas. If the task also changes
a multi-step completion flow, the same top area includes a Prototype tab whose
screens use the same labels and states as the canvas artboards, stepped through
with in-page anchors or a small amount of inline interaction. This is the bar.

**GOOD.** A broad product-architecture plan opens with a plain recommendation and
one concrete app state before the abstraction. The first canvas artboard is pure
product UI that matches the current app shell; nearby plain-text notes explain the
user-visible delta. A separate `pb-diagram` below shows the mechanics, such as
file or data flow. The document then separates the reusable core from
app/provider adapters and examples, covers contracts, folder or schema shape
(`pb-data-model`), sync boundaries, roadmap, non-goals, a bottom
`pb-open-questions` block for unresolved decisions, and a verification section
with at least one realistic end-to-end smoke. A reviewer who was not in the chat
gets the idea from the top snapshot before reading the technical plan.

**GOOD.** A `/visual-plan` for a backend architecture review: document-only, so
the Canvas/Prototype tabs are deleted and only the Document remains. It opens with
context and a legend, then repeats recommendation sections: title,
confidence/category badges (a `pb-callout` or prose lead), a `pb-file-tree` of the
real file paths, one inline two-dimensional before/after or layered `pb-diagram`,
and terse Problem/Solution/Why bullets using the codebase's vocabulary. The
diagram uses space to show boundaries, layers, and ownership; it is not a default
left-to-right chain. The plan ends with a top recommendation and a bottom
`pb-open-questions` block only if the next architecture direction is genuinely
open. This is better than a top canvas because each diagram is local to the claim
it supports.

**BAD.** A `pb-wireframe` with hard-coded hex colors, a `font-family`, or a fixed
pixel width/height; gray placeholder bars "insinuating" text on a non-skeleton
frame; a forced desktop + mobile pair for a popover; floating bordered annotation
cards hugging the frames; a `box-shadow` or `drop-shadow` faking depth on a frame
or card; nested component wrappers the template cannot theme instead of plain semantic
HTML in `pb-wf-screen`; a multi-step UI flow with only static frames and no Prototype
tab; a mockup shoved into raw markup or a new `<style>` instead of a
`pb-wireframe`; and a marketing-style document with a hero heading and value props
that just restates what the canvas already shows. Also bad: an architecture-only
plan forced into a top canvas of labeled boxes with overlapping text, where the
actual code evidence and recommendations live elsewhere; a product wireframe that
mixes a real screen with repo names, file-contract arrows, architecture
explanations, or a made-up permanent inspector; and a plan that describes itself
as a revision of a prior conversation instead of a standalone proposal. Never
produce this.

<!-- SHARED-CORE:exemplar END -->
