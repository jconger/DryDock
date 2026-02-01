import { getDb } from "@/lib/db";
import type { FeatureRecord, FeatureStatus } from "@/lib/feature-types";

export type CreateFeatureInput = {
  title: string;
  description_md?: string;
  status?: FeatureStatus;
  priority?: string;
  impact?: string;
  effort?: string;
  confidence?: string;
  tags?: string[];
};

function nowIso() {
  return new Date().toISOString();
}

function newFeatureId() {
  const iso = new Date().toISOString().slice(0, 10);
  const rand = Math.random().toString(36).slice(2, 6);
  return `feat_${iso}_${rand}`;
}

export function listFeatures(limit = 50): FeatureRecord[] {
  const d = getDb();
  const stmt = d.prepare(
    "SELECT * FROM features ORDER BY created_at DESC LIMIT ?"
  );
  return stmt.all(limit) as FeatureRecord[];
}

export function createFeature(input: CreateFeatureInput): FeatureRecord {
  const d = getDb();
  const createdAt = nowIso();
  const id = newFeatureId();
  const record: FeatureRecord = {
    id,
    repo_id: null,
    title: input.title,
    description_md: input.description_md ?? "",
    source_type: "manual",
    source_refs_json: "[]",
    status: input.status ?? "PROPOSED",
    priority: input.priority ?? "med",
    impact: input.impact ?? "med",
    effort: input.effort ?? "med",
    confidence: input.confidence ?? "med",
    tags_json: JSON.stringify(input.tags ?? []),
    created_at: createdAt,
    updated_at: createdAt,
  };

  const stmt = d.prepare(
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

export function updateFeatureStatus(id: string, status: FeatureStatus) {
  const d = getDb();
  const stmt = d.prepare(
    "UPDATE features SET status = ?, updated_at = ? WHERE id = ?"
  );
  stmt.run(status, nowIso(), id);
}
