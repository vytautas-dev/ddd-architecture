# HTML wireframe quality — single source of truth

This file is the canonical quality bar for the `pb-wireframe` screen mockups,
shared word for word by `/visual-plan` and `/visual-recap`. Read it in full
before authoring ANY wireframe; do not author wireframes from memory or
paraphrase these rules per command.

<!-- SHARED-CORE:wireframe-quality START -->

**A wireframe is an HTML mockup. The template's design system owns the look; you
write the content.** Build the screen as a `<div class="pb-wireframe"
data-surface="…">` with a single `pb-wf-screen` root inside that owns padding and
fills the frame. The template's inline CSS owns the surface footprint, the
dark/light theme via `--wf-*` tokens, and the flat bordered frame. There is no
sketch overlay and no hand-drawn font in the self-contained build — wireframes
render as clean, flat, bordered surfaces. You never write `<html>`, `<head>`,
`<body>`, `<style>`, `<script>`, or external `<link>`/font tags, and you never
set width/height on the frame. You write real semantic layout and real product
content; the tokens theme it.

**A wireframe is a screen root plus a surface:**

```html
<div class="pb-wireframe-wrap">
  <div class="pb-wireframe-label">Sign in</div>
  <div class="pb-wireframe" data-surface="browser">
    <div class="pb-wf-browserbar">
      <span class="pb-wf-dots"><i></i><i></i><i></i></span>
      <span class="pb-wf-url">app.acme.co/signin</span>
    </div>
    <div class="pb-wf-screen">
      <h1>Sign in</h1>
      <p class="wf-muted">Use your work email to continue.</p>
      <div class="wf-card" style="display:flex;flex-direction:column;gap:10px">
        <label>Email<input value="jane@acme.co" /></label>
        <label>Password<input type="password" value="••••••••" /></label>
        <label style="display:flex;align-items:center;gap:8px"><input type="checkbox" checked /> Remember me</label>
        <button class="primary">Sign in</button>
      </div>
      <a href="#">Forgot password?</a>
    </div>
  </div>
</div>
```

**Write PLAIN semantic HTML and let the tokens style it.** Bare elements
(`h1`/`h2`/`h3`, `p`, `button`, `input`, `<input type="checkbox">`, `select`,
`textarea`, `label`, `a`, `small`, `hr`) are auto-themed — no classes needed.
Helper classes carry the rest:

- `.wf-card` / `.wf-box` — a bordered, padded container (a panel, a list item).
- `.wf-pill` / `.wf-chip` — a rounded tag or filter; add `.accent`
  (`<span class="wf-pill accent">`) for the accent-filled variant.
- `.wf-muted` — secondary/muted text (or use `<small>`).
- `button.primary` or any element with `[data-primary]` — the accent-filled
  primary button.

**No decorative shadows around mockups.** Do not put `box-shadow`, `filter:
drop-shadow(...)`, or other fake depth effects on a wireframe frame, root
container, `.wf-card` / `.wf-box`, or canvas artboard. Mockups read as flat,
bordered surfaces; use spacing, borders, labels, and annotations for separation.
Only show a shadow when the real product UI already has that shadow and it is
essential to the change being reviewed.

**Draw icons inline; never print visible icon words.** There is no icon renderer
in the self-contained build. For icon-only buttons or leading icons inside
fields, chips, menu items, and toolbars, write an inline SVG and add
`class="wf-icon"` — it sizes to the surrounding text and inherits color:

```html
<span class="wf-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg></span>
```

Do not put visible words like "search", "mail", "lock", "chevron", or "more"
where the product UI would show an icon; use text only when it is a real label a
user would read.

**Use the `--wf-*` tokens for any custom color, never hex.** The template flips
these on light/dark, so referencing them is what keeps a mockup correct in both
themes. For any inline border, background, or text color, reference a token:
`style="border:1.4px solid var(--wf-line)"`. The tokens are `--wf-ink` (text),
`--wf-muted` (secondary text), `--wf-line` (borders/dividers), `--wf-paper`
(page background), `--wf-card` (container surface), `--wf-accent` /
`--wf-accent-fg` / `--wf-accent-soft` (brand action), `--wf-warn`, `--wf-ok`,
and `--wf-radius`. Never hard-code a hex/rgb/hsl color and never set
`font-family` — the template owns the type.

