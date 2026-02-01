import { getDb } from "@/lib/db";
import type { QaChecklistItem, QaPacketRecord, QaStatus } from "@/lib/qa-types";

function nowIso() {
  return new Date().toISOString();
}

function normalizeChecklist(items: QaChecklistItem[]): QaChecklistItem[] {
  return items.map((item) => ({
    id: item.id,
    text: item.text.trim(),
    status: item.status,
    notes: item.notes ?? "",
    evidence: item.evidence ?? "",
  }));
}

export function listQaPackets(featureId?: string): QaPacketRecord[] {
  const d = getDb();
  if (featureId) {
    const stmt = d.prepare(
      "SELECT * FROM qa_packets WHERE feature_id = ? ORDER BY id DESC"
    );
    return stmt.all(featureId) as QaPacketRecord[];
  }
  const stmt = d.prepare("SELECT * FROM qa_packets ORDER BY id DESC");
  return stmt.all() as QaPacketRecord[];
}

export function getLatestQaPacket(featureId: string): QaPacketRecord | null {
  const d = getDb();
  const stmt = d.prepare(
    "SELECT * FROM qa_packets WHERE feature_id = ? ORDER BY id DESC LIMIT 1"
  );
  return (stmt.get(featureId) as QaPacketRecord) ?? null;
}

export function createQaPacket(featureId: string, checklist: QaChecklistItem[], status: QaStatus = "testing") {
  const d = getDb();
  const now = nowIso();
  const record = {
    feature_id: featureId,
    status,
    checklist_json: JSON.stringify(normalizeChecklist(checklist)),
    created_at: now,
    updated_at: now,
  };
  const stmt = d.prepare(
    "INSERT INTO qa_packets(feature_id, status, checklist_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  );
  const info = stmt.run(record.feature_id, record.status, record.checklist_json, record.created_at, record.updated_at);
  return { id: Number(info.lastInsertRowid), ...record } as QaPacketRecord;
}

export function updateQaPacket(id: number, updates: { status?: QaStatus; checklist?: QaChecklistItem[] }) {
  const d = getDb();
  const existing = d.prepare("SELECT * FROM qa_packets WHERE id = ?").get(id) as QaPacketRecord | undefined;
  if (!existing) return null;

  const status = updates.status ?? existing.status;
  const checklist_json = updates.checklist
    ? JSON.stringify(normalizeChecklist(updates.checklist))
    : existing.checklist_json;
  const updated_at = nowIso();

  d.prepare(
    "UPDATE qa_packets SET status = ?, checklist_json = ?, updated_at = ? WHERE id = ?"
  ).run(status, checklist_json, updated_at, id);

  return { ...existing, status, checklist_json, updated_at } as QaPacketRecord;
}
