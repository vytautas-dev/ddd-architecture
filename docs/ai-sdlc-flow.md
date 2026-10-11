# AI SDLC flow

How AI-driven implementation works in this repo, from an idea to code landing on a branch. Specs and tickets both live in GitHub Issues; tickets are sub-issues of their spec.

Skills live in `.agents/skills/` (symlinked into `.claude/skills/`); upstream versions are pinned in `skills-lock.json`.

## 1. Technical grilling

`/grill-with-docs <idea or requirement>`

Interviews you in rounds to resolve ambiguity before anything is written down (`grilling` + `domain-modeling`). Reads the code, `GLOSSARY.md` and `docs/adr/`, and updates them inline as decisions land, after you confirm each one. Both are created lazily — see `docs/agents/domain.md`.

## 2. Spec

`/to-spec`

Synthesizes the grilling into a spec and publishes it as a GitHub Issue titled `spec: <feature>`, labelled `ready-for-agent` (`docs/agents/issue-tracker.md`). Review it by commenting on the Issue. Optional `/visual-plan` pass for a denser, reviewable HTML plan.

## 3. Tickets

`/to-tickets #<spec>`

Breaks the spec into tracer-bullet tickets — each a thin, complete vertical slice (domain → application → infrastructure → API → tests), capped at ~800 lines changed, target ~500. One GitHub Issue per ticket, blockers first:
- Each ticket is a **sub-issue** of the spec, so the spec shows its progress.
- Blocking edges between tickets are native GitHub `blocked by` dependencies.

## 4. Shipping a ticket

Start a ticket on its own branch: `gh issue develop <N> --checkout` (creates `<N>-<slug>` linked to the issue).

`/implement #<N>` — you stay the orchestrator: file tree plan → your approval → TDD → `/code-review` → your approval → commit.

`/ship-ticket #<N>` — experimental; the main thread only orchestrates and subagents write the code:

1. **Implement** — subagent, TDD at pre-agreed seams.
2. **Review** — `/code-review` and `/simplify` in parallel, findings fixed by subagents.
3. **Human gate** — `/show-me` presents the changes and waits for approval.
4. **Commit** — via `/commit`, never with `--no-verify`.

## 5. Test, loop, handoff

If something's broken, loop back to step 1 on the specific gap.

`/handoff` compacts the session for a fresh agent to pick up.

`/open-pull-request` opens the PR against `main`, filling `.github/pull_request_template.md` (Summary, Evidence, Merge Danger — shaped by the `pr` skill) from the real diff. Its `Closes #<N>` line closes the ticket on merge.

## 6. Retro

`/retro`

Run in the same session after a build, especially one that went sideways. Suggests changes to the agent's environment, not the code: a mechanical mistake becomes a lint rule, hook, or CI check; a judgement call becomes a coding standard.
