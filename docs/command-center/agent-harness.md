# Agent harness configuration

DryDock supports three agent harness providers. Configure once and both the UI and CLI will use the same settings.

## Providers
- `opencode` → `/opencode`
- `codex` → `/codex`
- `claude-code` → `/claude`

## Config example
```json
{
  "agentHarness": {
    "provider": "codex",
    "commandPrefix": "/codex",
    "commands": {
      "proposePlans": "propose 3 implementation plans: minimal, balanced, robustness-first...",
      "implement": "implement per spec in issue/PR...",
      "fixRobust": "fix robust: address QA failures..."
    }
  }
}
```

## Update via CLI
```bash
pnpm --dir apps/command-center-ui cc config set-provider codex
pnpm --dir apps/command-center-ui cc config set-prefix /assistant
pnpm --dir apps/command-center-ui cc config set-command proposePlans "propose 2 plans: minimal + robust"
```
