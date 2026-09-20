---
name: to-spec
description: Turn the current conversation into a spec and publish it to the project issue tracker — no interview, just synthesis of what you've already discussed.
disable-model-invocation: true
---

This skill takes the current conversation context and codebase understanding and produces a spec (you may know this document as a PRD). Do NOT interview the user — just synthesize what you already know.

The issue tracker and triage label vocabulary should have been provided to you — run `/setup-matt-pocock-skills` if not.

## Process

1. Explore the repo to understand the current state of the codebase, if you haven't already. Use the project's domain glossary vocabulary throughout the spec, and respect any ADRs in the area you're touching.

2. Sketch out the seams at which you're going to test the feature. Existing seams should be preferred to new ones. Use the highest seam possible. If new seams are needed, propose them at the highest point you can. The fewer seams across the codebase, the better - the ideal number is one.

Check with the user that these seams match their expectations.

3. If the feature involves a frontend calling the backend, draw the request/response flow as a Mermaid `sequenceDiagram` and write out the actual response contract (real field names and types, not just the diagram) under **BE-FE Contract**. Same format used across `docs/diagrams/` (one section per endpoint/action, method+path, the diagram, a `**Response:**` line). Skip this for backend-only or non-visual changes. If any type name in the contract is genuinely undecided, don't publish with `ready-for-agent` yet — resolve it first (step 5 covers this).

4. Sketch the **File Tree** — every file you expect this feature to touch, tagged `(add)`/`(modify)`/`(delete)`, same convention `/implement` uses for its own per-ticket plan. This one is feature-level and indicative — `/to-tickets` will slice it, and each ticket's own `/implement` run will re-derive the real tree against live code rather than trust this one blindly. Mark anything you're not sure about with `add?`/`modify?`/`delete?`.

5. **Default to one spec covering both frontend and backend.** Only split into two separate GitHub Issues (one FE-scoped, one BE-scoped, cross-linked) when whoever's driving this session genuinely can't cover one side well — e.g. a backend-focused session where the frontend implications would otherwise be guessed at rather than known. Don't split by default just because the codebase has an FE/BE separation; the team is cross-functional enough that one spec is the happy path.

6. **Check each Implementation Decision against the ADR bar.** A decision needs an ADR when all three hold: hard to reverse, surprising without context, the result of a real trade-off. If one qualifies, either write the ADR now (via `/domain-modeling`'s discipline) and link it from the decision, or note explicitly in the spec that it was assessed and doesn't warrant one — don't leave it silently unaddressed.

7. **Before publishing, confirm nothing in the spec is still open.** A spec that's genuinely `ready-for-agent` has no unresolved names, no "TBD" in the contract, no decision left as a bare assumption without a one-line justification. If something is legitimately still blocked on an external dependency (a client decision, a pending design), mark it `BLOCKED` explicitly with what it's waiting on and what ships as a follow-up slice — don't silently leave a gap or quietly defer more than what's actually blocked. Separately, if you made a judgment call you're not fully certain about — not blocked on anyone, just a call that could go either way — put it in **Open Questions** rather than silently picking one side; that's what invites a reviewer to actually engage in the GitHub Issue comments instead of rubber-stamping.

8. Write the spec using the template in [TEMPLATE.md](TEMPLATE.md), then publish it to the project issue tracker. Apply the `ready-for-agent` triage label - no need for additional triage.

9. If the spec touches a hard-to-reverse decision (new data model, new external integration, an auth/ownership boundary, a public API contract) or is otherwise dense, actively recommend `/visual-plan` rather than a passing mention — say why it'd help this specific spec, not just "want a visual pass?". Still the user's call; don't run it unasked.
