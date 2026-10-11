# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`GLOSSARY.md`** at the repo root — single source of domain language for both bounded contexts (Auction, Watchlist). One `###` section per context; where a term means something different in the other context, or has a different name in code or persistence, the entry calls it out inline (e.g. _Watchlist sees this only as `isUpcoming`_, _Persisted as `watchlist_auction_catalog_view`_).
- **`docs/adr/`** — architectural decisions; read the ones that touch the area you're about to work in.
- **`ABOUT.md`** and **`PLAN.md`** — business-level description of the domain: what an auction is, its lifecycle, who can bid, what Watchlist is for. Read the relevant part **before** implementing or grilling anything that touches a business rule. `GLOSSARY.md` gives you the vocabulary, these files give you the behavior that vocabulary describes.

If `GLOSSARY.md` or `docs/adr/` don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The producer skill (`/grill-with-docs`) creates them lazily when terms or decisions actually get resolved.

## File structure

Single-context repo (one `GLOSSARY.md` covering both bounded contexts):

```
/
├── GLOSSARY.md                 ← ### Auction, ### Watchlist, ## Flagged ambiguities
├── ABOUT.md, PLAN.md           ← business/domain description
├── docs/adr/                   ← architectural decisions
└── src/
    ├── auction/
    ├── watchlist/
    └── shared/
```

`src/shared/` is shared infrastructure (event store, unit of work, command behaviors). Concepts that live there are described in `GLOSSARY.md` where they fit semantically.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `GLOSSARY.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/grill-with-docs`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because..._

## Code is the source of truth over `ABOUT.md` and `PLAN.md`

`ABOUT.md` and `PLAN.md` describe what the code is supposed to do, not a guarantee of what it actually does — they can drift out of date. When a claim there (a lifecycle state, a rule, a projection's behavior) conflicts with what the code actually does, trust the code, but don't silently go with it: surface the discrepancy to the user and propose a correction to the doc rather than quietly treating either the doc or the code as wrong.