**Never hard-code colors or use utility color classes in wireframe HTML.**
Classes such as `bg-white`, `bg-zinc-50`, `bg-slate-950`, `text-zinc-950`,
`text-slate-400`, `border-zinc-200`, `shadow-xl`, or arbitrary color utilities
like `bg-[#fff]` pin a single palette into the mockup and make dark-mode canvas
frames unreadable. Use bare semantic elements, `.wf-*` helper classes, and
`--wf-*` color tokens instead. Before finishing, scan every wireframe `class` and
`style` attribute: if a class or inline value sets background, text, border,
ring, fill, stroke, gradient, placeholder, decoration, or shadow color, rewrite
it to `--wf-*` tokens or remove it. Layout-only inline flex/grid styles are the
safe, reviewable way to position things.

**Use literal CSS lengths for spacing.** The `--wf-*` tokens are for colors and
`--wf-radius`, not layout spacing — there are no `--wf-space-*` tokens. Do not
use guessed spacing tokens such as `var(--wf-space-4)` or theme spacing
variables inside wireframe HTML; if a token is unavailable, padding collapses and
content hugs the border. Use explicit CSS lengths for layout: `padding:16px`,
`gap:12px`, `margin-top:18px`, `minmax(0,1fr)`.

**Lay out with inline `style` flex/grid.** You write the real layout —
`display:flex; flex-direction:column; gap:10px; padding:16px` and so on. Compose
the actual product: reproduce the current screen, then show the modification.
Real labels, real counts, real dates, real button text grounded in the screen you
read; not lorem or gray bars.

**Surface presets — match the real footprint, never default to desktop+mobile.**
Set `data-surface` to what the user will actually see:

- `browser`: a web page that needs a browser chrome frame around it (use the
  `pb-wf-browserbar` header).
- `desktop`: a full desktop app page or app shell.
- `tablet`: a tablet-width layout when that width is the point.
- `mobile`: a phone screen, only when the work is genuinely mobile.
- `popover`: a small floating menu, dropdown, or inline popover.
- `panel`: a side panel, inspector, or sidebar widget.

A sidebar popover renders as a small surface, not a desktop page and a phone
frame. Do not emit `desktop` + `mobile` variants unless responsive behavior
actually changes the layout. For a component or widget, show one broader
app-context frame only when placement affects understanding, then the focused
component states.

**Model the actual component shell for small surfaces.** A rendered UI change
belongs in a `pb-wireframe`; reserve `pb-diagram` for architecture, dependency,
state, or data-flow relationships. Popovers, dropdown menus, command palettes,
and context menus use `data-surface="popover"` unless the surrounding page
placement is the point of the change. Dialogs, sheets, inspectors, sidebars, and
long property panels use the matching `panel` / `desktop` surface. Show the real
chrome: trigger or anchor when it matters, title/header row, top-right actions,
separators, fields, options, selected states, body content, and footer actions
that are visible in the workflow.

**Modify, don't redesign.** When the task changes an existing screen, reproduce
the current screen's real layout and footprint FIRST, then change only the delta
and call it out with a single annotation. Do not restack the page into a new
layout. For net-new surfaces, compose from the real app shell. Inspect the actual
app components before drawing an existing product: sidebar density, toolbar
actions, overflow menus, property panels, and framework chrome should match the
product unless the plan intentionally changes them.

**Keep product screens pure.** A product wireframe shows the app state a user
would actually see. Do not embed file contracts, architecture arrows, repo pills,
mode explanations, or implementation callouts inside the screen just to explain
the plan. Put those in canvas annotations, a separate `pb-diagram`, or the
document body. Secondary UI such as properties, history, sync, export, or agent
controls should appear where the real product would put them: an overflow
popover, sheet, panel, or separate framework sidebar state, not a generic
permanent right inspector unless that inspector is the actual design.

