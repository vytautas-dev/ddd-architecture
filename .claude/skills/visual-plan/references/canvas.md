# Canvas & artboard placement — single source of truth

This file is the canonical guide for how the visual-plan canvas works in the
self-contained HTML build: where artboards live, how they are laid out, how
annotations attach, and how to keep canvas and prototype consistent. Read it in
full before authoring or editing any canvas/artboard content; do not author
canvas layouts from memory or paraphrase these rules per mode.

<!-- SHARED-CORE:canvas-surface START -->

**Where the canvas lives.** For UI plans, the canvas is the `Canvas` tab of the
template: `#panel-canvas > .pb-canvas-lane`. Each artboard is a
`pb-wireframe-wrap` frame placed as a direct child of the lane. The written plan
lives in the `Document` tab; a multi-step flow adds a `Prototype` tab. For
document-only plans, delete the `pb-tabs` nav and the Canvas + Prototype panels,
keep the Document panel, and drop wireframes inline where they are discussed.

**The surface rule.** The `data-surface` on each `pb-wireframe` locks its
footprint and aspect — never set width/height on a frame and never use absolute
coordinates or `x`/`y` positioning inside a wireframe. The `pb-canvas-lane` is a
flex row that wraps (`flex-wrap`) with a fixed `gap`, so it arranges frames
automatically: wide `desktop` / `browser` frames are full width and take their
own row, while compact `mobile`, `popover`, and `panel` frames sit side by side.
You control order and grouping simply by the order of the frames in the lane —
no coordinate system to reason about.

**Lay out mixed canvases as ordered groups, not one long strip.** When a canvas
mixes broad browser/desktop frames with compact popovers or panels, group them by
role instead of forcing everything into one horizontal line: the main flow first,
its compact sub-surfaces next, then loading/error states. The lane's `gap`
already reserves generous space between frames and their labels; do not try to
tighten it with negative margins. Keep each frame's `pb-wireframe-label` short
and on one line so neighboring labels never collide.

**Canvas annotations are plain-text designer notes beside the frame.** To explain
a frame, place a short note near it — a heading plus supporting text and bullets,
authored as a small `pb-prose` block (or a `pb-callout` when it is a genuine
risk/decision) as a sibling of the `pb-wireframe-wrap` in the lane, or directly
below the frame. Notes are plain text layers: never wrap a frame in a bordered or
shadowed card, and never draw a box around a frame. Write the note beside the
frame it describes so the pairing is obvious. Keep notes about the *plan* (file
contracts, mechanics, rationale) out of the product screen itself — the screen
stays pure product UI; the note carries the explanation.

**Show sequences by order, not by fake connectors.** There is no
connector-drawing renderer in the self-contained build. When frames form a real
sequence, communicate it two ways: order the frames left-to-right (or top-to-
bottom) in the lane and name each state with its `pb-wireframe-label`, and — when
the transition logic itself matters — add one `pb-diagram` (Style A CSS flow with
`pb-node`/`pb-arrow`) or a short note describing what moves the user from one
state to the next. Never invent "Step 1 → Step 2" arrows between independent
states that are not actually a sequence; only genuine, neighboring steps get a
flow.

**Never place a titled artboard with no interior content.** Every frame on the
canvas must carry a real `pb-wf-screen` with product content. A frame that is
only a `pb-wireframe-label` over an empty box is a defect — it reads as a blank
surface. If all you have is a title, write it as a section heading or an
annotation, not an empty artboard. When you remove a duplicate wireframe from the
document body, move its markup onto the canvas frame so the content survives in
exactly one place.

**UI mockups belong in the Canvas tab.** Static UI/product visuals live on the
canvas; multi-step UI flows get both canvas frames and a prototype. When the user
asks for a mockup, UI state, loading state, layout, screen, or visual comparison,
make the Canvas tab the primary home for that static visual. When the user asks
for a prototype or the plan contains a sequence the reviewer must feel, keep the
canvas frames and add screens to the `Prototype` tab so the reviewer can step
through them. Architecture/code diagrams stay inline in the Document as
`pb-diagram` blocks (the SKILL.md Visual Surface Choice section owns that rule)
unless the user explicitly asks for a spatial board. Document blocks can explain,
compare, or map implementation, but they should not host the primary UI mockup.
A skeleton/loading mockup also lives in a canvas frame — never move a mockup out
of the canvas into prose.

**Storyboards are canvas artifacts, not document diagrams.** When the requested
output is a product flow, onboarding journey, "light storyboard", or canvas
wireframe, author the flow as multiple canvas frames with real screen content
placed as ordered neighbors. Keep document-body `pb-diagram` blocks for
architecture and mechanics that are not themselves user-visible screens. A
storyboard made from a single inline diagram is the wrong surface.

For abstract product concepts, use the canvas to create the first "I get it"
moment: one real app state near the top of the lane showing how the concept
appears to a user, followed by separate annotations or a `pb-diagram` for
mechanics. Do not make the first frame a hybrid of app UI and architecture notes;
the app screen should be inspectable as product UI on its own.

**Keep canvas and prototype labels consistent.** When a flow appears both as
canvas frames and as `Prototype` screens, use the same state names and the same
labels across both surfaces, so a reviewer moving between tabs recognizes each
step. Reproduce the same real content and controls; the prototype adds sequencing
(via in-page anchors or a small amount of inline JS), not a different design.

**Write plain semantic HTML inside every frame.** A canvas frame's body is the
`pb-wf-screen` root filled with real layout per `wireframe.md` — bare elements,
`.wf-*` helper classes, `--wf-*` tokens, inline flex/grid. Do not invent nested
component wrappers or import any component kit; there is nothing to render them.
The plain-HTML path is what gets the correct surface footprint, theme tokens, and
safe text layout. Editing a frame is a direct text edit to that markup in the
plan file, then re-open in the browser — there is no patch tool and no separate
canvas source file to normalize.

<!-- SHARED-CORE:canvas-surface END -->
