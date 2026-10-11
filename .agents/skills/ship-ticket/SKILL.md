---
name: ship-ticket
description: Human-gated shipping of a single ticket — implement via subagent, auto-review, wait for user approval, then commit.
disable-model-invocation: true
---

# Ship Ticket

Human-gated shipping of a ticket. The main thread **orchestrates only** — never writes code itself.

## Models

Dispatch every subagent with an explicit model. An omitted model inherits the session's — usually the most capable and most expensive available.

| Tier       | Class                        | Dispatched for                                                               |
| ---------- | ---------------------------- | ---------------------------------------------------------------------------- |
| `fast`     | cheapest usable coding model | the tweak applier (3f);                                                      |
| `standard` | mid-tier workhorse           | the implementer (default); every review axis; the walkthrough                |
| `deep`     | most capable available       | the implementer when a ticket spans 3+ modules or turns on a design decision |

## Workflow

### 1. Load ticket

### 2. Open the ledger

Use it to track the work and note important context

```
${TMPDIR:-/tmp}/ship-ticket/<repo-name>/<ticket-key>.md
```

`<repo-name>` is the basename of `git rev-parse --show-toplevel`, `<ticket-key>` is `issue-<N>`, from the ticket's GitHub issue number — together they make the path reproducible, so a resumed run finds its own ledger without being told where it is.

### 3. Ship the ticket

#### 3a. Implement (subagent)

Use the subagents.

Implement the work described by the user

Call the Skill tool with `tdd` where possible, at pre-agreed seams. Avoid tdd for frontend components.

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

#### 3b. Review + auto-fix

After the subagent returns, before surfacing to the user, review by invoking the `code-review` and `simplify` skill in parallel.

Run it — do not hand-roll the axis dispatches from memory.

Collect findings from the axes that ran.

- **No findings** → skip straight to 3c.
- **Findings exist** → fix them with subagents.

#### 3c. User code review

After review + fixes:

- run `show-me` skill to show the user the changes made, and ask for their review.
- Explicitly state: "Awaiting code review."

STOP HERE. Do not auto-commit. Wait for user reply.

#### 3d. On user response

- **approve** → commit (3e)
- **comments from user** → Decide whether the change is big and should go again through 3a-3c, or if it is a small tweak that can be applied directly (3g). If the user wants to reject the ticket, they can do so at this point.

#### 3e. Commit

Run `commit` skill.

Never use `--no-verify`. If pre-commit hook fails, surface the error to user, do NOT amend, do NOT bypass.

#### 3f. Tweak (fast path)

Dispatch one `fast`-tier subagent with the instruction verbatim, the paths it may touch, and the brief: apply exactly this, change nothing else, no commit. On return, run only the targeted checks — the test file covering the touched code, plus typecheck — never the full suite. Then go straight back to 3c.

### 4. Done

Read the ledger and report whether the ticket was committed or rejected. Mention any uncommitted changes left in the working tree.

Then delete the ledger — git history is the record now.
