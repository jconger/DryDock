# Command Center CLI

The CLI bootstraps `.command-center.jsonc` and keeps the web UI in sync.

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

## Harness providers
- `opencode` → `/opencode`
- `codex` → `/codex`
- `claude-code` → `/claude`
