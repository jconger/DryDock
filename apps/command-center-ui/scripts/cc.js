#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { execFileSync, spawnSync } from "node:child_process";
import Database from "better-sqlite3";
import { Octokit } from "@octokit/rest";

const CONFIG_FILENAME = ".command-center.jsonc";

const AGENT_PRESETS = {
  opencode: { label: "OpenCode", commandPrefix: "/opencode" },
  codex: { label: "Codex", commandPrefix: "/codex" },
  "claude-code": { label: "Claude Code", commandPrefix: "/claude" },
};

const AGENT_EXEC_DEFAULTS = {
  opencode: { bin: "opencode", args: ["{{PROMPT}}"], stdin: false },
  codex: { bin: "codex", args: ["{{PROMPT}}"], stdin: false },
  "claude-code": { bin: "claude", args: ["{{PROMPT}}"], stdin: false },
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

const DEFAULT_REPO_COMMANDS = {
  install: "pnpm install --frozen-lockfile",
  dev: "pnpm dev",
  lint: "pnpm lint",
  typecheck: "pnpm typecheck",
  test: "pnpm test",
  build: "pnpm build",
};

const DEFAULT_TEMPLATES = {
  qaPacketPath: "docs/command-center/templates/qa-packet.md",
  fixBundlePath: "docs/command-center/templates/fix-bundle.md",
  ralphReportPath: "docs/command-center/templates/ralph-report.md",
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
    commands: DEFAULT_REPO_COMMANDS,
    qa: {
      maxChecklistItems: 25,
      requireCiGreenToCreateFinalPr: false,
      requireRalphGateBeforeFinalPr: true,
    },
    templates: DEFAULT_TEMPLATES,
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
  const execDefaults = AGENT_EXEC_DEFAULTS[provider];
  const execOverride = config.agentHarness?.exec ?? {};
  const execArgsRaw = execOverride.args ?? execDefaults.args;
  const execArgs = Array.isArray(execArgsRaw) ? execArgsRaw : [String(execArgsRaw)];
  return {
    provider,
    label: preset.label,
    commandPrefix: config.agentHarness?.commandPrefix ?? preset.commandPrefix,
    commands: { ...DEFAULT_AGENT_COMMANDS, ...(config.agentHarness?.commands ?? {}) },
    exec: {
      bin: execOverride.bin ?? execDefaults.bin,
      args: execArgs,
      stdin: execOverride.stdin ?? execDefaults.stdin ?? false,
    },
  };
}

function resolveCommentProtocol(config) {
  return {
    prefix: config.commentProtocol?.prefix ?? DEFAULT_COMMENT_PROTOCOL.prefix,
    commands: { ...DEFAULT_COMMENT_PROTOCOL.commands, ...(config.commentProtocol?.commands ?? {}) },
  };
}

function resolveRepoCommands(config) {
  return { ...DEFAULT_REPO_COMMANDS, ...(config.commands ?? {}) };
}

function resolveTemplates(config) {
  return { ...DEFAULT_TEMPLATES, ...(config.templates ?? {}) };
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
  cc commands [--owner <org> --repo <name>] [--include-agent] [--test]
  cc agent run --mode <propose|implement|fix> [--owner <org> --repo <name>] [--prompt <text>] [--context <text>] [--json] [--test]
  cc features list [--limit N] [--json] [--test]
  cc features create --title <title> [--description <text>] [--priority <low|med|high>] [--impact <low|med|high>] [--effort <low|med|high>] [--confidence <low|med|high>] [--tags a,b] [--json] [--test]
  cc features status --id <feature_id> --status <STATUS> [--json] [--test]
  cc repos list [--json] [--test]
  cc repos add --owner <org> --name <repo> [--default-branch main] [--github-repo-id 123] [--json] [--test]
  cc repos set-agent --owner <org> --name <repo> [--provider opencode] [--prefix /opencode] [--command-propose "<text>"] [--command-implement "<text>"] [--command-fix "<text>"] [--json] [--test]
  cc repos set-config --owner <org> --name <repo> --config-json <json> [--replace] [--json] [--test]
  cc templates render --type <qa|fix-bundle|ralph> [--owner <org> --repo <name>] [--feature-id <id>] [--data-json <json>] [--json] [--test]
  cc qa get --feature-id <id> [--json] [--test]
  cc qa create --feature-id <id> --items "one|two|three" [--json] [--test]
  cc qa update --id <id> [--status <testing|failed|passed>] [--checklist-json <json>] [--json] [--test]
  cc prs list --owner <org> --repo <name> [--json] [--test]
  cc prs context --owner <org> --repo <name> --pr <number> [--json] [--test]
  cc prs track --owner <org> --repo <name> --pr <number> --type <working|final> [--working-pr <number>] [--json] [--test]
  cc prs tracked --owner <org> --repo <name> [--type <working|final>] [--json] [--test]
  cc pr-comment post --owner <org> --repo <name> --pr <number> --body <text> [--json] [--test]
  cc recent list [--limit N] [--json] [--test]
  cc final create --owner <org> --repo <name> --pr <number> --mode <squash|cherry-pick> [--json] [--test]

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

function normalizeList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string") {
    return value.split("|").map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function limitList(items, maxItems) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, Math.max(0, maxItems));
}

