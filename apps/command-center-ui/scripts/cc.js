#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import Database from "better-sqlite3";
import { Octokit } from "@octokit/rest";

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
  cc interactive [--test]
  cc init [--provider <opencode|codex|claude-code>] [--owner <org>] [--repo <name>] [--token <ghp_...>] [--test]
  cc config show [--json] [--test]
  cc config set-provider <opencode|codex|claude-code> [--test]
  cc config set-prefix <commandPrefix> [--test]
  cc config set-command <proposePlans|implement|fixRobust> <text> [--test]
  cc config set-comment <qaGenerate|qaPass|qaFail|ralphRun|ralphAccept|finalCreate> <text> [--test]
  cc commands [--owner <org> --repo <name>] [--test]
  cc features list [--limit N] [--json] [--test]
  cc features create --title <title> [--description <text>] [--priority <low|med|high>] [--impact <low|med|high>] [--effort <low|med|high>] [--confidence <low|med|high>] [--tags a,b] [--json] [--test]
  cc features status --id <feature_id> --status <STATUS> [--json] [--test]
  cc repos list [--json] [--test]
  cc repos add --owner <org> --name <repo> [--default-branch main] [--github-repo-id 123] [--json] [--test]
  cc repos set-agent --owner <org> --name <repo> [--provider opencode] [--prefix /opencode] [--command-propose "<text>"] [--command-implement "<text>"] [--command-fix "<text>"] [--json] [--test]
  cc qa get --feature-id <id> [--json] [--test]
  cc qa create --feature-id <id> --items "one|two|three" [--json] [--test]
  cc qa update --id <id> [--status <testing|failed|passed>] [--checklist-json <json>] [--json] [--test]
  cc prs list --owner <org> --repo <name> [--json] [--test]
  cc pr-comment post --owner <org> --repo <name> --pr <number> --body <text> [--json] [--test]
  cc recent list [--limit N] [--json] [--test]

Notes:
  - Config file: .command-center.jsonc (created if missing)
  - GH_TOKEN and defaults live in apps/command-center-ui/.env.local
  - --test prints planned commands and skips writes/API calls
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

function hasFlag(rest, flag) {
  return rest.includes(flag);
}

