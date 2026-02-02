# DryDock CLI

The CLI is the source of truth. The web UI shells out to the CLI for reads and writes.

## Install
```bash
pnpm install
```

## Onboarding
```bash
pnpm --dir apps/command-center-ui cc init --provider opencode --owner <org> --repo <name> --token <ghp_...>
```

- Creates `.command-center.jsonc` if missing
- Writes `apps/command-center-ui/.env.local`
- Sets the agent harness provider + command prefix

## Configuration
```bash
pnpm --dir apps/command-center-ui cc config show
pnpm --dir apps/command-center-ui cc config set-provider codex
pnpm --dir apps/command-center-ui cc config set-prefix /assistant
pnpm --dir apps/command-center-ui cc config set-command proposePlans "propose 2 plans: minimal + robust"
pnpm --dir apps/command-center-ui cc config set-comment qaFail "/cc qa fail:"
```

## Command list
```bash
pnpm --dir apps/command-center-ui cc commands
pnpm --dir apps/command-center-ui cc commands --owner <org> --repo <name>
pnpm --dir apps/command-center-ui cc commands --include-agent
```

## Test mode (dry run)
Add `--test` to print the planned commands without making writes or API calls.

```bash
pnpm --dir apps/command-center-ui cc pr-comment post --owner org --repo repo --pr 123 --body "/cc qa generate" --test
```

## Data + workflow actions (CLI is source of truth)
```bash
# Features
pnpm --dir apps/command-center-ui cc features list --json
pnpm --dir apps/command-center-ui cc features create --title "Feature" --json
pnpm --dir apps/command-center-ui cc features status --id feat_... --status QA_IN_PROGRESS --json

# QA packets
pnpm --dir apps/command-center-ui cc qa get --feature-id feat_... --json
pnpm --dir apps/command-center-ui cc qa create --feature-id feat_... --items "Check A|Check B" --json
pnpm --dir apps/command-center-ui cc qa update --id 1 --status failed --checklist-json '[{"id":"item_1","text":"A","status":"fail","notes":"...","evidence":""}]' --json

# Templates
pnpm --dir apps/command-center-ui cc templates render --type qa --feature-id feat_... --json
pnpm --dir apps/command-center-ui cc templates render --type qa --owner org --repo repo --feature-id feat_... --json
pnpm --dir apps/command-center-ui cc templates render --type fix-bundle --feature-id feat_... --data-json '{"failed_checks":["Check A failed"],"evidence":"..." }' --json
pnpm --dir apps/command-center-ui cc templates render --type ralph --feature-id feat_... --json

# PR comments + targets
pnpm --dir apps/command-center-ui cc pr-comment post --owner org --repo repo --pr 123 --body "/cc qa generate" --json
pnpm --dir apps/command-center-ui cc recent list --json

# PR tracking + final PR creation (local)
pnpm --dir apps/command-center-ui cc prs track --owner org --repo repo --pr 123 --type working --json
pnpm --dir apps/command-center-ui cc prs tracked --owner org --repo repo --json
pnpm --dir apps/command-center-ui cc prs context --owner org --repo repo --pr 123 --json
pnpm --dir apps/command-center-ui cc final create --owner org --repo repo --pr 123 --mode squash --json

# Agent runs (local)
pnpm --dir apps/command-center-ui cc agent run --mode propose
pnpm --dir apps/command-center-ui cc agent run --mode implement --context "Implement per spec"
pnpm --dir apps/command-center-ui cc agent run --mode fix --prompt "Fix robust: ..."
```

Notes:
- `cc final create` requires a clean git working tree and a local clone with `origin` configured.

## Interactive mode
```bash
pnpm --dir apps/command-center-ui cc interactive
```

## Repo configuration
```bash
pnpm --dir apps/command-center-ui cc repos list --json
pnpm --dir apps/command-center-ui cc repos add --owner <org> --name <repo> --default-branch main
pnpm --dir apps/command-center-ui cc repos set-agent --owner <org> --name <repo> --provider codex --prefix /codex \\
  --command-propose "propose 2 plans" --command-implement "implement per spec" --command-fix "fix robust"
pnpm --dir apps/command-center-ui cc repos set-config --owner <org> --name <repo> --config-json '{"commands":{"test":"pnpm test"}}'
```

## Harness providers
- `opencode` → `/opencode`
- `codex` → `/codex`
- `claude-code` → `/claude`

## Markdown watchers (planned)
```bash
pnpm --dir apps/command-center-ui cc watch list --json
pnpm --dir apps/command-center-ui cc watch add --id notes --path docs/notes.md --mode mtime+hash --json
pnpm --dir apps/command-center-ui cc watch run --id notes --json
pnpm --dir apps/command-center-ui cc watch snapshot --id notes --json
```

Notes:
- Watch sources only run on configured `.md` files.
- `watch run` performs a one-off scan; service mode runs scans on a schedule.
- Commands are not implemented yet.

## Service + scheduler (planned)
```bash
pnpm --dir apps/command-center-ui cc service start
pnpm --dir apps/command-center-ui cc service status --json
pnpm --dir apps/command-center-ui cc service stop
pnpm --dir apps/command-center-ui cc service pipe < tasks.jsonl

pnpm --dir apps/command-center-ui cc schedule list --json
pnpm --dir apps/command-center-ui cc schedule add --id daily-brief --cron "0 8 * * *" --task brief.generate --json
pnpm --dir apps/command-center-ui cc schedule run --id daily-brief --json
```

Notes:
- Service mode is local-only and writes job state to the SQLite DB.
- `service pipe` accepts JSON lines and enqueues jobs for processing.
- Commands are not implemented yet.
