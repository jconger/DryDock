#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const CONFIG_FILENAME = ".command-center.jsonc";

const AGENT_PRESETS = {
  opencode: { label: "OpenCode", commandPrefix: "/opencode" },
  codex: { label: "Codex", commandPrefix: "/codex" },
  "claude-code": { label: "Claude Code", commandPrefix: "/claude" },
};

const DEFAULT_AGENT_COMMANDS = {
  proposePlans:
    "propose 3 implementation plans: minimal, balanced, robustness-first. For each: scope, CLI + web UI impact, config changes, risks, and testing. End with a recommendation.",
  implement:
    "implement per spec in issue/PR. Update this PR. Ensure lint/typecheck/test pass. Call out assumptions and include a verification checklist.",
  fixRobust:
    "fix robust: address QA failures from latest Fix Bundle comment. Update this PR. Add/adjust tests. Include root cause and verification steps.",
};

const DEFAULT_COMMENT_PROTOCOL = {
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

function stripJsonComments(raw) {
  return raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "");
}

function findConfigPath(startDir = process.cwd()) {
  let dir = startDir;
  for (let i = 0; i < 8; i += 1) {
    const candidate = path.join(dir, CONFIG_FILENAME);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function findRepoRoot(startDir = process.cwd()) {
  let dir = startDir;
  for (let i = 0; i < 8; i += 1) {
    if (fs.existsSync(path.join(dir, "AGENTS.md"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return startDir;
}

function loadConfig() {
  const configPath = findConfigPath();
  if (!configPath) return { configPath: null, config: {} };
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    return { configPath, config: JSON.parse(stripJsonComments(raw)) };
  } catch {
    return { configPath, config: {} };
  }
}

function writeConfig(configPath, config) {
  const serialized = JSON.stringify(config, null, 2);
  fs.writeFileSync(configPath, serialized + "\n", "utf8");
}

function ensureConfigPath() {
  const existing = findConfigPath();
  if (existing) return existing;
  const repoRoot = findRepoRoot();
  const newPath = path.join(repoRoot, CONFIG_FILENAME);
  const base = {
    repo: { defaultBranch: "main" },
    labels: {
      featureApproved: "ai:approved",
      implementing: "ai:implementing",
      readyForQa: "ai:ready-for-qa",
      qaFailed: "ai:qa-failed",
      qaPassed: "ai:qa-passed",
      finalPr: "ai:final-pr",
      ralphFailed: "ai:ralph-failed",
      blocked: "ai:blocked",
    },
    branches: { workingPrefix: "work/", finalPrefix: "final/" },
    commands: {
      install: "pnpm install --frozen-lockfile",
      dev: "pnpm dev",
      lint: "pnpm lint",
      typecheck: "pnpm typecheck",
      test: "pnpm test",
      build: "pnpm build",
    },
    qa: {
      maxChecklistItems: 25,
      requireCiGreenToCreateFinalPr: false,
      requireRalphGateBeforeFinalPr: true,
    },
    templates: {
      qaPacketPath: "docs/command-center/templates/qa-packet.md",
      fixBundlePath: "docs/command-center/templates/fix-bundle.md",
      ralphReportPath: "docs/command-center/templates/ralph-report.md",
    },
    commentProtocol: DEFAULT_COMMENT_PROTOCOL,
    agentHarness: {
      provider: "opencode",
      commandPrefix: AGENT_PRESETS.opencode.commandPrefix,
      commands: DEFAULT_AGENT_COMMANDS,
    },
  };
  writeConfig(newPath, base);
  return newPath;
}

function resolveAgentHarness(config) {
  const provider = config.agentHarness?.provider in AGENT_PRESETS ? config.agentHarness?.provider : "opencode";
  const preset = AGENT_PRESETS[provider];
  return {
    provider,
    label: preset.label,
    commandPrefix: config.agentHarness?.commandPrefix ?? preset.commandPrefix,
    commands: { ...DEFAULT_AGENT_COMMANDS, ...(config.agentHarness?.commands ?? {}) },
  };
}

function resolveCommentProtocol(config) {
  return {
    prefix: config.commentProtocol?.prefix ?? DEFAULT_COMMENT_PROTOCOL.prefix,
    commands: { ...DEFAULT_COMMENT_PROTOCOL.commands, ...(config.commentProtocol?.commands ?? {}) },
  };
}

function usage() {
  return `DryDock CLI

Usage:
  cc init [--provider <opencode|codex|claude-code>] [--owner <org>] [--repo <name>] [--token <ghp_...>]
  cc config show
  cc config set-provider <opencode|codex|claude-code>
  cc config set-prefix <commandPrefix>
  cc config set-command <proposePlans|implement|fixRobust> <text>
  cc config set-comment <qaGenerate|qaPass|qaFail|ralphRun|ralphAccept|finalCreate> <text>
  cc commands

Notes:
  - Config file: .command-center.jsonc (created if missing)
  - GH_TOKEN and defaults live in apps/command-center-ui/.env.local
`;
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  return { command, rest };
}

function parseFlagValue(rest, flag) {
  const idx = rest.indexOf(flag);
  if (idx === -1) return null;
  return rest[idx + 1] ?? null;
}

function updateEnvLocal({ owner, repo, token }) {
  if (!owner && !repo && !token) return;
  const repoRoot = findRepoRoot();
  const uiEnvPath = path.join(repoRoot, "apps", "command-center-ui", ".env.local");
  const existing = fs.existsSync(uiEnvPath) ? fs.readFileSync(uiEnvPath, "utf8") : "";
  const lines = existing.split(/\r?\n/).filter(Boolean);
  const map = new Map(lines.map((line) => {
    const idx = line.indexOf("=");
    return [line.slice(0, idx), line.slice(idx + 1)];
  }));
  if (token) map.set("GH_TOKEN", token);
  if (owner) map.set("NEXT_PUBLIC_GH_OWNER", owner);
  if (repo) map.set("NEXT_PUBLIC_GH_REPO", repo);
  const out = Array.from(map.entries()).map(([key, value]) => `${key}=${value}`);
  fs.mkdirSync(path.dirname(uiEnvPath), { recursive: true });
  fs.writeFileSync(uiEnvPath, out.join("\n") + "\n", "utf8");
}

function main() {
  const { command, rest } = parseArgs(process.argv.slice(2));
  if (!command || command === "help" || command === "--help" || command === "-h") {
    console.log(usage());
    return;
  }

  if (command === "init") {
    const provider = parseFlagValue(rest, "--provider") || "opencode";
    if (!(provider in AGENT_PRESETS)) {
      console.error("Provider must be one of: opencode, codex, claude-code");
      process.exit(1);
    }
    const owner = parseFlagValue(rest, "--owner");
    const repo = parseFlagValue(rest, "--repo");
    const token = parseFlagValue(rest, "--token");
    const configPath = ensureConfigPath();
    const { config } = loadConfig();
    config.agentHarness = {
      ...(config.agentHarness ?? {}),
      provider,
      commandPrefix: AGENT_PRESETS[provider]?.commandPrefix ?? "/opencode",
      commands: { ...DEFAULT_AGENT_COMMANDS, ...(config.agentHarness?.commands ?? {}) },
    };
    config.commentProtocol = resolveCommentProtocol(config);
    writeConfig(configPath, config);
    updateEnvLocal({ owner, repo, token });
    console.log(`Initialized DryDock config at ${configPath}`);
    console.log(`Agent harness: ${provider}`);
    if (owner || repo) console.log(`Defaults: ${owner ?? ""}/${repo ?? ""}`.replace(/\/$/, ""));
    if (token) console.log("GH_TOKEN stored in apps/command-center-ui/.env.local");
    return;
  }

  if (command === "config") {
    const sub = rest[0];
    const { configPath, config } = loadConfig();
    if (!configPath) {
      console.error("No .command-center.jsonc found. Run `cc init` first.");
      process.exit(1);
    }

    if (sub === "show") {
      const agent = resolveAgentHarness(config);
      const protocol = resolveCommentProtocol(config);
      console.log(JSON.stringify({ configPath, agentHarness: agent, commentProtocol: protocol }, null, 2));
      return;
    }

    if (sub === "set-provider") {
      const provider = rest[1];
      if (!provider || !(provider in AGENT_PRESETS)) {
        console.error("Provider must be one of: opencode, codex, claude-code");
        process.exit(1);
      }
      config.agentHarness = {
        ...(config.agentHarness ?? {}),
        provider,
        commandPrefix: AGENT_PRESETS[provider].commandPrefix,
      };
      writeConfig(configPath, config);
      console.log(`Agent harness updated to ${provider}`);
      return;
    }

    if (sub === "set-prefix") {
      const prefix = rest[1];
      if (!prefix) {
        console.error("Usage: cc config set-prefix <commandPrefix>");
        process.exit(1);
      }
      config.agentHarness = { ...(config.agentHarness ?? {}), commandPrefix: prefix };
      writeConfig(configPath, config);
      console.log(`Agent command prefix updated to ${prefix}`);
      return;
    }

    if (sub === "set-command") {
      const key = rest[1];
      const value = rest.slice(2).join(" ").trim();
      if (!key || !value || !(key in DEFAULT_AGENT_COMMANDS)) {
        console.error("Usage: cc config set-command <proposePlans|implement|fixRobust> <text>");
        process.exit(1);
      }
      config.agentHarness = {
        ...(config.agentHarness ?? {}),
        commands: { ...DEFAULT_AGENT_COMMANDS, ...(config.agentHarness?.commands ?? {}), [key]: value },
      };
      writeConfig(configPath, config);
      console.log(`Agent command ${key} updated`);
      return;
    }

    if (sub === "set-comment") {
      const key = rest[1];
      const value = rest.slice(2).join(" ").trim();
      if (!key || !value || !(key in DEFAULT_COMMENT_PROTOCOL.commands)) {
        console.error("Usage: cc config set-comment <qaGenerate|qaPass|qaFail|ralphRun|ralphAccept|finalCreate> <text>");
        process.exit(1);
      }
      config.commentProtocol = {
        ...(config.commentProtocol ?? {}),
        commands: { ...DEFAULT_COMMENT_PROTOCOL.commands, ...(config.commentProtocol?.commands ?? {}), [key]: value },
      };
      writeConfig(configPath, config);
      console.log(`Comment protocol ${key} updated`);
      return;
    }

    console.log(usage());
    return;
  }

  if (command === "commands") {
    const { config } = loadConfig();
    const agent = resolveAgentHarness(config);
    const protocol = resolveCommentProtocol(config);
    const lines = [
      protocol.commands.qaGenerate,
      protocol.commands.qaPass,
      `${protocol.commands.qaFail} <notes>`,
      protocol.commands.ralphRun,
      `${protocol.commands.ralphAccept} <reason>`,
      protocol.commands.finalCreate,
      `${agent.commandPrefix} ${agent.commands.proposePlans}`,
      `${agent.commandPrefix} ${agent.commands.implement}`,
      `${agent.commandPrefix} ${agent.commands.fixRobust}`,
    ];
    console.log(lines.join("\n"));
    return;
  }

  console.log(usage());
}

main();
