# to-spec template

<spec-template>

<!--
Header block — a table, `Field | Value` header. Omit rows with nothing to link:

| Field | Value |
|---|---|
| **Jira story** | <link> |
| **Design** | <Figma file + frame link(s)> |
-->

## 📋 Problem Statement

The problem that the user is facing, from the user's perspective.

## 💡 Solution

The solution to the problem, from the user's perspective.

## 🎯 Goals

A SHORT list (3-6) of genuine user-facing goals — things a person would actually say they want, not implementation details or testable invariants (those belong in Acceptance Criteria, at the bottom). Format:

1. As an <actor>, I want a <feature>, so that <benefit>

<goal-example>
1. As a mobile bank customer, I want to see balance on my accounts, so that I can make better informed decisions about my spending
</goal-example>

If you're reaching for more than ~6, most of what you're about to add is probably an Acceptance Criterion wearing a Goal's format — put it there instead.

---

## ⚙️ Implementation Decisions

A numbered table of implementation decisions — `# | Decision` — not prose. This makes decisions scannable and lets later sessions reference "decision #6" unambiguously. Can include:

- The modules that will be built/modified
- The interfaces of those modules that will be modified
- Technical clarifications from the developer
- Architectural decisions
- Schema changes
- API contracts
- Specific interactions

If an RFC exists for this feature, note here that these decisions amend it where they differ, and which RFC sections are superseded.

Do NOT include specific file paths or code snippets in this table. They may end up being outdated very quickly.

Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it within the relevant decision and note briefly that it came from a prototype. Trim to the decision-rich parts — not a working demo, just the important bits.

Mark any decision still waiting on something external as `🚧 BLOCKED, pending <what>` rather than silently deferring it or hiding it in Out of Scope.

**Table formatting**: keep the `#` column's separator to a single dash (`|-|`) and stretch the `Decision` column's dashes long (`|------...------|`) — some renderers use the dash ratio as a width hint, and a numeric column should never visually compete with the sentence next to it.

### 🔗 BE-FE Contract (when the feature has a frontend-backend flow)

The Mermaid sequence diagram from Step 3, plus the actual response/request shape (real field names and types — a code block, not prose). No "TBD" or "final names to be settled" left in here once the spec is published as `ready-for-agent` — resolve it or mark the specific field `🚧 BLOCKED`.

### 🗂️ File Tree

The feature-level file tree from Step 4 — `(add)`/`(modify)`/`(delete)` tags, `?` suffix for anything uncertain. Indicative, not binding; `/to-tickets` and each ticket's own `/implement` run are what actually slice and verify it.

### 🎨 Design → Component Mapping (only if a Figma design exists)

A table: design element (with Figma frame/node reference) → the component or code area that implements it. Skip this section entirely if there's no design to map.

---

## 🧪 Testing Decisions

A list of testing decisions that were made. Include:

- A description of what makes a good test (only test external behavior, not implementation details)
- Which modules will be tested
- Prior art for the tests (i.e. similar types of tests in the codebase)
- Whether e2e coverage applies here, and if not, say so explicitly rather than leaving it unmentioned

## 🚫 Out of Scope

A description of the things that are out of scope for this spec. Distinct from a `🚧 BLOCKED` decision (which ships later, off this same effort) — Out of Scope means it was never in scope to begin with.

## 🔒 Security & Access

Auth/role/RLS implications, if any. If nothing changes here, write **`N/A`** and stop — don't pad it into a paragraph explaining why it's fine. Only write real content when there's an actual implication to flag (a new access surface, a relaxed or tightened rule, something a reviewer should specifically check).

## ⚡ Performance & Scale

Expected data volume, whether an existing query/aggregation pattern already handles it, anything that could degrade at scale. If nothing changes here, write **`N/A`** and stop — same rule as above, no justifying paragraph for a non-issue.

## ❓ Open Questions

Judgment calls the spec author made but isn't fully certain about — different from `🚧 BLOCKED` (waiting on someone external) and different from Out of Scope (deliberately excluded). This is "I made a call here, sanity-check it" — invites reviewers to actually comment on the GitHub Issue rather than silently approve. If every decision above is genuinely settled with no doubt, write **`None — all decisions resolved`** rather than manufacturing a question.

## 📎 References

Links to prior art — a similar past ticket, PR, or feature this one mirrors or reuses. Prefer a real link (PR number, commit, ticket key) over a prose description ("mirrors the monthly view") — a link lets whoever implements this actually diff against it.

## 📝 Further Notes

Any further notes about the feature.

---

## ✅ Acceptance Criteria

A LONG, exhaustive checklist covering all aspects of the feature — this is deliberately not called "User Stories": that name means something different upstream (mattpocock/skills, and `/to-tickets` reads it as such) and collides with this repo's Jira **Story** issue type. This section is the coverage checklist — rules, edge cases, what must NOT happen — not user-facing desires (those are in Goals, above, and stay short).

**Format as checkboxes, grouped under `###` sub-headings by theme** (e.g. "Data & Inclusion Rules", "Collapse & Layout Behavior", "Roles & Read-Only"), not one flat numbered list — a 15-item flat list is harder to scan than 3 groups of 5, and checkboxes let a reviewer or implementer literally tick them off:

```markdown
### <Theme>

- [ ] <Testable criterion>
- [ ] <Testable criterion>
```

This should be extremely extensive. It's placed last deliberately — everything above it is the spec's actual content; this is a coverage appendix `/to-tickets` cross-references when slicing tickets, not the first thing a reviewer should read.

</spec-template>