function outputDryRun(commands, jsonOutput) {
  if (jsonOutput) {
    console.log(JSON.stringify({ dryRun: true, commands }, null, 2));
    return;
  }
  console.log("Dry run - commands:");
  commands.forEach((cmd) => console.log(`- ${cmd}`));
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

function loadEnvLocal() {
  const repoRoot = findRepoRoot();
  const uiEnvPath = path.join(repoRoot, "apps", "command-center-ui", ".env.local");
  if (!fs.existsSync(uiEnvPath)) return {};
  const raw = fs.readFileSync(uiEnvPath, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const map = {};
  for (const line of lines) {
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx);
    const value = line.slice(idx + 1);
    map[key] = value;
  }
  return map;
}

function getDb() {
  const repoRoot = findRepoRoot();
  const dataDir = path.join(repoRoot, ".data");
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, "command-center.sqlite");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  migrate(db);
  return db;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pr_targets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner TEXT NOT NULL,
      repo TEXT NOT NULL,
      pr_number INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_pr_targets_owner_repo_pr
      ON pr_targets(owner, repo, pr_number);

    CREATE TABLE IF NOT EXISTS repos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner TEXT NOT NULL,
      name TEXT NOT NULL,
      default_branch TEXT,
      github_repo_id INTEGER,
      settings_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_repos_owner_name
      ON repos(owner, name);

    CREATE TABLE IF NOT EXISTS features (
      id TEXT PRIMARY KEY,
      repo_id INTEGER,
      title TEXT NOT NULL,
      description_md TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_refs_json TEXT NOT NULL,
      status TEXT NOT NULL,
      priority TEXT NOT NULL,
      impact TEXT NOT NULL,
      effort TEXT NOT NULL,
      confidence TEXT NOT NULL,
      tags_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (repo_id) REFERENCES repos(id)
    );

    CREATE INDEX IF NOT EXISTS idx_features_repo_status
      ON features(repo_id, status);

    CREATE TABLE IF NOT EXISTS qa_packets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      feature_id TEXT NOT NULL,
      status TEXT NOT NULL,
      checklist_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (feature_id) REFERENCES features(id)
    );

    CREATE INDEX IF NOT EXISTS idx_qa_packets_feature
      ON qa_packets(feature_id);
  `);
}

function nowIso() {
  return new Date().toISOString();
}

function newFeatureId() {
  const iso = new Date().toISOString().slice(0, 10);
  const rand = Math.random().toString(36).slice(2, 6);
  return `feat_${iso}_${rand}`;
}

function listFeatures(limit = 50) {
  const db = getDb();
  const stmt = db.prepare("SELECT * FROM features ORDER BY created_at DESC LIMIT ?");
  return stmt.all(limit);
}

function createFeature(payload) {
  const db = getDb();
  const createdAt = nowIso();
  const record = {
    id: newFeatureId(),
    repo_id: null,
    title: payload.title,
    description_md: payload.description_md ?? "",
    source_type: "manual",
    source_refs_json: "[]",
    status: payload.status ?? "PROPOSED",
    priority: payload.priority ?? "med",
    impact: payload.impact ?? "med",
    effort: payload.effort ?? "med",
    confidence: payload.confidence ?? "med",
    tags_json: JSON.stringify(payload.tags ?? []),
    created_at: createdAt,
    updated_at: createdAt,
  };
  const stmt = db.prepare(
    `INSERT INTO features (
      id, repo_id, title, description_md, source_type, source_refs_json, status,
      priority, impact, effort, confidence, tags_json, created_at, updated_at
    ) VALUES (
      @id, @repo_id, @title, @description_md, @source_type, @source_refs_json, @status,
      @priority, @impact, @effort, @confidence, @tags_json, @created_at, @updated_at
    )`
  );
  stmt.run(record);
  return record;
}

function updateFeatureStatus(id, status) {
  const db = getDb();
  db.prepare("UPDATE features SET status = ?, updated_at = ? WHERE id = ?").run(status, nowIso(), id);
}

function listRepos() {
  const db = getDb();
  const stmt = db.prepare("SELECT * FROM repos ORDER BY created_at DESC");
  return stmt.all();
}

function upsertRepo(payload) {
  const db = getDb();
  const now = nowIso();
  const settingsJson = JSON.stringify(payload.settings || {});
  const existing = db.prepare("SELECT id FROM repos WHERE owner = ? AND name = ?").get(payload.owner, payload.name);
  if (existing) {
    db.prepare(
      "UPDATE repos SET default_branch = ?, github_repo_id = ?, settings_json = ?, updated_at = ? WHERE owner = ? AND name = ?"
    ).run(payload.default_branch || null, payload.github_repo_id || null, settingsJson, now, payload.owner, payload.name);
    return db.prepare("SELECT * FROM repos WHERE owner = ? AND name = ?").get(payload.owner, payload.name);
  }
  const stmt = db.prepare(
    "INSERT INTO repos(owner, name, default_branch, github_repo_id, settings_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  stmt.run(payload.owner, payload.name, payload.default_branch || null, payload.github_repo_id || null, settingsJson, now, now);
  return db.prepare("SELECT * FROM repos WHERE owner = ? AND name = ?").get(payload.owner, payload.name);
}

function getRepo(owner, name) {
  const db = getDb();
  return db.prepare("SELECT * FROM repos WHERE owner = ? AND name = ?").get(owner, name) ?? null;
}

function setRepoAgent(owner, name, agentConfig) {
  const repo = getRepo(owner, name);
  if (!repo) return null;
  const settings = JSON.parse(repo.settings_json || "{}");
  settings.agentHarness = agentConfig;
  return upsertRepo({ owner, name, default_branch: repo.default_branch, github_repo_id: repo.github_repo_id, settings });
}

function resolveRepoAgent(owner, name, baseAgent) {
  const repo = getRepo(owner, name);
  if (!repo) return baseAgent;
  let settings = {};
  try {
    settings = JSON.parse(repo.settings_json || "{}");
  } catch {
    settings = {};
  }
  const override = settings.agentHarness || {};
  return {
    ...baseAgent,
    ...override,
    commandPrefix: override.commandPrefix || baseAgent.commandPrefix,
    commands: { ...baseAgent.commands, ...(override.commands || {}) },
  };
}

function getLatestQaPacket(featureId) {
  const db = getDb();
  const stmt = db.prepare("SELECT * FROM qa_packets WHERE feature_id = ? ORDER BY id DESC LIMIT 1");
  return stmt.get(featureId) ?? null;
}

function createQaPacket(featureId, checklist) {
  const db = getDb();
  const now = nowIso();
  const record = {
    feature_id: featureId,
    status: "testing",
    checklist_json: JSON.stringify(checklist),
    created_at: now,
    updated_at: now,
  };
  const stmt = db.prepare(
    "INSERT INTO qa_packets(feature_id, status, checklist_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  );
  const info = stmt.run(record.feature_id, record.status, record.checklist_json, record.created_at, record.updated_at);
  return { id: Number(info.lastInsertRowid), ...record };
}

function updateQaPacket(id, updates) {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM qa_packets WHERE id = ?").get(id);
  if (!existing) return null;
  const status = updates.status ?? existing.status;
  const checklist_json = updates.checklist_json ?? existing.checklist_json;
  const updated_at = nowIso();
  db.prepare("UPDATE qa_packets SET status = ?, checklist_json = ?, updated_at = ? WHERE id = ?")
    .run(status, checklist_json, updated_at, id);
  return { ...existing, status, checklist_json, updated_at };
}

function listRecentTargets(limit = 10) {
  const db = getDb();
  const stmt = db.prepare(
    "SELECT owner, repo, pr_number, created_at FROM pr_targets ORDER BY id DESC LIMIT ?"
  );
  return stmt.all(limit);
}

function savePrTarget(owner, repo, prNumber) {
  const db = getDb();
  db.prepare(
    "INSERT INTO pr_targets(owner, repo, pr_number, created_at) VALUES (?, ?, ?, ?)"
  ).run(owner, repo, prNumber, nowIso());
}

function getOctokit() {
  const env = loadEnvLocal();
  const token = env.GH_TOKEN || process.env.GH_TOKEN;
  if (!token) throw new Error("Missing GH_TOKEN. Run cc init or set apps/command-center-ui/.env.local.");
  return new Octokit({ auth: token });
}

async function listOpenPrs(owner, repo) {
  const octokit = getOctokit();
  const resp = await octokit.pulls.list({ owner, repo, state: "open", per_page: 20 });
  return resp.data;
}

async function postPrComment(owner, repo, prNumber, body) {
  const octokit = getOctokit();
  const resp = await octokit.issues.createComment({
    owner,
    repo,
    issue_number: Number(prNumber),
    body,
  });
  savePrTarget(owner, repo, Number(prNumber));
  return resp.data.html_url;
}

async function main() {
  const { command, rest } = parseArgs(process.argv.slice(2));
  const jsonOutput = hasFlag(rest, "--json");
  const testMode = hasFlag(rest, "--test");

  if (!command || command === "help" || command === "--help" || command === "-h") {
    console.log(usage());
    return;
  }

  if (command === "interactive") {
    if (testMode) {
      outputDryRun(["prompt for interactive selections"], jsonOutput);
      return;
    }
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q) => new Promise((resolve) => rl.question(q, resolve));
    console.log("DryDock CLI - Interactive");
    console.log("1) List features");
    console.log("2) Create feature");
    console.log("3) Create QA packet");
    console.log("4) Post PR comment");
    console.log("5) Add repo");
    console.log("6) Set repo agent");
    const choice = await ask("> ");
    if (choice === "1") {
      listFeatures().forEach((item) => console.log(`${item.id} - ${item.title} (${item.status})`));
    } else if (choice === "2") {
      const title = await ask("Title: ");
      const description = await ask("Description: ");
      const item = createFeature({ title, description_md: description });
      console.log(`Created ${item.id}`);
    } else if (choice === "3") {
      const featureId = await ask("Feature ID: ");
      const items = await ask("Checklist items (pipe separated): ");
      const checklist = items.split("|").map((text, idx) => ({
        id: `item_${idx + 1}`,
        text: text.trim(),
        status: "pending",
        notes: "",
        evidence: "",
      })).filter((item) => item.text.length > 0);
      const packet = createQaPacket(featureId, checklist);
      updateFeatureStatus(featureId, "QA_IN_PROGRESS");
      console.log(`Created QA ${packet.id}`);
    } else if (choice === "4") {
      const owner = await ask("Owner: ");
      const repo = await ask("Repo: ");
      const pr = await ask("PR number: ");
      const body = await ask("Comment body: ");
      const url = await postPrComment(owner, repo, pr, body);
      console.log(`Posted ${url}`);
    } else if (choice === "5") {
      const owner = await ask("Owner: ");
      const name = await ask("Repo: ");
      const defaultBranch = await ask("Default branch (optional): ");
      const repo = upsertRepo({
        owner,
        name,
        default_branch: defaultBranch || null,
        github_repo_id: null,
        settings: {},
      });
      console.log(`Saved ${repo.owner}/${repo.name}`);
    } else if (choice === "6") {
      const owner = await ask("Owner: ");
      const name = await ask("Repo: ");
      const provider = await ask("Provider (opencode/codex/claude-code): ");
      const prefix = await ask("Command prefix (optional): ");
      const base = resolveAgentHarness(loadConfig().config);
      const agentConfig = {
        ...base,
        provider: provider || base.provider,
        commandPrefix: prefix || base.commandPrefix,
      };
      const repo = setRepoAgent(owner, name, agentConfig);
      if (!repo) {
        console.log("Repo not found");
      } else {
        console.log(`Updated ${repo.owner}/${repo.name}`);
      }
    }
    rl.close();
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
    if (testMode) {
      const repoRoot = findRepoRoot();
      const configPath = path.join(repoRoot, CONFIG_FILENAME);
      const commands = [
        `ensure config exists at ${configPath}`,
        `set agent harness provider to ${provider}`,
      ];
      if (owner || repo || token) {
        commands.push("write apps/command-center-ui/.env.local");
      }
      outputDryRun(commands, jsonOutput);
      return;
    }
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
      if (testMode) {
        outputDryRun([`read ${configPath}`, "print resolved config"], jsonOutput);
        return;
      }
      const agent = resolveAgentHarness(config);
      const protocol = resolveCommentProtocol(config);
      const payload = { configPath, agentHarness: agent, commentProtocol: protocol };
      console.log(jsonOutput ? JSON.stringify(payload) : JSON.stringify(payload, null, 2));
      return;
    }

    if (sub === "set-provider") {
      const provider = rest[1];
      if (!provider || !(provider in AGENT_PRESETS)) {
        console.error("Provider must be one of: opencode, codex, claude-code");
        process.exit(1);
      }
      if (testMode) {
        outputDryRun([`update ${configPath} agentHarness.provider=${provider}`], jsonOutput);
        return;
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
      if (testMode) {
        outputDryRun([`update ${configPath} agentHarness.commandPrefix=${prefix}`], jsonOutput);
        return;
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
      if (testMode) {
        outputDryRun([`update ${configPath} agentHarness.commands.${key}="${value}"`], jsonOutput);
        return;
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
      if (testMode) {
        outputDryRun([`update ${configPath} commentProtocol.commands.${key}="${value}"`], jsonOutput);
        return;
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
    if (testMode) {
      const repoOwner = parseFlagValue(rest, "--owner");
      const repoName = parseFlagValue(rest, "--repo");
      const extra = repoOwner && repoName ? ` for ${repoOwner}/${repoName}` : "";
      outputDryRun([`read ${CONFIG_FILENAME}`, `print command list${extra}`], jsonOutput);
      return;
    }
    const { config } = loadConfig();
    const agent = resolveAgentHarness(config);
    const protocol = resolveCommentProtocol(config);
    const repoOwner = parseFlagValue(rest, "--owner");
    const repoName = parseFlagValue(rest, "--repo");
    const resolvedAgent = repoOwner && repoName ? resolveRepoAgent(repoOwner, repoName, agent) : agent;
    const lines = [
      protocol.commands.qaGenerate,
      protocol.commands.qaPass,
      `${protocol.commands.qaFail} <notes>`,
      protocol.commands.ralphRun,
      `${protocol.commands.ralphAccept} <reason>`,
      protocol.commands.finalCreate,
      `${resolvedAgent.commandPrefix} ${resolvedAgent.commands.proposePlans}`,
      `${resolvedAgent.commandPrefix} ${resolvedAgent.commands.implement}`,
      `${resolvedAgent.commandPrefix} ${resolvedAgent.commands.fixRobust}`,
    ];
    console.log(lines.join("\n"));
    return;
  }

  if (command === "features") {
    const sub = rest[0];
    if (sub === "list") {
      const limit = Number(parseFlagValue(rest, "--limit") ?? "50");
      if (testMode) {
        const safeLimit = Number.isFinite(limit) ? limit : 50;
        outputDryRun([`sqlite: SELECT * FROM features ORDER BY created_at DESC LIMIT ${safeLimit}`], jsonOutput);
        return;
      }
      const items = listFeatures(Number.isFinite(limit) ? limit : 50);
      console.log(jsonOutput ? JSON.stringify({ items }) : JSON.stringify({ items }, null, 2));
      return;
    }
    if (sub === "create") {
      const title = parseFlagValue(rest, "--title");
      if (!title) {
        console.error("Usage: cc features create --title <title>");
        process.exit(1);
      }
      if (testMode) {
        outputDryRun([`sqlite: INSERT feature "${title}"`], jsonOutput);
        return;
      }
      const payload = {
        title,
        description_md: parseFlagValue(rest, "--description"),
        status: parseFlagValue(rest, "--status"),
        priority: parseFlagValue(rest, "--priority"),
        impact: parseFlagValue(rest, "--impact"),
        effort: parseFlagValue(rest, "--effort"),
        confidence: parseFlagValue(rest, "--confidence"),
        tags: (parseFlagValue(rest, "--tags") || "").split(",").map((t) => t.trim()).filter(Boolean),
      };
      const item = createFeature(payload);
      console.log(jsonOutput ? JSON.stringify({ item }) : JSON.stringify({ item }, null, 2));
      return;
    }
    if (sub === "status") {
      const id = parseFlagValue(rest, "--id");
      const status = parseFlagValue(rest, "--status");
      if (!id || !status) {
        console.error("Usage: cc features status --id <feature_id> --status <STATUS>");
        process.exit(1);
      }
      if (testMode) {
        outputDryRun([`sqlite: UPDATE features SET status=${status} WHERE id=${id}`], jsonOutput);
        return;
      }
      updateFeatureStatus(id, status);
      console.log(jsonOutput ? JSON.stringify({ ok: true }) : JSON.stringify({ ok: true }, null, 2));
      return;
    }
  }

  if (command === "repos") {
    const sub = rest[0];
    if (sub === "list") {
      if (testMode) {
        outputDryRun(["sqlite: SELECT * FROM repos ORDER BY created_at DESC"], jsonOutput);
        return;
      }
      const items = listRepos();
      console.log(jsonOutput ? JSON.stringify({ items }) : JSON.stringify({ items }, null, 2));
      return;
    }
    if (sub === "add") {
      const owner = parseFlagValue(rest, "--owner");
      const name = parseFlagValue(rest, "--name");
      if (!owner || !name) {
        console.error("Usage: cc repos add --owner <org> --name <repo> [--default-branch main]");
        process.exit(1);
      }
      if (testMode) {
        outputDryRun([`sqlite: INSERT repo ${owner}/${name}`], jsonOutput);
        return;
      }
      const repo = upsertRepo({
        owner,
        name,
        default_branch: parseFlagValue(rest, "--default-branch"),
        github_repo_id: parseFlagValue(rest, "--github-repo-id"),
        settings: {},
      });
      console.log(jsonOutput ? JSON.stringify({ item: repo }) : JSON.stringify({ item: repo }, null, 2));
      return;
    }
    if (sub === "set-agent") {
      const owner = parseFlagValue(rest, "--owner");
      const name = parseFlagValue(rest, "--name");
      const provider = parseFlagValue(rest, "--provider");
      const prefix = parseFlagValue(rest, "--prefix");
      const cmdPropose = parseFlagValue(rest, "--command-propose");
      const cmdImplement = parseFlagValue(rest, "--command-implement");
      const cmdFix = parseFlagValue(rest, "--command-fix");
      if (!owner || !name) {
        console.error("Usage: cc repos set-agent --owner <org> --name <repo> [--provider opencode] [--prefix /opencode]");
        process.exit(1);
      }
      if (testMode) {
        outputDryRun([`sqlite: UPDATE repo ${owner}/${name} agent settings`], jsonOutput);
        return;
      }
      const base = resolveAgentHarness(loadConfig().config);
      const agentConfig = {
        ...base,
        provider: provider || base.provider,
        commandPrefix: prefix || base.commandPrefix,
        commands: {
          ...base.commands,
          ...(cmdPropose ? { proposePlans: cmdPropose } : {}),
          ...(cmdImplement ? { implement: cmdImplement } : {}),
          ...(cmdFix ? { fixRobust: cmdFix } : {}),
        },
      };
      const repo = setRepoAgent(owner, name, agentConfig);
      if (!repo) {
        console.error("Repo not found");
        process.exit(1);
      }
      console.log(jsonOutput ? JSON.stringify({ item: repo }) : JSON.stringify({ item: repo }, null, 2));
      return;
    }
  }

  if (command === "qa") {
    const sub = rest[0];
    if (sub === "get") {
      const featureId = parseFlagValue(rest, "--feature-id");
      if (!featureId) {
        console.error("--feature-id is required");
        process.exit(1);
      }
      if (testMode) {
        outputDryRun([`sqlite: SELECT * FROM qa_packets WHERE feature_id=${featureId} ORDER BY id DESC LIMIT 1`], jsonOutput);
        return;
      }
      const packet = getLatestQaPacket(featureId);
      const item = packet ? { ...packet, checklist: JSON.parse(packet.checklist_json || "[]") } : null;
      console.log(jsonOutput ? JSON.stringify({ item }) : JSON.stringify({ item }, null, 2));
      return;
    }
    if (sub === "create") {
      const featureId = parseFlagValue(rest, "--feature-id");
      const itemsRaw = parseFlagValue(rest, "--items");
      if (!featureId || !itemsRaw) {
        console.error("Usage: cc qa create --feature-id <id> --items \"one|two|three\"");
        process.exit(1);
      }
      if (testMode) {
        outputDryRun([
          `sqlite: INSERT qa_packet for feature ${featureId}`,
          `sqlite: UPDATE features SET status=QA_IN_PROGRESS WHERE id=${featureId}`,
        ], jsonOutput);
        return;
      }
      const checklist = itemsRaw.split("|").map((text, idx) => ({
        id: `item_${idx + 1}`,
        text: text.trim(),
        status: "pending",
        notes: "",
        evidence: "",
      })).filter((item) => item.text.length > 0);
      const packet = createQaPacket(featureId, checklist);
      updateFeatureStatus(featureId, "QA_IN_PROGRESS");
      const item = { ...packet, checklist };
      console.log(jsonOutput ? JSON.stringify({ item }) : JSON.stringify({ item }, null, 2));
      return;
    }
    if (sub === "update") {
      const id = Number(parseFlagValue(rest, "--id"));
      if (!id) {
        console.error("Usage: cc qa update --id <id> [--status <status>] [--checklist-json <json>]");
        process.exit(1);
      }
      if (testMode) {
        outputDryRun([
          `sqlite: UPDATE qa_packets SET status/checklist_json WHERE id=${id}`,
          "sqlite: UPDATE features status based on QA status",
        ], jsonOutput);
        return;
      }
      const status = parseFlagValue(rest, "--status");
      const checklistJson = parseFlagValue(rest, "--checklist-json");
      const packet = updateQaPacket(id, { status, checklist_json: checklistJson });
      if (!packet) {
        console.error("QA packet not found");
        process.exit(1);
      }
      if (status === "failed") updateFeatureStatus(packet.feature_id, "QA_FAILED");
      if (status === "passed") updateFeatureStatus(packet.feature_id, "QA_PASSED");
      if (status === "testing") updateFeatureStatus(packet.feature_id, "QA_IN_PROGRESS");
      const item = { ...packet, checklist: JSON.parse(packet.checklist_json || "[]") };
      console.log(jsonOutput ? JSON.stringify({ item }) : JSON.stringify({ item }, null, 2));
      return;
    }
  }

  if (command === "prs") {
    const sub = rest[0];
    if (sub === "list") {
      const owner = parseFlagValue(rest, "--owner");
      const repo = parseFlagValue(rest, "--repo");
      if (!owner || !repo) {
        console.error("Usage: cc prs list --owner <org> --repo <name>");
        process.exit(1);
      }
      if (testMode) {
        outputDryRun([`github: pulls.list owner=${owner} repo=${repo} state=open per_page=20`], jsonOutput);
        return;
      }
      const items = await listOpenPrs(owner, repo);
      console.log(jsonOutput ? JSON.stringify({ items }) : JSON.stringify({ items }, null, 2));
      return;
    }
  }

  if (command === "pr-comment") {
    const sub = rest[0];
    if (sub === "post") {
      const owner = parseFlagValue(rest, "--owner");
      const repo = parseFlagValue(rest, "--repo");
      const pr = parseFlagValue(rest, "--pr");
      const body = parseFlagValue(rest, "--body");
      if (!owner || !repo || !pr || !body) {
        console.error("Usage: cc pr-comment post --owner <org> --repo <name> --pr <number> --body <text>");
        process.exit(1);
      }
      if (testMode) {
        outputDryRun([
          `github: issues.createComment owner=${owner} repo=${repo} issue_number=${pr}`,
          "sqlite: INSERT pr_targets",
        ], jsonOutput);
        return;
      }
      const url = await postPrComment(owner, repo, pr, body);
      console.log(jsonOutput ? JSON.stringify({ url }) : JSON.stringify({ url }, null, 2));
      return;
    }
  }

  if (command === "recent") {
    const sub = rest[0];
    if (sub === "list") {
      const limit = Number(parseFlagValue(rest, "--limit") ?? "12");
      if (testMode) {
        const safeLimit = Number.isFinite(limit) ? limit : 12;
        outputDryRun([`sqlite: SELECT owner, repo, pr_number, created_at FROM pr_targets ORDER BY id DESC LIMIT ${safeLimit}`], jsonOutput);
        return;
      }
      const items = listRecentTargets(Number.isFinite(limit) ? limit : 12);
      console.log(jsonOutput ? JSON.stringify({ items }) : JSON.stringify({ items }, null, 2));
      return;
    }
  }

  console.log(usage());
}

void main();
