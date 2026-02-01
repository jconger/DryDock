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
```

## Data + workflow actions (CLI is source of truth)
```bash
# Features
pnpm --dir apps/command-center-ui cc features list --json
printf '{"title":"Feature"}' | pnpm --dir apps/command-center-ui cc features create --json
printf '{"id":"feat_...","status":"QA_IN_PROGRESS"}' | pnpm --dir apps/command-center-ui cc features set-status --json

# QA packets
pnpm --dir apps/command-center-ui cc qa get --feature-id feat_... --json
printf '{"feature_id":"feat_...","checklist":["Check A","Check B"]}' | pnpm --dir apps/command-center-ui cc qa create --json
printf '{"id":1,"status":"failed","checklist":[{"id":"item_1","text":"A","status":"fail","notes":"...","evidence":""}]}' | pnpm --dir apps/command-center-ui cc qa update --json

# PR comments + targets
printf '{"owner":"org","repo":"repo","pr_number":123,"body":"/cc qa generate"}' | pnpm --dir apps/command-center-ui cc pr-comment post --json
pnpm --dir apps/command-center-ui cc pr-targets list --json
```

## Interactive mode
```bash
pnpm --dir apps/command-center-ui cc interactive
```

## Harness providers
- `opencode` → `/opencode`
- `codex` → `/codex`
- `claude-code` → `/claude`
