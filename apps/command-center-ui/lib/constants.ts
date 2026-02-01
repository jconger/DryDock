export type AgentHarnessProvider = "opencode" | "codex" | "claude-code";

export const AGENT_HARNESS_PRESETS: Record<AgentHarnessProvider, { label: string; commandPrefix: string }> = {
  opencode: { label: "OpenCode", commandPrefix: "/opencode" },
  codex: { label: "Codex", commandPrefix: "/codex" },
  "claude-code": { label: "Claude Code", commandPrefix: "/claude" },
};

export const DEFAULT_AGENT_COMMANDS = {
  proposePlans:
    "propose 3 implementation plans: minimal, balanced, robustness-first. For each: scope, CLI + web UI impact, config changes, risks, and testing. End with a recommendation.",
  implement:
    "implement per spec in issue/PR. Update this PR. Ensure lint/typecheck/test pass. Call out assumptions and include a verification checklist.",
  fixRobust:
    "fix robust: address QA failures from latest Fix Bundle comment. Update this PR. Add/adjust tests. Include root cause and verification steps.",
};

export const DEFAULT_COMMENT_PROTOCOL = {
  prefix: "/cc",
  commands: {
    qaGenerate: "/cc qa generate",
    qaPass: "/cc qa pass",
    qaFail: "/cc qa fail:",
    ralphRun: "/cc ralph run",
    ralphAccept: "/cc ralph accept:",
    finalCreate: "/cc final create",
  },
};

export type AgentHarnessCommands = typeof DEFAULT_AGENT_COMMANDS;
export type CommentProtocol = typeof DEFAULT_COMMENT_PROTOCOL;

export type AgentHarnessConfig = {
  provider: AgentHarnessProvider;
  label: string;
  commandPrefix: string;
  commands: AgentHarnessCommands;
};
