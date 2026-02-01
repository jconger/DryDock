import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { getRepoRoot } from "@/lib/config";

const repoRoot = getRepoRoot();
const defaultDataDir = path.join(repoRoot, ".data");
const legacyDataDir = path.join(process.cwd(), ".data");
const legacyDbPath = path.join(legacyDataDir, "command-center.sqlite");
const dataDir = fs.existsSync(legacyDbPath) ? legacyDataDir : defaultDataDir;
const dbPath = path.join(dataDir, "command-center.sqlite");

let db: Database.Database | null = null;

export function getDb() {
  if (db) return db;
  fs.mkdirSync(dataDir, { recursive: true });
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  migrate(db);
  return db;
}

function migrate(d: Database.Database) {
  d.exec(`
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
  `);
}

export function savePrTarget(owner: string, repo: string, pr_number: number) {
  const d = getDb();
  const stmt = d.prepare(
    "INSERT INTO pr_targets(owner, repo, pr_number, created_at) VALUES (?, ?, ?, ?)"
  );
  stmt.run(owner, repo, pr_number, new Date().toISOString());
}

export function listRecentTargets(limit = 10): Array<{owner: string; repo: string; pr_number: number; created_at: string;}> {
  const d = getDb();
  const stmt = d.prepare(
    "SELECT owner, repo, pr_number, created_at FROM pr_targets ORDER BY id DESC LIMIT ?"
  );
  return stmt.all(limit);
}