**Classify mockup scope before implementation.** Before turning a plan mockup
into source code, decide whether each artboard represents the whole page/app
shell, a route body inside an existing shell, or a component/sub-surface. If an
artboard includes navigation, sidebars, auth banners, or a signup/login form, map
those pieces to the real shared shell/auth components instead of nesting the
entire mockup inside the current page. When a mockup references the product's
standard signup/login page, find and reuse that existing implementation; do not
approximate it from the wireframe.

**Zoom in on sub-surfaces, don't redraw the page.** For a small sub-surface (a
popover, menu, dialog, toast), show the full screen once, then add a small
separate frame whose body contains ONLY that sub-surface — do not re-draw the
whole page around it, and do not scale a duplicate up. Pick the matching
`data-surface` (e.g. `popover`) so the footprint is right; never widen a popover
to page width.

**Loading / skeleton states.** Build the skeleton by filling `pb-wf-screen` with
neutral, textless placeholder geometry — boxes and bars built as `<div>`s with
`background:var(--wf-line)` and explicit heights/widths, no labels or copy. Keep
the same surface and footprint as the loaded state so the two are comparable.
Never escape to raw markup or a new `<style>` to fake a loader.

**Editing an existing mockup.** To change one element, text, or color, edit the
HTML for that `pb-wireframe` directly in the plan file and re-open it in the
browser — there is no patch tool and no regenerate step. Because the whole plan
is one self-contained file, a surgical text edit to the screen markup is the
whole workflow.

**The frame is always drawn.** Every `pb-wireframe` renders with its bordered
frame and surface footprint from the template CSS — there is no frame on/off
toggle. When a boundary is already supplied by surrounding chrome (a `pb-diagram`
supplies its own container; the canvas lane spaces frames apart), you do not add
another border of your own; keep the screen body clean and let the frame contain
it.

**Inner padding and borders still matter.** The `pb-wf-screen` root already
supplies real inner padding (16px) and `height:100%`, so the first row never
sits flush against the screen edge. Keep the same discipline inside: give nested
cards, fields, pills, labels, and controls at least 12–16px of padding,
`box-sizing:border-box`, and `gap` between rows. Keep text away from borders:
every container, field, button, menu item, and annotation needs enough padding
and line-height to read cleanly in the rendered view.

**For feature-cloud or abundance visuals, optimize the composition over
line-by-line reading.** Some marketing/product sections need to feel like a large
surface area of capability rather than a precise app workflow. In those cases,
use one padded root with a short headline and a dense, aesthetic cloud of short
feature labels, chips, rings, or columns. Vary scale and opacity with tokens,
cluster by meaning, and let many labels be glanceable rather than individually
essential. Do not force dozens of features into equal cards with long wrapped
sentences; that usually creates a messy unreadable mockup.

**Lay out children safely so they never collide.** Use HTML flex/grid with
`gap`, `min-width: 0`, and sensible overflow. Avoid negative margins, absolute
positioning, or fixed child widths that can collide when the theme switches
between light/dark or at different zoom levels.

**Do not wrap intentionally single-line labels.** For toolbars, tab rails,
breadcrumbs, chip/filter rows, branch and file names, file chips, and code
filenames — any deliberately single-line row — do not let long text wrap. Put
`white-space: nowrap` on the row (and `overflow: hidden; text-overflow: ellipsis`
on the individual labels that can grow), so the wireframe demonstrates the actual
layout behavior instead of producing ugly stacked or vertical text. Use
horizontally scrollable or clipped rails for overflow.

**Fill the frame; keep labels short.** Each artboard is a fixed-size surface —
compose enough realistic HTML to fill it top to bottom with even vertical rhythm;
never leave a large empty band. On desktop/app-shell sidebars, let the nav stack
flex to fill (`flex:1`) and add any persistent bottom action/status after it so
the rail reads complete in taller frames. On mobile especially, flow real rows
down the whole screen (status bar, header, then list/detail content) rather than
a header floating above a gap. Keep every label short enough to sit on one line
within its column — shorten the copy rather than relying on the frame to absorb
it (long labels wrap or clip).

