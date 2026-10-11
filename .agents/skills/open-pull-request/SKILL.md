---
name: open-pull-request
description: 'Open a GitHub pull request from the current branch, filling the repo PR template. Use when the user wants to open, create, or raise a PR — to the default base branch or a branch they name. Triggers on "open a PR", "create a pull request", "raise a PR to <branch>", "PR this branch".'
allowed-tools: Bash(git *), Bash(gh *), Read, Skill
---

# Open Pull Request

Open a PR from the current branch with `gh`, filling `.github/pull_request_template.md` from the actual diff in the shape the `pr` skill defines.

## Steps

1. **Resolve head and base.** Head = `git branch --show-current`.

   Base resolution, in order:
   - The branch the user named, if any.
   - Else, the remote default from `git symbolic-ref refs/remotes/origin/HEAD` (this repo's default is `main`).

   If head equals base, stop — there is nothing to PR; tell the user to switch to a feature branch. Done when you hold a head and base that differ.

2. **Push the branch.** Run `git push -u origin HEAD`. Done when the head branch has an upstream on origin.

3. **Reuse an existing PR.** Run `gh pr view --json url,state`. If it returns an open PR for this branch, report the URL and stop. Done when no open PR exists.

4. **Draft the body.** Call the Skill tool with `pr` for how to fill each section. Read `.github/pull_request_template.md` and fill **every** section from the real change: `git log <base>..HEAD` and `git diff <base>...HEAD`.
   - Complete the `Closes #` line with the GitHub issue number of the ticket this PR implements, so merging closes it. Look for it in this session's context, then in the branch name (`gh issue develop` names branches `<N>-<slug>`). If you can't find one, ask the user rather than leaving it bare; drop the line only when they confirm the work has no ticket.
   - For **Evidence**, use only what was actually run or seen in this session (test output, screenshots). If there is none, say so in the section rather than inventing a before/after.

   Done when no template placeholder comment (`<!--- … -->`) survives.

5. **Create the PR.** Write the body to a temp file, then run `gh pr create --base <base> --title "<title>" --body-file <file>`, where title is a concise summary drawn from the commits. Report the returned URL. Done when `gh` returns a PR URL.
