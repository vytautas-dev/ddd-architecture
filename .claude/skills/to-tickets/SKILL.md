---
name: to-tickets
description: Break a plan, spec, or the current conversation into a set of tracer-bullet tickets, each declaring its blocking edges, published to the configured tracker — edges as text in one file per ticket locally, or native blocking links on a real tracker.
disable-model-invocation: true
---

# To Tickets

Break a plan, spec, or conversation into a set of **tickets** — tracer-bullet vertical slices, each declaring the tickets that **block** it.

The issue tracker and triage label vocabulary should have been provided to you — run `/setup-matt-pocock-skills` if not.

## Process

### 1. Gather context

Work from whatever is already in the conversation context. If the user passes a reference (a spec path, an issue number or URL) as an argument, fetch it and read its full body and comments.

If the source is a `/to-spec`-produced spec, it ends with a **`## Acceptance Criteria`** section (deliberately not called "User Stories" — that name means something else upstream, and collides with this repo's Jira Story issue type) — a long, exhaustive checklist, not a short set of headline goals. Treat it as the coverage checklist: when drafting tickets in Step 3, cross-check that every criterion is addressed by at least one ticket, and don't skip it just because it's at the bottom of the doc rather than the top.

### 2. Explore the codebase (optional)

If you have not already explored the codebase, do so to understand the current state of the code. Ticket titles and descriptions should use the project's domain glossary vocabulary, and respect ADRs in the area you're touching.

Look for opportunities to prefactor the code to make the implementation easier. "Make the change easy, then make the easy change."

### 3. Draft vertical slices

Break the work into **tracer bullet** tickets.

<vertical-slice-rules>

- Each slice cuts a narrow but COMPLETE path through every layer (schema, API, UI, tests) — vertical, NOT a horizontal slice of one layer
- A completed slice is demoable or verifiable on its own
- Each slice is sized to fit in a single fresh context window
- Any prefactoring should be done first
- **Diff cap: ~800 lines changed, target ~500.** Estimate the diff size of each slice before presenting it (weigh file count, how mechanical vs. novel the change is, and comparable past changes in this codebase). Treat 800 as a hard ceiling, not a target to aim for — a slice you estimate above it must be split further, no exceptions for "it's all one logical change." When a slice is close to the cap, split it rather than round down the estimate.
- **Prefer more, smaller slices over fewer, larger ones — but line count is a ceiling, not something to minimize.** Given a choice between e.g. 20 slices × ~500 lines and 5 slices × ~2000 lines, take the former — smaller slices review faster, fail smaller, and unblock the frontier sooner. But a slice's size is set by where a COMPLETE vertical cut naturally ends, never by chopping a complete slice into smaller incomplete fragments just to lower the line count. 20 tickets × ~20 lines each is not the goal — that's noise, not slicing, and each one likely fails the "demoable/verifiable on its own" test above. When in doubt, split along a genuine seam (a new schema field, a new endpoint, a new UI state) — never split just to hit a smaller number.

</vertical-slice-rules>

Give each ticket its **blocking edges** — the other tickets that must complete before it can start. A ticket with no blockers can start immediately.

**Wide refactors are the exception to vertical slicing.** A **wide refactor** is one mechanical change — rename a column, retype a shared symbol — whose **blast radius** fans across the whole codebase, so a single edit breaks thousands of call sites at once and no vertical slice can land green. Don't force it into a tracer bullet; sequence it as **expand–contract**. First expand: add the new form beside the old so nothing breaks. Then migrate the call sites over in batches sized by blast radius (per package, per directory) — the same ~800-line cap applies here too, so a package with a huge blast radius gets split into multiple migrate batches rather than one oversized ticket — each batch its own ticket blocked by the expand, keeping CI green batch to batch because the old form still exists. Finally contract: delete the old form once no caller remains, in a ticket blocked by every migrate batch. When even the batches can't stay green alone, keep the sequence but let them share an integration branch that all block a final integrate-and-verify ticket — green is promised only there.

### 4. Quiz the user

Present the proposed breakdown as a numbered list. For each ticket, show:

- **Title**: short descriptive name
- **Blocked by**: which other tickets (if any) must complete first
- **What it delivers**: the end-to-end behaviour this ticket makes work
- **Est. diff size**: your rough line-count estimate (e.g. `~300 lines`), flagged if it's near or over the 800-line cap, or suspiciously small (under ~100 lines)

Ask the user:

- Does the granularity feel right? (too coarse / too fine)
- Are the blocking edges correct — does each ticket only depend on tickets that genuinely gate it?
- Should any tickets be merged or split further?
- Any ticket estimated near or over the 800-line cap — split it now, or does the estimate hold?
- Any ticket estimated suspiciously small — is it still a genuinely complete, demoable slice, or a fragment that should merge back into a neighbor?

Iterate until the user approves the breakdown.

### 5. Publish the tickets to the configured tracker

Publish the approved tickets. **How** depends on the tracker `/setup-matt-pocock-skills` configured — the tickets are the same either way, only the shape of the blocking edges changes:

- **Local files** → write one file per ticket under `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01` in dependency order (blockers first). Each file's "Blocked by" lists the numbers/titles it depends on. Use the per-ticket file template below — one ticket per file, never a single combined file.
- **A real issue tracker (GitHub, Linear, …)** → publish one issue per ticket in dependency order (blockers first) so each ticket's blocking edges can reference real identifiers. Use the platform's native blocking / sub-issue relationship where it has one; otherwise set each ticket's "Blocked by" to the blocking issues. Apply the `ready-for-agent` triage label unless instructed otherwise — the tickets are agent-grabbable by construction.

Work the **frontier**: any ticket whose blockers are all done. For a purely linear chain that means top to bottom.

Do NOT close or modify any parent issue.

<local-ticket-template>

# <NN> — <Ticket title>

**What to build:** the end-to-end behaviour this ticket makes work, from the user's perspective — not a layer-by-layer implementation list.

**Blocked by:** the numbers/titles of the tickets that gate this one, or "None — can start immediately".

**Est. diff size:** the line-count estimate from Step 4, so whoever picks this up knows if their implementation is drifting past scope.

**Status:** ready-for-agent

- [ ] Acceptance criterion 1
- [ ] Acceptance criterion 2

</local-ticket-template>

<issue-template>

## Parent

A reference to the parent issue on the tracker (if the source was an existing issue, otherwise omit this section).

## What to build

The end-to-end behaviour this ticket makes work, from the user's perspective — not layer-by-layer implementation.

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2

## Blocked by

- A reference to each blocking ticket, or "None — can start immediately".

## Est. diff size

The line-count estimate from Step 4, so whoever picks this up knows if their implementation is drifting past scope.

</issue-template>

In either form, avoid specific file paths or code snippets — they go stale fast. Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it and note briefly that it came from a prototype. Trim to the decision-rich parts — not a working demo, just the important bits.