**Persistent chrome bars span the full frame width.** Top bars, app headers,
toolbars, and bottom tab/nav bars are full-width chrome, not centered content.
Lay each one out as a single flex row that fills the frame
(`style="display:flex;align-items:center;width:100%"`) and push trailing actions
to the right edge with a flex spacer (`<div style="flex:1"></div>`) between the
leading group and the trailing group — never center a bar inside a narrow,
centered block, and never let it collapse to the width of its contents. In a
Before/After pair the bar stays full-width in BOTH states even when one state has
fewer controls; the spacer absorbs the difference so the remaining controls hold
their edge alignment instead of sliding to the center.

**Pin bottom bars to the bottom of the frame.** The `pb-wf-screen` root is
already a `height:100%` flex column, so for a mobile tab bar, footer, or any
persistent bottom action row, give the scrolling body `flex:1` to absorb the
slack and place the bar as the LAST child of the screen (or set
`margin-top:auto` on it). The bar then sits flush at the bottom of the surface
instead of floating directly under the content with an empty band beneath it.

**Before / after must be comparable.** When showing a state change, preserve the
unchanged controls in both states so the reviewer can see exactly what moved or
appeared; do not show an added control as a generic box floating elsewhere in the
surface. Place the new/changed affordance where the implementation puts it — for
example, a new `Edit with AI` action in a popover header belongs in the top-right
header slot, aligned with the title, not in the body or footer. Use the same
surface, scale, outer padding, border radius, and visual density on both sides
unless the change itself alters those properties, and let the content fill the
frame rather than leaving a tall empty lower half.

**Name the states with the frame label, never inside the frame.** Put each state
in its own `pb-wireframe-wrap` and set the `pb-wireframe-label` above the frame to
`Before` / `After` (or the state name). Do NOT bake a `Before`/`After` pill,
title, or heading into the screen body: a label placed inside reads as part of
the product UI, lands in a random corner, and clutters the comparison. The
`pb-wireframe-label` is the one and only place the state name belongs. On a
canvas, place the two state frames as neighbors, each with its own label.

**Let the surface choose side-by-side vs. stacked.** Place a before/after pair as
neighboring `pb-wireframe-wrap` frames inside the same `pb-canvas-lane` (or inline
in the document). Narrow surfaces (`mobile`, `popover`, `panel`) sit side by side;
wide surfaces (`desktop`, `browser`) are full width and naturally take their own
row, so a large frame is never crushed into a half-width column and cropped.
Author both wireframes with the real `data-surface` and matching `Before`/`After`
labels; do not hand-stack the pair or duplicate the state name as body content.

**Good example — a contacts list, surface `browser`.** A small, real screen
composed from the helper classes and tokens, layout in inline flex, no fonts or
hex colors:

```html
<div class="pb-wireframe-wrap">
  <div class="pb-wireframe-label">Contacts</div>
  <div class="pb-wireframe" data-surface="browser">
    <div class="pb-wf-browserbar">
      <span class="pb-wf-dots"><i></i><i></i><i></i></span>
      <span class="pb-wf-url">app.acme.co/contacts</span>
    </div>
    <div class="pb-wf-screen">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <h1>Contacts</h1>
        <button class="primary">New contact</button>
      </div>
      <div style="display:flex;gap:6px">
        <span class="wf-pill accent">All 128</span>
        <span class="wf-pill">Favorites</span>
        <span class="wf-pill">Archived</span>
      </div>
      <div class="wf-card" style="display:flex;flex-direction:column;gap:0;padding:0">
        <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1.4px solid var(--wf-line)">
          <div style="width:32px;height:32px;border-radius:999px;background:var(--wf-accent-soft)"></div>
          <div style="flex:1"><strong>Jane Cooper</strong><br /><small>jane@acme.co</small></div>
          <span class="wf-pill">Lead</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px;padding:10px 12px">
          <div style="width:32px;height:32px;border-radius:999px;background:var(--wf-accent-soft)"></div>
          <div style="flex:1"><strong>Marcus Lee</strong><br /><small>marcus@globex.io</small></div>
          <span class="wf-pill">Customer</span>
        </div>
      </div>
      <div style="flex:1"></div>
      <small>128 contacts · 4 archived</small>
    </div>
  </div>
</div>
```

<!-- SHARED-CORE:wireframe-quality END -->
