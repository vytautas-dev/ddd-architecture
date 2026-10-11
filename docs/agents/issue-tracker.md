# Issue tracker: GitHub Issues

Specs (PRDs) and implementation tickets both live as GitHub issues in this repo. Use the `gh` CLI for all operations; it infers the repo from `git remote -v`. `.scratch/` is only for local, uncommitted working notes (audits, drafts) and is never the thing a skill "publishes" to.

## Hierarchy

The spec is the parent; its tickets are **sub-issues** of it, so the parent/child view in GitHub tells the whole story of a feature.

```
#10  spec: <feature>                  ← /to-spec
├── #11  <slice 1>                    ← /to-tickets
├── #12  <slice 2>   blocked by #11
└── #13  <slice 3>   blocked by #11
```

## Conventions

- **Create an issue**: `gh issue create --title "..." --body-file <file> --label ready-for-agent`. Write the body to a temp file instead of inlining it.
- **Read an issue**: `gh issue view <number> --comments`.
- **List issues**: `gh issue list --state open --json number,title,labels` with `--label` / `--state` filters.
- **Comment**: `gh issue comment <number> --body "..."`.
- **Labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`. Role strings in [triage-labels.md](./triage-labels.md).
- **Close**: `gh issue close <number> --comment "..."`. A merged PR whose body says `Closes #<n>` closes the ticket on its own.

Both GitHub APIs below take the issue's numeric **database id**, not its `#number`: `gh api repos/{owner}/{repo}/issues/<n> --jq .id`. `gh api` fills `{owner}/{repo}` from the current repo.

- **Attach a ticket to its spec** (sub-issue): `gh api --method POST repos/{owner}/{repo}/issues/<spec>/sub_issues -F sub_issue_id=<ticket-db-id>`.
- **Blocking edge**: `gh api --method POST repos/{owner}/{repo}/issues/<ticket>/dependencies/blocked_by -F issue_id=<blocker-db-id>`. A ticket is unblocked when every blocker is closed (`issue_dependencies_summary.blocked_by == 0`).

## When a skill says "publish to the issue tracker"

- **A spec** (`/to-spec`): create one issue titled `spec: <feature>`.
- **Tickets from a spec** (`/to-tickets`): create one issue per ticket in dependency order (blockers first), attach each as a sub-issue of the spec, then add the `blocked_by` edges once both sides exist. Also put `Parent: #<spec>` at the top of each ticket body, so the link back to the spec survives in the text.

## When a skill says "fetch the relevant ticket"

The user passes a number (`42`, `#42`) or a URL: run `gh issue view <number-or-url> --comments`. For a spec, also list its tickets with `gh api repos/{owner}/{repo}/issues/<spec>/sub_issues --jq '.[] | {number, title, state}'`.
