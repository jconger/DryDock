import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(appDir, "..", "..");
const cliPath = path.join(appDir, "scripts", "cc.js");
const configPath = path.join(repoRoot, ".command-center.jsonc");

let configBackup = null;

function runCli(args, options = {}) {
  const result = spawnSync("node", [cliPath, ...args], {
    cwd: appDir,
    encoding: "utf8",
    input: options.stdin ?? "",
  });
  if (result.error) throw result.error;
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status ?? 0,
  };
}

function parseJsonOutput(stdout) {
  const trimmed = stdout.trim();
  assert.ok(trimmed.length > 0, "expected JSON output");
  return JSON.parse(trimmed);
}

function assertDryRun(args, includes = []) {
  const { stdout, stderr, status } = runCli([...args, "--test", "--json"]);
  assert.equal(status, 0, stderr || "expected exit code 0");
  const payload = parseJsonOutput(stdout);
  assert.equal(payload.dryRun, true);
  assert.ok(Array.isArray(payload.commands), "expected commands array");
  for (const fragment of includes) {
    assert.ok(
      payload.commands.some((cmd) => cmd.includes(fragment)),
      `expected dry run command to include "${fragment}"`
    );
  }
}

test.before(() => {
  if (fs.existsSync(configPath)) {
    configBackup = fs.readFileSync(configPath, "utf8");
  }
  fs.writeFileSync(configPath, "{}\n", "utf8");
});

test.after(() => {
  if (configBackup === null) {
    fs.rmSync(configPath, { force: true });
    return;
  }
  fs.writeFileSync(configPath, configBackup, "utf8");
});

test("cc shows usage without args", () => {
  const { stdout, status } = runCli([]);
  assert.equal(status, 0);
  assert.match(stdout, /DryDock CLI/);
  assert.match(stdout, /Usage:/);
});

test("cc interactive --test", () => {
  assertDryRun(["interactive"], ["prompt for interactive selections"]);
});

test("cc init --test", () => {
  assertDryRun(
    ["init", "--provider", "codex", "--owner", "acme", "--repo", "ship", "--token", "ghp_test"],
    ["ensure config exists", "set agent harness provider"]
  );
});

test("cc config show --test", () => {
  assertDryRun(["config", "show"], ["print resolved config"]);
});

test("cc config set-provider --test", () => {
  assertDryRun(["config", "set-provider", "codex"], ["agentHarness.provider=codex"]);
});

test("cc config set-prefix --test", () => {
  assertDryRun(["config", "set-prefix", "/assistant"], ["agentHarness.commandPrefix=/assistant"]);
});

test("cc config set-command --test", () => {
  assertDryRun(["config", "set-command", "proposePlans", "test command"], ["agentHarness.commands.proposePlans"]);
});

test("cc config set-comment --test", () => {
  assertDryRun(["config", "set-comment", "qaFail", "/cc qa fail:"], ["commentProtocol.commands.qaFail"]);
});

test("cc commands --test", () => {
  assertDryRun(["commands"], ["print command list"]);
});

test("cc commands --test with repo override", () => {
  assertDryRun(["commands", "--owner", "acme", "--repo", "ship"], ["print command list for acme/ship"]);
});

test("cc commands --test include agent", () => {
  assertDryRun(["commands", "--include-agent"], ["including agent commands"]);
});

test("cc features list --test", () => {
  assertDryRun(["features", "list"], ["SELECT * FROM features"]);
});

test("cc features create --test", () => {
  assertDryRun(["features", "create", "--title", "Feature A"], ["INSERT feature"]);
});

test("cc features status --test", () => {
  assertDryRun(["features", "status", "--id", "feat_123", "--status", "QA_PASSED"], ["UPDATE features SET status"]);
});

test("cc repos list --test", () => {
  assertDryRun(["repos", "list"], ["SELECT * FROM repos"]);
});

test("cc repos add --test", () => {
  assertDryRun(["repos", "add", "--owner", "acme", "--name", "ship"], ["INSERT repo acme/ship"]);
});

test("cc repos set-agent --test", () => {
  assertDryRun(
    [
      "repos",
      "set-agent",
      "--owner",
      "acme",
      "--name",
      "ship",
      "--provider",
      "codex",
      "--prefix",
      "/codex",
      "--command-propose",
      "propose 2 plans",
    ],
    ["UPDATE repo acme/ship agent settings"]
  );
});

test("cc templates render qa --test", () => {
  assertDryRun(["templates", "render", "--type", "qa"], ["read template"]);
});

test("cc templates render fix-bundle --test", () => {
  assertDryRun(["templates", "render", "--type", "fix-bundle"], ["read template"]);
});

test("cc templates render ralph --test", () => {
  assertDryRun(["templates", "render", "--type", "ralph"], ["read template"]);
});

test("cc agent run --test", () => {
  assertDryRun(["agent", "run", "--mode", "propose"], ["exec:"]);
});

test("cc qa get --test", () => {
  assertDryRun(["qa", "get", "--feature-id", "feat_123"], ["SELECT * FROM qa_packets"]);
});

test("cc qa create --test", () => {
  assertDryRun(["qa", "create", "--feature-id", "feat_123", "--items", "One|Two"], ["INSERT qa_packet"]);
});

test("cc qa update --test", () => {
  assertDryRun(["qa", "update", "--id", "12", "--status", "failed"], ["UPDATE qa_packets"]);
});

test("cc prs list --test", () => {
  assertDryRun(["prs", "list", "--owner", "acme", "--repo", "ship"], ["pulls.list"]);
});

test("cc prs context --test", () => {
  assertDryRun(["prs", "context", "--owner", "acme", "--repo", "ship", "--pr", "7"], ["pulls.get", "pulls.listFiles"]);
});

test("cc prs track --test", () => {
  assertDryRun(
    ["prs", "track", "--owner", "acme", "--repo", "ship", "--pr", "7", "--type", "working"],
    ["pulls.get", "upsert pull_requests"]
  );
});

test("cc prs tracked --test", () => {
  assertDryRun(["prs", "tracked", "--owner", "acme", "--repo", "ship", "--type", "working"], ["pull_requests"]);
});

test("cc final create --test", () => {
  assertDryRun(
    ["final", "create", "--owner", "acme", "--repo", "ship", "--pr", "9", "--mode", "squash"],
    ["pulls.get", "ensure clean working tree"]
  );
});

test("cc pr-comment post --test", () => {
  assertDryRun(
    ["pr-comment", "post", "--owner", "acme", "--repo", "ship", "--pr", "3", "--body", "hello"],
    ["issues.createComment", "INSERT pr_targets"]
  );
});

test("cc recent list --test", () => {
  assertDryRun(["recent", "list"], ["SELECT owner, repo, pr_number"]);
});