function renderChecklist(items, fallback) {
  if (!items.length) return fallback;
  return items.map((item) => `- [ ] ${item}`).join("\n");
}

function renderBullets(items, fallback) {
  if (!items.length) return fallback;
  return items.map((item) => `- ${item}`).join("\n");
}

function renderNumbered(items, fallback) {
  if (!items.length) return fallback;
  return items.map((item, idx) => `${idx + 1}. ${item}`).join("\n");
}

function renderTemplate(template, values) {
  return template.replace(/{{\s*([A-Z0-9_]+)\s*}}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      return String(values[key]);
    }
    return match;
  });
}

function resolvePrompt(mode, agent, promptOverride, context) {
  let base = "";
  if (promptOverride) {
    base = promptOverride;
  } else if (mode === "propose") {
    base = agent.commands.proposePlans;
  } else if (mode === "implement") {
    base = agent.commands.implement;
  } else if (mode === "fix") {
    base = agent.commands.fixRobust;
  }
  const trimmed = base.trim();
  if (context) {
    return `${trimmed}\n\n${context.trim()}`.trim();
  }
  return trimmed;
}

function buildExecArgs(args, prompt, repoRoot, allowAppend) {
  const hasPrompt = args.some((arg) => String(arg).includes("{{PROMPT}}"));
  const replaced = args.map((arg) => String(arg)
    .replaceAll("{{PROMPT}}", prompt)
    .replaceAll("{{REPO_ROOT}}", repoRoot)
  );
  if (!hasPrompt && prompt && allowAppend) {
    replaced.push(prompt);
  }
  return replaced;
}

function readStdin() {
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    return "";
  }
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

    CREATE TABLE IF NOT EXISTS pull_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner TEXT NOT NULL,
      repo TEXT NOT NULL,
      pr_number INTEGER NOT NULL,
      pr_type TEXT NOT NULL,
      base_branch TEXT,
      head_branch TEXT,
      title TEXT,
      url TEXT,
      working_pr_number INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_pull_requests_unique
      ON pull_requests(owner, repo, pr_number);

    CREATE INDEX IF NOT EXISTS idx_pull_requests_type
      ON pull_requests(owner, repo, pr_type);
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

