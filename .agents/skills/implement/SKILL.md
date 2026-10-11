---
name: implement
description: "Implement a piece of work based on a spec or set of tickets."
disable-model-invocation: true
---

# Implement

## Process

### 1. Gather context

Read the spec or tickets described by the user in full. If they reference other tickets (blocking edges) or a spec, fetch those too — don't start from a partial picture. Use the project's domain glossary vocabulary and respect any ADRs in the area you're touching.

If the user's request has no ticket/spec reference at all, say so plainly before continuing — e.g. "No spec or ticket linked, going straight to a file tree plan for this." Not a blocker, just visibility: for a genuinely small or well-understood change that's fine, but it means `/grill-with-docs`/`/to-spec` got skipped, and the user should know that's happening rather than discover it later.

### 2. Plan the file tree — before writing any code

Scope has to be visible before it's built. Walk the codebase enough to know exactly which files this piece of work touches, then present a **file tree plan** — an actual directory tree, not a flat list, with each touched file tagged `(add)`, `(modify)`, or `(delete)`. Untouched files/directories that just provide path context can appear bare, or be collapsed with `...`:

```markdown
## File tree plan

src/auction/
├── api/
│   └── auctionRouter.ts                   (modify — new GET /auctions/:id/bids route)
├── application/
│   └── GetAuctionBidsHandler.ts           (add — query handler reading the read model)
└── infrastructure/
    ├── BidHistoryProjection.ts            (add — builds bid_history_view from BidPlaced)
    └── BidHistoryProjection.test.ts       (add — projection test)
prisma/
└── schema.prisma                          (modify? — bid_history_view table, tbc)
src/auction/application/
└── GetAuctionsHandler.ts                  (delete — superseded by GetAuctionBidsHandler)
```

Every touched file gets a tag and a one-line reason, even ones you're not fully sure about yet — mark those `add?`/`modify?`/`delete?` rather than omitting them. Don't propose interfaces or write implementation code at this stage; this is scope, not design.

Show the plan to the user and wait for confirmation before proceeding. If they push back on scope (too wide, missing a file, touching something it shouldn't), revise and re-present — don't silently narrow or widen it yourself.

**If the ticket touches the Prisma schema or any database migration**, don't stop at the file tree — add before writing any migration files:

- **Schema design** — an ASCII table or ER-style diagram showing the columns/relations being added, changed, or removed (not the full existing schema, just the delta).
- **Migration plan** — the up migration and its rollback, in prose or SQL sketch, not just "add the column."

Present this alongside the file tree plan and wait for the same confirmation before continuing.

### 3. Implement

Call the Skill tool with `tdd` where possible, at pre-agreed seams, using the project's domain glossary vocabulary. If a file you're touching wasn't in the approved plan, stop, revise the file tree plan to include it, and get it re-confirmed before continuing — the same gate as Step 2, not a one-line flag to work around.

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

### 4. Review

Once done, call the Skill tool with `code-review` to review the work.

### 5. Get approval — before committing

Show the user the diff (or a summary of it) and the `code-review` findings, then stop and ask explicitly: "Do you approve these changes?" Wait for yes/no — do not commit on the assumption that a clean review implies approval.

- **Yes** → proceed to Step 6.
- **No** → find out what's wrong, fix it, and ask again. Don't guess at a fix and re-ask without addressing what they flagged.

### 6. Commit

Commit your work to the current branch.
