# DryDock UI (Local)

A minimal local UI that posts PR comments (your control plane) and lists open PRs.

## Setup (CLI-first)

From repo root:

1) Install deps:
```bash
pnpm install
```

2) Run onboarding:
```bash
pnpm --dir apps/command-center-ui cc init --provider opencode --owner <org> --repo <name> --token <ghp_...>
```

This creates `.command-center.jsonc` (if missing) and writes `apps/command-center-ui/.env.local`.

3) Start the UI:
```bash
pnpm --dir apps/command-center-ui dev
```

Open: http://localhost:3333

## What it does
- Posts PR comments like:
  - `/cc qa generate`
  - `/cc qa pass`
  - `/cc qa fail: ...`
  - `/cc final create`
  - `/opencode ...` / `/codex ...` / `/claude ...` commands (configurable)
- Lists open PRs for a repo
- Tracks recent PR targets in local SQLite at `.data/command-center.sqlite`

## CLI usage
```bash
pnpm --dir apps/command-center-ui cc config show
pnpm --dir apps/command-center-ui cc config set-provider codex
pnpm --dir apps/command-center-ui cc config set-prefix /assistant
pnpm --dir apps/command-center-ui cc config set-command proposePlans "propose 2 plans: minimal + robust"
pnpm --dir apps/command-center-ui cc commands
pnpm --dir apps/command-center-ui cc interactive
pnpm --dir apps/command-center-ui cc final create --owner <org> --repo <name> --pr 123 --mode squash
```

Add `--test` to any command to print the planned calls without making writes or API requests.
