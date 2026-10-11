---
name: commit
description: Commit working tree changes with a conventional commit title (max 100 chars) and a body describing the changes.
disable-model-invocation: true
---

# Commit

Commit the current working tree changes with a well-formed message.

## Steps

1. Inspect the changes: run `git status` and `git diff HEAD`. Read every changed file's diff before writing the message. If the working tree is clean, report that and stop.
2. Stage everything relevant: `git add` all working-tree changes, unless the user scoped the commit to specific files.
3. Compose the message:
   - **Title**: Conventional Commits format `type(scope): summary`, max 100 characters, summary in lowercase (no capital right after the colon — matches this repo's actual history). Derive the type from the diff (feat, fix, refactor, chore, test, docs, ci, build, perf). Scope is optional: when the diff stays inside one bounded context (`auction`, `watchlist`, `shared`), you may use it as the scope; otherwise omit it (`type: summary`), as most of this repo's history does.
   - **Body**: always present, never empty. 3-6 sentences, not a summary of the diff — explain the root cause or behavioral reason for the change, who/what was affected and how, following this repo's real style (e.g. "X did Y, dropping Z — consumers then saw ..." rather than "updated X to do Y").
4. Commit and verify: create the commit, then run `git log -1 --stat` and confirm the title length is ≤ 100 characters and every intended file is included. Show the result to the user. Do not bypass git hooks (no `--no-verify`) — if a hook fails, fix the underlying issue and re-commit rather than skip it.
