# AGENTS.md

This repository supports agent-assisted development. Follow these rules strictly.

## Golden rules
1. **Do not merge.** Agents may open PRs and push commits, but never merge.
2. **Respect scope.** Implement only what the spec/issue/QA bundle asks for.
3. **Prefer small diffs.** Smaller, reviewable commits beat huge refactors.
4. **Keep the app running.** Avoid changes that break local dev without updating docs/scripts.
5. **Add tests when feasible.** Especially for bug fixes and non-trivial logic changes.

## Repository commands
- Install: `pnpm install --frozen-lockfile`
- Dev: `pnpm dev`
- Lint: `pnpm lint`
- Typecheck: `pnpm typecheck`
- Test: `pnpm test`
- Build: `pnpm build`

If any of these fail after your changes, explain why and fix it.

## CLI testing expectations
- When changing the CLI (`apps/command-center-ui/scripts/cc.js` or `apps/command-center-ui/lib/cli.ts`), always run `pnpm test`.
- Add or update CLI tests in `apps/command-center-ui/tests/cli.test.js` to cover the new or changed behavior.

## Branch + PR conventions
- Working branches: `work/<feature_id>-<slug>` (draft PRs ok)
- Final branches: `final/<feature_id>-<slug>` (clean PR only after QA passes)

The "working PR" may be iterative. The "final PR" should be clean and focused.

## How to read the spec
Specs are provided via:
- GitHub issue body OR
- `docs/specs/<feature_id>/spec.md` OR
- a pasted "Spec Variant" comment in the PR

Always confirm:
- goals
- non-goals
- acceptance criteria
- constraints

If missing, propose assumptions explicitly.

## QA + Fix workflow
QA is controlled by human review. When QA fails, you will receive a **Fix Bundle** (often pasted as a PR comment).

When responding to a Fix Bundle:
1. Quote the **failed checklist items**
2. Provide a short **root cause** analysis
3. Implement the fix
4. Add/adjust tests if feasible
5. Provide a **verification checklist** (commands + manual steps)

## Ralph lane
A "Ralph" pass represents naive-user behavior:
- repeated clicks
- missing data
- weird URLs
- rapid navigation
- mobile widths

Prefer guardrails:
- safe defaults
- clear error/empty states
- debouncing where appropriate
- input validation
- "no crash" guarantees

Ralph findings should be resolved or explicitly accepted with rationale.

## Code style
- Use existing patterns and utilities.
- Keep TypeScript types strict; avoid `any` unless unavoidable.
- Avoid introducing new dependencies unless necessary.
- Prefer named exports and small modules consistent with current style.

## Commit message style
Use one of:
- `feat(<area>): ...`
- `fix(<area>): ...`
- `refactor(<area>): ...`
- `test(<area>): ...`
- `docs(<area>): ...`

## Security and secrets
- Never commit secrets.
- Do not log credentials/tokens.
- If adding API calls, handle failures and timeouts safely.

## Communication expectations
When you finish a chunk of work, leave a PR comment with:
- what changed
- where to review
- how to test
- any risks or follow-ups
