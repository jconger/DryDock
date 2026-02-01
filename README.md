# Command Center Starter Repo (Artifacts Only)

This repo contains copy/paste artifacts to support a PR-comments-only workflow with both a web UI and a CLI:

- Working PR (draft) → QA Pass/Fail → Fix loop → Clean Final PR
- Agent-harness runs (OpenCode, Codex, Claude Code)
- QA packet + Fix bundle + Ralph report templates
- AGENTS.md conventions

## Setup

1) Create labels in GitHub:
- ai:approved
- ai:implementing
- ai:ready-for-qa
- ai:qa-failed
- ai:qa-passed
- ai:final-pr
- ai:ralph-failed
- ai:blocked
- (optional) ai:repo-health

2) Add repository secret:
- GH_PAT (PAT with repo scope)

3) Use on a PR:
- /cc qa generate
- /cc qa fail: <notes> or /cc qa pass
- /cc ralph run and paste a Ralph report (optional)
- /cc final create (creates a final PR after QA pass and Ralph gate)

Note: This starter includes a local UI app and CLI for onboarding and command configuration.


## Local UI + CLI
A minimal Next.js UI and CLI live at `apps/command-center-ui`.

Quickstart:
```bash
pnpm install
pnpm --dir apps/command-center-ui cc init --provider opencode --owner <org> --repo <name> --token <ghp_...>
pnpm --dir apps/command-center-ui dev
```

Docs:
- `docs/command-center/cli.md`
- `docs/command-center/agent-harness.md`
