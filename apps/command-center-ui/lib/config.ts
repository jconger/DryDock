import fs from "node:fs";
import path from "node:path";
import {
  AGENT_HARNESS_PRESETS,
  DEFAULT_AGENT_COMMANDS,
  DEFAULT_COMMENT_PROTOCOL,
  type AgentHarnessConfig,
  type AgentHarnessProvider,
  type CommentProtocol,
} from "@/lib/constants";

export type CommandCenterConfig = {
  agentHarness?: {
    provider?: AgentHarnessProvider;
    commandPrefix?: string;
    commands?: Partial<typeof DEFAULT_AGENT_COMMANDS>;
  };
  commentProtocol?: {
    prefix?: string;
    commands?: Partial<typeof DEFAULT_COMMENT_PROTOCOL.commands>;
  };
};

const CONFIG_FILENAME = ".command-center.jsonc";

function stripJsonComments(raw: string) {
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "");
}

function findConfigPath(startDir = process.cwd()): string | null {
  let dir = startDir;
  for (let i = 0; i < 6; i += 1) {
    const candidate = path.join(dir, CONFIG_FILENAME);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function loadCommandCenterConfig(): { configPath: string | null; config: CommandCenterConfig } {
  const configPath = findConfigPath();
  if (!configPath) {
    return { configPath: null, config: {} };
  }
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(stripJsonComments(raw)) as CommandCenterConfig;
    return { configPath, config: parsed };
  } catch {
    return { configPath, config: {} };
  }
}

export function getRepoRoot(): string {
  const { configPath } = loadCommandCenterConfig();
  return configPath ? path.dirname(configPath) : process.cwd();
}

export function getAgentHarness(config?: CommandCenterConfig): AgentHarnessConfig {
  const resolved = config ?? loadCommandCenterConfig().config;
  const providerCandidate = resolved.agentHarness?.provider;
  const provider: AgentHarnessProvider =
    providerCandidate && providerCandidate in AGENT_HARNESS_PRESETS ? providerCandidate : "opencode";
  const preset = AGENT_HARNESS_PRESETS[provider];
  return {
    provider,
    label: preset.label,
    commandPrefix: resolved.agentHarness?.commandPrefix ?? preset.commandPrefix,
    commands: {
      ...DEFAULT_AGENT_COMMANDS,
      ...(resolved.agentHarness?.commands ?? {}),
    },
  };
}

export function getCommentProtocol(config?: CommandCenterConfig): CommentProtocol {
  const resolved = config ?? loadCommandCenterConfig().config;
  return {
    prefix: resolved.commentProtocol?.prefix ?? DEFAULT_COMMENT_PROTOCOL.prefix,
    commands: {
      ...DEFAULT_COMMENT_PROTOCOL.commands,
      ...(resolved.commentProtocol?.commands ?? {}),
    },
  };
}