function getFeatureById(id) {
  const db = getDb();
  return db.prepare("SELECT * FROM features WHERE id = ?").get(id) ?? null;
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
    exec: { ...baseAgent.exec, ...(override.exec || {}) },
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeDeep(base, overrides) {
  const output = { ...(base || {}) };
  if (!isPlainObject(overrides)) return output;
  for (const [key, value] of Object.entries(overrides)) {
    if (isPlainObject(value) && isPlainObject(output[key])) {
      output[key] = mergeDeep(output[key], value);
    } else {
      output[key] = value;
    }
  }
  return output;
}

function resolveRepoConfig(owner, name, baseConfig) {
  const repo = getRepo(owner, name);
  if (!repo) return baseConfig;
  let settings = {};
  try {
    settings = JSON.parse(repo.settings_json || "{}");
  } catch {
    settings = {};
  }
  const overrides = settings.repoConfig || {};
  const merged = mergeDeep(baseConfig, overrides);
  return {
    ...merged,
    commands: resolveRepoCommands(merged),
    templates: resolveTemplates(merged),
  };
}

function setRepoConfig(owner, name, repoConfig, replace = false) {
  const repo = getRepo(owner, name);
  if (!repo) return null;
  let settings = {};
  try {
    settings = JSON.parse(repo.settings_json || "{}");
  } catch {
    settings = {};
  }
  const current = settings.repoConfig || {};
  settings.repoConfig = replace ? (repoConfig || {}) : mergeDeep(current, repoConfig || {});
  return upsertRepo({
    owner,
    name,
    default_branch: repo.default_branch,
    github_repo_id: repo.github_repo_id,
    settings,
  });
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

function buildTemplateValues({ type, data, feature, agent, commands, maxItems }) {
  const featureId = data.feature_id || feature?.id || "(feature id)";
  const featureTitle = data.feature_title || feature?.title || "(feature title)";
  const workingPr = data.working_pr || "(working PR url)";
  const workingBranch = data.working_branch || "(working branch)";
  const specRef = data.spec_ref || "(spec reference)";
  const now = nowIso();

  const acceptanceItems = limitList(normalizeList(data.acceptance), maxItems);
  const edgeItems = limitList(normalizeList(data.edge), maxItems);
  const ralphChecklistItems = limitList(normalizeList(data.ralph_checklist), maxItems);
  const failedItems = limitList(normalizeList(data.failed_checks), maxItems);
  const reproSteps = limitList(normalizeList(data.repro_steps), maxItems);
  const changedFiles = limitList(normalizeList(data.changed_files), maxItems);
  const ralphFindings = limitList(normalizeList(data.ralph_findings), maxItems);

  const values = {
    FEATURE_ID: featureId,
    FEATURE_TITLE: featureTitle,
    WORKING_PR_URL: workingPr,
    WORKING_BRANCH: workingBranch,
    SPEC_REF: specRef,
    GENERATED_AT_ISO: now,
    CMD_INSTALL: commands.install,
    CMD_DEV: commands.dev,
    CMD_LINT: commands.lint,
    CMD_TYPECHECK: commands.typecheck,
    CMD_TEST: commands.test,
    AGENT_PROVIDER: agent.provider,
    AGENT_COMMAND_PREFIX: agent.commandPrefix,
    AGENT_PLAN_PROMPT: agent.commands.proposePlans,
    RESULT_NOTES: data.result_notes || "(add notes)",
  };

  if (type === "qa") {
    return {
      ...values,
      ACCEPTANCE_CHECKLIST: renderChecklist(acceptanceItems, "- [ ] Add acceptance checks"),
      EDGE_CASE_CHECKLIST: renderChecklist(edgeItems, "- [ ] Add edge case coverage"),
      RALPH_CHECKLIST: renderChecklist(ralphChecklistItems, "- [ ] Add Ralph checks"),
    };
  }

  if (type === "fix-bundle") {
    return {
      ...values,
      FAILED_CHECKS: renderBullets(failedItems, "- (no failed checks provided)"),
      REPRO_STEPS: renderNumbered(reproSteps, "1. Add repro steps"),
      EXPECTED: data.expected || "(expected behavior)",
      ACTUAL: data.actual || "(actual behavior)",
      EVIDENCE: data.evidence || "(evidence/logs)",
      CHANGED_FILES: renderBullets(changedFiles, "- (no files listed)"),
      DIFF_SNIPPETS: data.diff_snippets || "(add diff snippets)",
      FIX_STYLE: data.fix_style || "robust",
    };
  }

  return {
    ...values,
    RALPH_FINDINGS: renderBullets(ralphFindings, "- (add Ralph findings)"),
    RALPH_CHECKLIST: renderChecklist(ralphChecklistItems, "- [ ] Add Ralph checklist items"),
  };
}

function listRecentTargets(limit = 10) {
  const db = getDb();
  const stmt = db.prepare(
    "SELECT owner, repo, pr_number, created_at FROM pr_targets ORDER BY id DESC LIMIT ?"
  );
  return stmt.all(limit);
}

function upsertTrackedPr(record) {
  const db = getDb();
  const now = nowIso();
  const existing = db.prepare("SELECT id FROM pull_requests WHERE owner = ? AND repo = ? AND pr_number = ?")
    .get(record.owner, record.repo, record.pr_number);
  if (existing) {
    db.prepare(
      `UPDATE pull_requests
       SET pr_type = ?, base_branch = ?, head_branch = ?, title = ?, url = ?, working_pr_number = ?, updated_at = ?
       WHERE owner = ? AND repo = ? AND pr_number = ?`
    ).run(
      record.pr_type,
      record.base_branch || null,
      record.head_branch || null,
      record.title || null,
      record.url || null,
      record.working_pr_number ?? null,
      now,
      record.owner,
      record.repo,
      record.pr_number
    );
    return db.prepare("SELECT * FROM pull_requests WHERE id = ?").get(existing.id);
  }
  const stmt = db.prepare(
    `INSERT INTO pull_requests(
      owner, repo, pr_number, pr_type, base_branch, head_branch, title, url, working_pr_number, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  stmt.run(
    record.owner,
    record.repo,
    record.pr_number,
    record.pr_type,
    record.base_branch || null,
    record.head_branch || null,
    record.title || null,
    record.url || null,
    record.working_pr_number ?? null,
    now,
    now
  );
  return db.prepare("SELECT * FROM pull_requests WHERE owner = ? AND repo = ? AND pr_number = ?")
    .get(record.owner, record.repo, record.pr_number);
}

function listTrackedPrs(owner, repo, type) {
  const db = getDb();
  if (type) {
    return db.prepare(
      "SELECT * FROM pull_requests WHERE owner = ? AND repo = ? AND pr_type = ? ORDER BY updated_at DESC"
    ).all(owner, repo, type);
  }
  return db.prepare(
    "SELECT * FROM pull_requests WHERE owner = ? AND repo = ? ORDER BY updated_at DESC"
  ).all(owner, repo);
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

function runGit(args, opts = {}) {
  return execFileSync("git", args, {
    cwd: opts.cwd ?? findRepoRoot(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function ensureCleanGit() {
  const status = runGit(["status", "--porcelain"]);
  if (status) {
    throw new Error("Working tree is not clean. Commit or stash changes before creating a final PR.");
  }
}

function getCurrentBranch() {
  return runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
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
      outputDryRun(
        [
          "prompt for interactive selections",
          "menu: list features, create feature, create QA packet, post PR comment, add repo, set repo agent, set repo config overrides",
        ],
        jsonOutput
      );
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
    console.log("7) Set repo config overrides");
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
    } else if (choice === "7") {
      const owner = await ask("Owner: ");
      const name = await ask("Repo: ");
      const configJson = await ask("Config JSON: ");
      const replaceRaw = await ask("Replace overrides? (y/N): ");
      if (!owner || !name || !configJson.trim()) {
        console.log("Owner, repo, and config JSON are required.");
        rl.close();
        return;
      }
      let repoConfig = {};
      try {
        const parsed = JSON.parse(configJson);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          console.log("Config JSON must be an object.");
          rl.close();
          return;
        }
        repoConfig = parsed;
      } catch {
        console.log("Invalid config JSON.");
        rl.close();
        return;
      }
      const replace = replaceRaw.trim().toLowerCase().startsWith("y");
      const repo = setRepoConfig(owner, name, repoConfig, replace);
      if (!repo) {
        console.log("Repo not found");
      } else {
        console.log(`Updated config for ${repo.owner}/${repo.name}`);
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
      const includeAgent = hasFlag(rest, "--include-agent");
      const extra = repoOwner && repoName ? ` for ${repoOwner}/${repoName}` : "";
      outputDryRun([`read ${CONFIG_FILENAME}`, `print command list${extra}${includeAgent ? " (including agent commands)" : ""}`], jsonOutput);
      return;
    }
    const { config } = loadConfig();
    const agent = resolveAgentHarness(config);
    const protocol = resolveCommentProtocol(config);
    const repoOwner = parseFlagValue(rest, "--owner");
    const repoName = parseFlagValue(rest, "--repo");
    const resolvedAgent = repoOwner && repoName ? resolveRepoAgent(repoOwner, repoName, agent) : agent;
    const includeAgent = hasFlag(rest, "--include-agent");
    const lines = [
      protocol.commands.qaGenerate,
      protocol.commands.qaPass,
      `${protocol.commands.qaFail} <notes>`,
      protocol.commands.ralphRun,
      `${protocol.commands.ralphAccept} <reason>`,
      protocol.commands.finalCreate,
    ];
    if (includeAgent) {
      lines.push(
        `${resolvedAgent.commandPrefix} ${resolvedAgent.commands.proposePlans}`,
        `${resolvedAgent.commandPrefix} ${resolvedAgent.commands.implement}`,
        `${resolvedAgent.commandPrefix} ${resolvedAgent.commands.fixRobust}`
      );
    }
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
    if (sub === "set-config") {
      const owner = parseFlagValue(rest, "--owner");
      const name = parseFlagValue(rest, "--name");
      const configJson = parseFlagValue(rest, "--config-json");
      const replace = hasFlag(rest, "--replace");
      if (!owner || !name || !configJson) {
        console.error("Usage: cc repos set-config --owner <org> --name <repo> --config-json <json> [--replace]");
        process.exit(1);
      }
      if (testMode) {
        outputDryRun([`sqlite: UPDATE repo ${owner}/${name} config overrides`], jsonOutput);
        return;
      }
      let repoConfig = {};
      try {
        const parsed = JSON.parse(configJson);
        if (parsed && typeof parsed === "object") {
          repoConfig = parsed;
        }
      } catch {
        console.error("Invalid --config-json payload.");
        process.exit(1);
      }
      const repo = setRepoConfig(owner, name, repoConfig, replace);
      if (!repo) {
        console.error("Repo not found");
        process.exit(1);
      }
      console.log(jsonOutput ? JSON.stringify({ item: repo }) : JSON.stringify({ item: repo }, null, 2));
      return;
    }
  }

  if (command === "agent") {
    const sub = rest[0];
    if (sub === "run") {
      const mode = parseFlagValue(rest, "--mode");
      if (!mode || !["propose", "implement", "fix"].includes(mode)) {
        console.error("Usage: cc agent run --mode <propose|implement|fix> [--prompt <text>] [--context <text>]");
        process.exit(1);
      }
      const owner = parseFlagValue(rest, "--owner");
      const repoName = parseFlagValue(rest, "--repo");
      const promptOverride = parseFlagValue(rest, "--prompt");
      const context = parseFlagValue(rest, "--context");
      const stdinAllowed = !promptOverride && !context && !process.stdin.isTTY;
      const stdinValue = stdinAllowed ? readStdin() : "";
      const { config } = loadConfig();
      const baseAgent = resolveAgentHarness(config);
      const agent = owner && repoName ? resolveRepoAgent(owner, repoName, baseAgent) : baseAgent;
      const repoRoot = findRepoRoot();
      const prompt = resolvePrompt(mode, agent, promptOverride || undefined, context || undefined) || stdinValue.trim();
      if (!prompt) {
        console.error("Prompt is required. Provide --prompt, --context, or pipe content to stdin.");
        process.exit(1);
      }
      const execConfig = agent.exec;
      const args = buildExecArgs(execConfig.args, prompt, repoRoot, !execConfig.stdin);
      if (testMode) {
        const cmdPreview = `${execConfig.bin} ${args.join(" ")}`.trim();
        outputDryRun([`exec: ${cmdPreview}`, execConfig.stdin ? "stdin: prompt" : "stdin: none"], jsonOutput);
        return;
      }
      const spawnOpts = {
        cwd: repoRoot,
        encoding: "utf8",
        input: execConfig.stdin ? prompt : undefined,
        stdio: jsonOutput ? ["pipe", "pipe", "pipe"] : "inherit",
      };
      const result = spawnSync(execConfig.bin, args, spawnOpts);
      if (jsonOutput) {
        const payload = {
          ok: result.status === 0,
          exitCode: result.status ?? 1,
          stdout: result.stdout || "",
          stderr: result.stderr || "",
          command: `${execConfig.bin} ${args.join(" ")}`.trim(),
        };
        console.log(JSON.stringify(payload));
        return;
      }
      if (result.error) {
        console.error(result.error.message);
        process.exit(1);
      }
      if (typeof result.status === "number" && result.status !== 0) {
        process.exit(result.status);
      }
      return;
    }
  }

  if (command === "templates") {
    const sub = rest[0];
    if (sub === "render") {
      const type = parseFlagValue(rest, "--type");
      if (!type || !["qa", "fix-bundle", "ralph"].includes(type)) {
        console.error("Usage: cc templates render --type <qa|fix-bundle|ralph> [--feature-id <id>] [--data-json <json>]");
        process.exit(1);
      }
      const owner = parseFlagValue(rest, "--owner");
      const repoName = parseFlagValue(rest, "--repo");
      const featureId = parseFlagValue(rest, "--feature-id");
      const dataJson = parseFlagValue(rest, "--data-json");
      if (testMode) {
        const templateHint = type === "qa"
          ? DEFAULT_TEMPLATES.qaPacketPath
          : type === "fix-bundle"
            ? DEFAULT_TEMPLATES.fixBundlePath
            : DEFAULT_TEMPLATES.ralphReportPath;
        outputDryRun([`read template ${templateHint}`, "render template with provided data"], jsonOutput);
        return;
      }
      let data = {};
      if (dataJson) {
        try {
          const parsed = JSON.parse(dataJson);
          if (parsed && typeof parsed === "object") {
            data = parsed;
          }
        } catch {
          console.error("Invalid --data-json payload.");
          process.exit(1);
        }
      }
      const { config } = loadConfig();
      const baseAgent = resolveAgentHarness(config);
      const resolvedConfig = owner && repoName ? resolveRepoConfig(owner, repoName, config) : config;
      const templates = resolveTemplates(resolvedConfig);
      const commands = resolveRepoCommands(resolvedConfig);
      const agent = owner && repoName ? resolveRepoAgent(owner, repoName, baseAgent) : baseAgent;
      const templatePath = type === "qa"
        ? templates.qaPacketPath
        : type === "fix-bundle"
          ? templates.fixBundlePath
          : templates.ralphReportPath;
      const repoRoot = findRepoRoot();
      const fullPath = path.join(repoRoot, templatePath);
      if (!fs.existsSync(fullPath)) {
        console.error(`Template not found at ${fullPath}`);
        process.exit(1);
      }
      const feature = featureId ? getFeatureById(featureId) : null;
      const maxItems = config.qa?.maxChecklistItems ?? 25;
      const values = buildTemplateValues({ type, data, feature, agent, commands, maxItems });
      const content = renderTemplate(fs.readFileSync(fullPath, "utf8"), values);
      const payload = { type, templatePath, content };
      console.log(jsonOutput ? JSON.stringify(payload) : content);
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
    if (sub === "context") {
      const owner = parseFlagValue(rest, "--owner");
      const repo = parseFlagValue(rest, "--repo");
      const prRaw = parseFlagValue(rest, "--pr");
      if (!owner || !repo || !prRaw) {
        console.error("Usage: cc prs context --owner <org> --repo <name> --pr <number>");
        process.exit(1);
      }
      if (testMode) {
        outputDryRun([
          `github: pulls.get owner=${owner} repo=${repo} pull_number=${prRaw}`,
          `github: pulls.listFiles owner=${owner} repo=${repo} pull_number=${prRaw} per_page=100`,
          "render PR context",
        ], jsonOutput);
        return;
      }
      const prNumber = Number(prRaw);
      if (!prNumber || Number.isNaN(prNumber)) {
        console.error("--pr must be a number.");
        process.exit(1);
      }
      const octokit = getOctokit();
      const prResp = await octokit.pulls.get({ owner, repo, pull_number: prNumber });
      const pr = prResp.data;
      const filesResp = await octokit.pulls.listFiles({ owner, repo, pull_number: prNumber, per_page: 100 });
      const files = filesResp.data || [];
      const fileNames = files.map((file) => file.filename);
      const maxFiles = 12;
      const maxChars = 12000;
      let diffSnippets = files
        .filter((file) => file.patch)
        .slice(0, maxFiles)
        .map((file) => `### ${file.filename}\n\`\`\`diff\n${file.patch}\n\`\`\``)
        .join("\n\n");
      let truncated = files.length > maxFiles;
      if (diffSnippets.length > maxChars) {
        diffSnippets = diffSnippets.slice(0, maxChars) + "\n\n...(truncated)";
        truncated = true;
      }
      const payload = {
        pr: {
          number: pr.number,
          title: pr.title,
          url: pr.html_url,
          base: pr.base?.ref ?? null,
          head: pr.head?.ref ?? null,
        },
        files: fileNames,
        diff_snippets: diffSnippets,
        truncated,
      };
      console.log(jsonOutput ? JSON.stringify(payload) : JSON.stringify(payload, null, 2));
      return;
    }
    if (sub === "track") {
      const owner = parseFlagValue(rest, "--owner");
      const repo = parseFlagValue(rest, "--repo");
      const prRaw = parseFlagValue(rest, "--pr");
      const type = parseFlagValue(rest, "--type");
      const workingPrRaw = parseFlagValue(rest, "--working-pr");
      if (!owner || !repo || !prRaw || !type) {
        console.error("Usage: cc prs track --owner <org> --repo <name> --pr <number> --type <working|final> [--working-pr <number>]");
        process.exit(1);
      }
      if (!["working", "final"].includes(type)) {
        console.error("Type must be working or final.");
        process.exit(1);
      }
      if (testMode) {
        outputDryRun([`github: pulls.get owner=${owner} repo=${repo} pull_number=${prRaw}`, "sqlite: upsert pull_requests"], jsonOutput);
        return;
      }
      const prNumber = Number(prRaw);
      const workingPrNumber = workingPrRaw ? Number(workingPrRaw) : null;
      if (!prNumber || Number.isNaN(prNumber)) {
        console.error("--pr must be a number.");
        process.exit(1);
      }
      if (workingPrRaw && (!workingPrNumber || Number.isNaN(workingPrNumber))) {
        console.error("--working-pr must be a number when provided.");
        process.exit(1);
      }
      const octokit = getOctokit();
      const prResp = await octokit.pulls.get({ owner, repo, pull_number: prNumber });
      const pr = prResp.data;
      const item = upsertTrackedPr({
        owner,
        repo,
        pr_number: pr.number,
        pr_type: type,
        base_branch: pr.base?.ref,
        head_branch: pr.head?.ref,
        title: pr.title,
        url: pr.html_url,
        working_pr_number: type === "final" ? workingPrNumber : null,
      });
      console.log(jsonOutput ? JSON.stringify({ item }) : JSON.stringify({ item }, null, 2));
      return;
    }
    if (sub === "tracked") {
      const owner = parseFlagValue(rest, "--owner");
      const repo = parseFlagValue(rest, "--repo");
      const type = parseFlagValue(rest, "--type");
      if (!owner || !repo) {
        console.error("Usage: cc prs tracked --owner <org> --repo <name> [--type <working|final>]");
        process.exit(1);
      }
      if (type && !["working", "final"].includes(type)) {
        console.error("Type must be working or final.");
        process.exit(1);
      }
      if (testMode) {
        outputDryRun([`sqlite: SELECT * FROM pull_requests WHERE owner=${owner} repo=${repo}${type ? ` type=${type}` : ""}`], jsonOutput);
        return;
      }
      const items = listTrackedPrs(owner, repo, type);
      console.log(jsonOutput ? JSON.stringify({ items }) : JSON.stringify({ items }, null, 2));
      return;
    }
  }

  if (command === "final") {
    const sub = rest[0];
    if (sub === "create") {
      const owner = parseFlagValue(rest, "--owner");
      const repo = parseFlagValue(rest, "--repo");
      const prRaw = parseFlagValue(rest, "--pr");
      const mode = parseFlagValue(rest, "--mode");
      if (!owner || !repo || !prRaw || !mode) {
        console.error("Usage: cc final create --owner <org> --repo <name> --pr <number> --mode <squash|cherry-pick>");
        process.exit(1);
      }
      if (!["squash", "cherry-pick"].includes(mode)) {
        console.error("Mode must be squash or cherry-pick.");
        process.exit(1);
      }
      if (testMode) {
        outputDryRun([
          `github: pulls.get owner=${owner} repo=${repo} pull_number=${prRaw}`,
          "git: ensure clean working tree",
          "git: fetch origin base/head",
          `git: checkout -b final/pr-${prRaw}-<timestamp> origin/<base>`,
          mode === "squash" ? "git: merge --squash origin/<head> && commit" : "git: cherry-pick origin/<base>..origin/<head>",
          "git: push origin final branch",
          "github: pulls.create final PR",
          "github: issues.addLabels ai:final-pr, ai:qa-passed",
          "sqlite: upsert pull_requests (working + final)",
        ], jsonOutput);
        return;
      }
      const prNumber = Number(prRaw);
      if (!prNumber || Number.isNaN(prNumber)) {
        console.error("--pr must be a number.");
        process.exit(1);
      }
      const { config } = loadConfig();
      const resolvedConfig = resolveRepoConfig(owner, repo, config);
      const labelsConfig = resolvedConfig.labels ?? {};
      const branchesConfig = resolvedConfig.branches ?? {};
      const qaPassedLabel = labelsConfig.qaPassed || "ai:qa-passed";
      const ralphFailedLabel = labelsConfig.ralphFailed || "ai:ralph-failed";
      const finalPrLabel = labelsConfig.finalPr || "ai:final-pr";
      const requireRalph = resolvedConfig.qa?.requireRalphGateBeforeFinalPr ?? true;
      const octokit = getOctokit();
      const prResp = await octokit.pulls.get({ owner, repo, pull_number: prNumber });
      const pr = prResp.data;
      const labelNames = (pr.labels || []).map((label) => (typeof label === "string" ? label : label.name)).filter(Boolean);
      if (!labelNames.includes(qaPassedLabel)) {
        console.error(`Cannot create final PR: missing label ${qaPassedLabel}.`);
        process.exit(1);
      }
      if (requireRalph && labelNames.includes(ralphFailedLabel)) {
        console.error(`Cannot create final PR: Ralph gate failed (${ralphFailedLabel}).`);
        process.exit(1);
      }
      const baseRef = pr.base?.ref;
      const headRef = pr.head?.ref;
      if (!baseRef || !headRef) {
        console.error("Unable to resolve base/head branch from PR.");
        process.exit(1);
      }
      const repoRoot = findRepoRoot();
      const currentBranch = getCurrentBranch();
      const finalPrefix = branchesConfig.finalPrefix || "final/";
      const prefixNormalized = finalPrefix.endsWith("/") ? finalPrefix : `${finalPrefix}/`;
      const finalBranch = `${prefixNormalized}pr-${prNumber}-${Date.now()}`;
      try {
        ensureCleanGit();
        runGit(["fetch", "origin", baseRef, headRef], { cwd: repoRoot });
        runGit(["checkout", "-b", finalBranch, `origin/${baseRef}`], { cwd: repoRoot });
        if (mode === "squash") {
          runGit(["merge", "--squash", `origin/${headRef}`], { cwd: repoRoot });
          runGit(["commit", "-m", `[FINAL] ${pr.title}`], { cwd: repoRoot });
        } else {
          const countRaw = runGit(["rev-list", "--count", `origin/${baseRef}..origin/${headRef}`], { cwd: repoRoot });
          const count = Number(countRaw);
          if (!Number.isFinite(count) || count === 0) {
            throw new Error("No commits to cherry-pick.");
          }
          runGit(["cherry-pick", `origin/${baseRef}..origin/${headRef}`], { cwd: repoRoot });
        }
        runGit(["push", "-u", "origin", finalBranch], { cwd: repoRoot });
        const finalPr = await octokit.pulls.create({
          owner,
          repo,
          title: `[FINAL] ${pr.title}`,
          head: finalBranch,
          base: baseRef,
          body: [
            `Supersedes working PR #${prNumber}.`,
            ``,
            `- Working PR: ${pr.html_url}`,
            `- QA: passed (label ${qaPassedLabel})`,
            `- Mode: ${mode}`,
          ].join("\n"),
        });
        await octokit.issues.addLabels({
          owner,
          repo,
          issue_number: finalPr.data.number,
          labels: [finalPrLabel, qaPassedLabel],
        });
        upsertTrackedPr({
          owner,
          repo,
          pr_number: pr.number,
          pr_type: "working",
          base_branch: baseRef,
          head_branch: headRef,
          title: pr.title,
          url: pr.html_url,
        });
        upsertTrackedPr({
          owner,
          repo,
          pr_number: finalPr.data.number,
          pr_type: "final",
          base_branch: baseRef,
          head_branch: finalBranch,
          title: finalPr.data.title,
          url: finalPr.data.html_url,
          working_pr_number: pr.number,
        });
        const payload = { url: finalPr.data.html_url, branch: finalBranch, pr_number: finalPr.data.number };
        console.log(jsonOutput ? JSON.stringify(payload) : JSON.stringify(payload, null, 2));
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(message);
        process.exitCode = 1;
        return;
      } finally {
        try {
          runGit(["cherry-pick", "--abort"], { cwd: repoRoot });
        } catch {
          // ignore
        }
        try {
          runGit(["merge", "--abort"], { cwd: repoRoot });
        } catch {
          // ignore
        }
        try {
          runGit(["checkout", currentBranch], { cwd: repoRoot });
        } catch {
          // Ignore checkout failures to avoid masking prior errors.
        }
      }
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
