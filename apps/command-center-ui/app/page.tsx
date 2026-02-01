"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  AGENT_HARNESS_PRESETS,
  DEFAULT_AGENT_COMMANDS,
  DEFAULT_COMMENT_PROTOCOL,
  type AgentHarnessConfig,
  type CommentProtocol,
} from "@/lib/constants";
import { buildCommandEntries, type CommandEntry } from "@/lib/command-helpers";
import { FEATURE_STATUSES, type FeatureRecord, type FeatureStatus } from "@/lib/feature-types";

type RecentTarget = { owner: string; repo: string; pr_number: number; created_at: string; };
type GithubPr = { number: number; title: string; html_url: string; draft: boolean; state: string; };
type ConfigResponse = {
  configPath: string | null;
  agentHarness?: { provider?: string; commandPrefix?: string; label?: string };
  commentProtocol?: { prefix?: string };
};
type RepoRecord = {
  id: number;
  owner: string;
  name: string;
  default_branch: string | null;
  github_repo_id: number | null;
  settings_json: string;
  created_at: string;
  updated_at: string;
};
type QaChecklistStatus = "pending" | "pass" | "fail";
type QaChecklistItem = {
  id: string;
  text: string;
  status: QaChecklistStatus;
  notes: string;
  evidence: string;
};
type QaPacket = {
  id: number;
  feature_id: string;
  status: "proposed" | "testing" | "failed" | "passed";
  checklist: QaChecklistItem[];
  created_at: string;
  updated_at: string;
};

type SectionId = "brief" | "proposals" | "implementation" | "qa" | "repo-health" | "settings";

const SECTIONS: Array<{ id: SectionId; label: string; helper?: string }> = [
  { id: "brief", label: "Morning Brief", helper: "Today's pipeline snapshot" },
  { id: "proposals", label: "Proposals", helper: "Feature intake + approvals" },
  { id: "implementation", label: "Implementation", helper: "Working PR orchestration" },
  { id: "qa", label: "QA Gate", helper: "Checklists + fix loops" },
  { id: "repo-health", label: "Repo Health", helper: "Signals and scans" },
  { id: "settings", label: "Settings", helper: "Repo + harness config" },
];

const STATUS_LABELS: Record<FeatureStatus, string> = {
  PROPOSED: "Proposed",
  APPROVED: "Approved",
  SPEC_CHOOSING: "Spec choosing",
  SPEC_SELECTED: "Spec selected",
  IMPLEMENTING: "Implementing",
  READY_FOR_QA: "Ready for QA",
  QA_IN_PROGRESS: "QA in progress",
  QA_FAILED: "QA failed",
  QA_PASSED: "QA passed",
  FINAL_PR_CREATED: "Final PR created",
  DONE: "Done",
  DEFERRED: "Deferred",
  REJECTED: "Rejected",
};

const DEFAULT_AGENT: AgentHarnessConfig = {
  provider: "opencode",
  label: AGENT_HARNESS_PRESETS.opencode.label,
  commandPrefix: AGENT_HARNESS_PRESETS.opencode.commandPrefix,
  commands: DEFAULT_AGENT_COMMANDS,
};
const DEFAULT_PROTOCOL: CommentProtocol = DEFAULT_COMMENT_PROTOCOL;
const DEFAULT_ENTRIES = buildCommandEntries(DEFAULT_AGENT, DEFAULT_PROTOCOL);

export default function HomePage() {
  const [section, setSection] = useState<SectionId>("brief");
  const [features, setFeatures] = useState<FeatureRecord[]>([]);
  const [loadingFeatures, setLoadingFeatures] = useState(false);
  const [featureError, setFeatureError] = useState("");
  const [isCompact, setIsCompact] = useState(false);

  async function loadFeatures() {
    setLoadingFeatures(true);
    setFeatureError("");
    try {
      const r = await fetch("/api/features");
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed to load features");
      setFeatures(j.items || []);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to load features";
      setFeatureError(message);
    } finally {
      setLoadingFeatures(false);
    }
  }

  useEffect(() => {
    loadFeatures();
  }, []);

  useEffect(() => {
    function handleResize() {
      setIsCompact(window.innerWidth < 960);
    }
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const counts = useMemo(() => {
    const base: Record<FeatureStatus, number> = FEATURE_STATUSES.reduce((acc, status) => {
      acc[status] = 0;
      return acc;
    }, {} as Record<FeatureStatus, number>);
    for (const feature of features) {
      base[feature.status] = (base[feature.status] ?? 0) + 1;
    }
    return base;
  }, [features]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: isCompact ? "1fr" : "220px 1fr", gap: 20 }}>
      <nav style={{ display: "grid", gap: 8, alignContent: "start" }}>
        <div style={{ fontSize: 12, color: "#666", textTransform: "uppercase" }}>Sections</div>
        <div style={{ display: isCompact ? "flex" : "grid", gap: 8, flexWrap: "wrap" }}>
          {SECTIONS.map((item) => {
            const active = item.id === section;
            return (
              <button
                key={item.id}
                onClick={() => setSection(item.id)}
                style={{
                  textAlign: "left",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: active ? "1px solid #111" : "1px solid #ddd",
                  background: active ? "#111" : "#fff",
                  color: active ? "#fff" : "#111",
                  cursor: "pointer",
                  minWidth: isCompact ? 160 : undefined,
                  flex: isCompact ? "0 0 auto" : undefined,
                }}
              >
                <div style={{ fontWeight: 600 }}>{item.label}</div>
                {item.helper && (
                  <div style={{ fontSize: 12, color: active ? "#ddd" : "#666" }}>{item.helper}</div>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      <main style={{ display: "grid", gap: 16 }}>
        {section === "brief" && (
          <MorningBriefSection
            counts={counts}
            total={features.length}
            loading={loadingFeatures}
            error={featureError}
            onRefresh={loadFeatures}
          />
        )}
        {section === "proposals" && (
          <ProposalsSection
            features={features}
            loading={loadingFeatures}
            error={featureError}
            onRefresh={loadFeatures}
          />
        )}
        {section === "implementation" && (
          <ImplementationSection
            features={features}
            onRefresh={loadFeatures}
          />
        )}
        {section === "qa" && (
          <QAGateSection
            features={features}
            onRefresh={loadFeatures}
          />
        )}
        {section === "repo-health" && <RepoHealthSection />}
        {section === "settings" && <SettingsSection />}
      </main>
    </div>
  );
}

function MorningBriefSection({
  counts,
  total,
  loading,
  error,
  onRefresh,
}: {
  counts: Record<FeatureStatus, number>;
  total: number;
  loading: boolean;
  error: string;
  onRefresh: () => void;
}) {
  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div>
        <h2 style={{ margin: 0 }}>Morning Brief</h2>
        <p style={{ color: "#555", marginTop: 6 }}>
          A focused snapshot of what needs attention today.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        <BriefCard title="Total features" value={String(total)} />
        <BriefCard title="Proposed" value={String(counts.PROPOSED)} />
        <BriefCard title="Ready for QA" value={String(counts.READY_FOR_QA)} />
        <BriefCard title="QA failed" value={String(counts.QA_FAILED)} />
        <BriefCard title="QA passed" value={String(counts.QA_PASSED)} />
        <BriefCard title="Final PRs" value={String(counts.FINAL_PR_CREATED)} />
      </div>

      {error && (
        <div style={{ padding: 12, border: "1px solid #f2c4c4", background: "#fff4f4", borderRadius: 8 }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 12 }}>
        <button onClick={onRefresh} disabled={loading} style={{ padding: "8px 12px", cursor: "pointer" }}>
          {loading ? "Refreshing..." : "Refresh snapshot"}
        </button>
        <span style={{ color: "#777", fontSize: 13 }}>
          Proposal generation and repo scans will surface here once wired.
        </span>
      </div>
    </section>
  );
}

function BriefCard({ title, value }: { title: string; value: string }) {
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 14, background: "#fff" }}>
      <div style={{ fontSize: 12, color: "#666", textTransform: "uppercase" }}>{title}</div>
      <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function ProposalsSection({
  features,
  loading,
  error,
  onRefresh,
}: {
  features: FeatureRecord[];
  loading: boolean;
  error: string;
  onRefresh: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("med");
  const [impact, setImpact] = useState("med");
  const [effort, setEffort] = useState("med");
  const [confidence, setConfidence] = useState("med");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");

  const proposed = features.filter((feature) => feature.status === "PROPOSED");

  async function create() {
    setBusy(true);
    setResult("");
    try {
      const payload = {
        title,
        description_md: description,
        priority,
        impact,
        effort,
        confidence,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      };
      const r = await fetch("/api/features", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed to create feature");
      setTitle("");
      setDescription("");
      setTags("");
      await onRefresh();
      setResult("OK: Feature created.");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed";
      setResult(`Error: ${message}`);
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(id: string, status: FeatureStatus) {
    await fetch("/api/features", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    await onRefresh();
  }

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <div>
        <h2 style={{ margin: 0 }}>Proposals</h2>
        <p style={{ color: "#555", marginTop: 6 }}>
          Capture and triage new features. Approve, defer, or reject quickly.
        </p>
      </div>

      <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 16, background: "#fff" }}>
        <h3 style={{ marginTop: 0 }}>Create manual feature</h3>
        <div style={{ display: "grid", gap: 10 }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Feature title"
            style={{ padding: 10 }}
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short description"
            style={{ padding: 10, minHeight: 80 }}
          />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
            <SelectField label="Priority" value={priority} onChange={setPriority} />
            <SelectField label="Impact" value={impact} onChange={setImpact} />
            <SelectField label="Effort" value={effort} onChange={setEffort} />
            <SelectField label="Confidence" value={confidence} onChange={setConfidence} />
          </div>
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="Tags (comma separated)"
            style={{ padding: 10 }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={create} disabled={busy || !title} style={{ padding: "8px 12px", cursor: "pointer" }}>
              {busy ? "Creating..." : "Create feature"}
            </button>
            {result && <span style={{ color: "#555" }}>{result}</span>}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h3 style={{ margin: 0 }}>Proposed features</h3>
          <span style={{ color: "#777" }}>({proposed.length})</span>
          <button onClick={onRefresh} disabled={loading} style={{ marginLeft: "auto", padding: "6px 10px" }}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
        {error && (
          <div style={{ padding: 12, border: "1px solid #f2c4c4", background: "#fff4f4", borderRadius: 8 }}>
            {error}
          </div>
        )}
        {proposed.length === 0 ? (
          <div style={{ color: "#666" }}>No proposed features yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {proposed.map((feature) => (
              <div key={feature.id} style={{ border: "1px solid #eee", borderRadius: 8, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{feature.title}</div>
                    {feature.description_md && (
                      <div style={{ color: "#666", marginTop: 4 }}>{feature.description_md}</div>
                    )}
                    <div style={{ fontSize: 12, color: "#888", marginTop: 6 }}>
                      {feature.id} - {STATUS_LABELS[feature.status]}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button onClick={() => setStatus(feature.id, "APPROVED")} style={{ padding: "6px 10px" }}>
                      Approve
                    </button>
                    <button onClick={() => setStatus(feature.id, "DEFERRED")} style={{ padding: "6px 10px" }}>
                      Defer
                    </button>
                    <button onClick={() => setStatus(feature.id, "REJECTED")} style={{ padding: "6px 10px" }}>
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function SelectField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label style={{ display: "grid", gap: 4, fontSize: 12, color: "#666" }}>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ padding: 8 }}>
        <option value="low">Low</option>
        <option value="med">Med</option>
        <option value="high">High</option>
      </select>
    </label>
  );
}

function ImplementationSection({ features, onRefresh }: { features: FeatureRecord[]; onRefresh: () => void }) {
  const implementing = features.filter((feature) => feature.status === "IMPLEMENTING");
  return (
    <section style={{ display: "grid", gap: 16 }}>
      <div>
        <h2 style={{ margin: 0 }}>Implementation</h2>
        <p style={{ color: "#555", marginTop: 6 }}>
          Trigger working PR runs and track active implementation work.
        </p>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        <h3 style={{ margin: 0 }}>Active implementations</h3>
        {implementing.length === 0 ? (
          <div style={{ color: "#666" }}>No features are marked as implementing yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {implementing.map((feature) => (
              <div key={feature.id} style={{ border: "1px solid #eee", borderRadius: 8, padding: 10 }}>
                <div style={{ fontWeight: 600 }}>{feature.title}</div>
                <div style={{ fontSize: 12, color: "#777" }}>{feature.id}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <PRCommentPanel onAfterPost={onRefresh} />
    </section>
  );
}

function QAGateSection({ features, onRefresh }: { features: FeatureRecord[]; onRefresh: () => void }) {
  const ready = features.filter((feature) => feature.status === "READY_FOR_QA");
  const inQa = features.filter((feature) => feature.status === "QA_IN_PROGRESS");
  const failed = features.filter((feature) => feature.status === "QA_FAILED");
  const passed = features.filter((feature) => feature.status === "QA_PASSED");
  const [selectedFeatureId, setSelectedFeatureId] = useState("");

  useEffect(() => {
    if (!selectedFeatureId && features.length > 0) {
      setSelectedFeatureId(features[0].id);
    }
  }, [features, selectedFeatureId]);

  const selectedFeature = features.find((feature) => feature.id === selectedFeatureId) ?? null;

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <div>
        <h2 style={{ margin: 0 }}>QA Gate</h2>
        <p style={{ color: "#555", marginTop: 6 }}>
          Track QA progress and trigger fix bundles once wired.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
        <QAColumn title="Ready for QA" items={ready} />
        <QAColumn title="In QA" items={inQa} />
        <QAColumn title="Failed" items={failed} />
        <QAColumn title="Passed" items={passed} />
      </div>

      <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 16, background: "#fff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div>
            <h3 style={{ margin: 0 }}>QA Runner</h3>
            <p style={{ color: "#666", marginTop: 6 }}>Run checklist pass/fail and capture evidence.</p>
          </div>
          <button onClick={onRefresh} style={{ padding: "8px 12px" }}>
            Refresh QA snapshot
          </button>
        </div>

        <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
          <label style={{ fontSize: 12, color: "#666" }}>Feature</label>
          <select
            value={selectedFeatureId}
            onChange={(e) => setSelectedFeatureId(e.target.value)}
            style={{ padding: 8 }}
          >
            {features.length === 0 && <option value="">No features yet</option>}
            {features.map((feature) => (
              <option key={feature.id} value={feature.id}>
                {feature.title} ({STATUS_LABELS[feature.status]})
              </option>
            ))}
          </select>
        </div>

        {selectedFeature ? (
          <QaRunner feature={selectedFeature} onRefresh={onRefresh} />
        ) : (
          <div style={{ color: "#666", marginTop: 12 }}>Select a feature to run QA.</div>
        )}
      </div>
    </section>
  );
}

function QAColumn({ title, items }: { title: string; items: FeatureRecord[] }) {
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 12 }}>
      <div style={{ fontWeight: 600 }}>{title}</div>
      {items.length === 0 ? (
        <div style={{ color: "#666", marginTop: 8 }}>None</div>
      ) : (
        <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
          {items.map((feature) => (
            <li key={feature.id}>{feature.title}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function QaRunner({ feature, onRefresh }: { feature: FeatureRecord; onRefresh: () => void }) {
  const [packet, setPacket] = useState<QaPacket | null>(null);
  const [checklist, setChecklist] = useState<QaChecklistItem[]>([]);
  const [draftChecklist, setDraftChecklist] = useState("");
  const [newItemText, setNewItemText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");

  async function loadPacket() {
    setLoading(true);
    setError("");
    setResult("");
    try {
      const r = await fetch(`/api/qa?feature_id=${encodeURIComponent(feature.id)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed to load QA packet");
      if (!j.item) {
        setPacket(null);
        setChecklist([]);
        return;
      }
      const item = j.item as QaPacket;
      setPacket(item);
      setChecklist(item.checklist || []);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to load QA packet";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPacket();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feature.id]);

  function updateItem(index: number, patch: Partial<QaChecklistItem>) {
    setChecklist((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }

  async function createPacket() {
    const items = draftChecklist
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (items.length === 0) {
      setError("Add at least one checklist item.");
      return;
    }
    setLoading(true);
    setError("");
    setResult("");
    try {
      const r = await fetch("/api/qa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feature_id: feature.id, checklist: items }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed to create QA packet");
      setPacket(j.item as QaPacket);
      setChecklist((j.item?.checklist as QaChecklistItem[]) ?? []);
      setDraftChecklist("");
      setResult("OK: QA packet created.");
      onRefresh();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to create QA packet";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function savePacket(status?: QaPacket["status"]) {
    if (!packet) return;
    setLoading(true);
    setError("");
    setResult("");
    try {
      const r = await fetch("/api/qa", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: packet.id, status, checklist }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed to save QA packet");
      setPacket(j.item as QaPacket);
      setResult("OK: QA packet saved.");
      onRefresh();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to save QA packet";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  function addItem() {
    const text = newItemText.trim();
    if (!text) return;
    setChecklist((prev) => [
      ...prev,
      { id: `item_${Date.now()}`, text, status: "pending", notes: "", evidence: "" },
    ]);
    setNewItemText("");
  }

  async function markFailed() {
    const failedItems = checklist.filter((item) => item.status === "fail");
    if (failedItems.length === 0) {
      setError("Mark at least one checklist item as fail.");
      return;
    }
    if (failedItems.some((item) => !item.notes.trim())) {
      setError("Add notes for each failed item before marking QA failed.");
      return;
    }
    await savePacket("failed");
  }

  async function markPassed() {
    if (checklist.length === 0) {
      setError("Add at least one checklist item before passing QA.");
      return;
    }
    if (checklist.some((item) => item.status !== "pass")) {
      setError("All checklist items must be marked pass before QA can pass.");
      return;
    }
    await savePacket("passed");
  }

  if (loading && !packet) {
    return <div style={{ color: "#666", marginTop: 12 }}>Loading QA packet...</div>;
  }

  return (
    <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
      {error && (
        <div style={{ padding: 10, border: "1px solid #f2c4c4", background: "#fff4f4", borderRadius: 8 }}>
          {error}
        </div>
      )}
      {result && (
        <div style={{ padding: 10, border: "1px solid #d7ebd7", background: "#f4fbf4", borderRadius: 8 }}>
          {result}
        </div>
      )}

      {!packet ? (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ fontWeight: 600 }}>Create QA packet</div>
          <textarea
            value={draftChecklist}
            onChange={(e) => setDraftChecklist(e.target.value)}
            placeholder={"One checklist item per line"}
            style={{ minHeight: 120, padding: 10 }}
          />
          <button onClick={createPacket} disabled={loading} style={{ padding: "8px 12px", width: "fit-content" }}>
            {loading ? "Creating..." : "Create QA Packet"}
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ fontSize: 12, color: "#666" }}>
            Packet status: <strong>{packet.status}</strong> - {packet.updated_at}
          </div>
          {checklist.length === 0 ? (
            <div style={{ color: "#666" }}>No checklist items yet.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {checklist.map((item, index) => (
                <div key={item.id} style={{ border: "1px solid #eee", borderRadius: 8, padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <input
                      value={item.text}
                      onChange={(e) => updateItem(index, { text: e.target.value })}
                      style={{ flex: 1, padding: 8 }}
                    />
                    <select
                      value={item.status}
                      onChange={(e) => updateItem(index, { status: e.target.value as QaChecklistStatus })}
                      style={{ padding: 8 }}
                    >
                      <option value="pending">Pending</option>
                      <option value="pass">Pass</option>
                      <option value="fail">Fail</option>
                    </select>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                    <textarea
                      value={item.notes}
                      onChange={(e) => updateItem(index, { notes: e.target.value })}
                      placeholder="Notes"
                      style={{ padding: 8, minHeight: 60 }}
                    />
                    <textarea
                      value={item.evidence}
                      onChange={(e) => updateItem(index, { evidence: e.target.value })}
                      placeholder="Evidence / logs"
                      style={{ padding: 8, minHeight: 60 }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={newItemText}
              onChange={(e) => setNewItemText(e.target.value)}
              placeholder="Add checklist item"
              style={{ padding: 8, flex: 1, minWidth: 220 }}
            />
            <button onClick={addItem} style={{ padding: "8px 12px" }}>Add item</button>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => savePacket("testing")} disabled={loading} style={{ padding: "8px 12px" }}>
              Save progress
            </button>
            <button onClick={markFailed} disabled={loading} style={{ padding: "8px 12px" }}>
              Mark feature failed
            </button>
            <button onClick={markPassed} disabled={loading} style={{ padding: "8px 12px" }}>
              Mark feature passed
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function RepoHealthSection() {
  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div>
        <h2 style={{ margin: 0 }}>Repo Health</h2>
        <p style={{ color: "#555", marginTop: 6 }}>
          Nightly scan output will surface here. The workflow currently posts a placeholder issue.
        </p>
      </div>
      <div style={{ border: "1px dashed #ccc", borderRadius: 10, padding: 16, color: "#666" }}>
        Repo health ingestion is planned. Next step: wire repo-scan output into the local database.
      </div>
    </section>
  );
}

function SettingsSection() {
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [repos, setRepos] = useState<RepoRecord[]>([]);
  const [repoOwner, setRepoOwner] = useState("");
  const [repoName, setRepoName] = useState("");
  const [repoBranch, setRepoBranch] = useState("");
  const [repoProvider, setRepoProvider] = useState("opencode");
  const [repoPrefix, setRepoPrefix] = useState("/opencode");
  const [repoCommandPropose, setRepoCommandPropose] = useState("");
  const [repoCommandImplement, setRepoCommandImplement] = useState("");
  const [repoCommandFix, setRepoCommandFix] = useState("");
  const [repoResult, setRepoResult] = useState("");

  useEffect(() => {
    async function load() {
      const r = await fetch("/api/config");
      const j = await r.json();
      setConfig(j as ConfigResponse);
    }
    load();
  }, []);

  async function loadRepos() {
    const r = await fetch("/api/repos");
    const j = await r.json();
    setRepos(j.items || []);
  }

  useEffect(() => {
    loadRepos();
  }, []);

  async function addRepo() {
    setRepoResult("");
    const r = await fetch("/api/repos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        owner: repoOwner,
        name: repoName,
        default_branch: repoBranch || null,
      }),
    });
    const j = await r.json();
    if (!r.ok) {
      setRepoResult(`Error: ${j.error || "Failed to add repo"}`);
      return;
    }
    setRepoOwner("");
    setRepoName("");
    setRepoBranch("");
    setRepoResult("OK: Repo saved.");
    await loadRepos();
  }

  async function setRepoAgent(owner: string, name: string) {
    setRepoResult("");
    const r = await fetch("/api/repos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        owner,
        name,
        provider: repoProvider,
        prefix: repoPrefix,
        command_propose: repoCommandPropose || null,
        command_implement: repoCommandImplement || null,
        command_fix: repoCommandFix || null,
      }),
    });
    const j = await r.json();
    if (!r.ok) {
      setRepoResult(`Error: ${j.error || "Failed to update repo agent"}`);
      return;
    }
    setRepoResult("OK: Repo agent updated.");
    setRepoCommandPropose("");
    setRepoCommandImplement("");
    setRepoCommandFix("");
    await loadRepos();
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div>
        <h2 style={{ margin: 0 }}>Settings</h2>
        <p style={{ color: "#555", marginTop: 6 }}>
          Repo setup checklist and active harness configuration.
        </p>
      </div>

      <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>Repo setup checklist</h3>
        <ol style={{ margin: 0, paddingLeft: 18, color: "#444" }}>
          <li>Install agent harness integration (OpenCode or equivalent).</li>
          <li>Ensure harness config exists (e.g. opencode.jsonc).</li>
          <li>Add `command-center.yml` workflow to the repo.</li>
          <li>Create required labels (ai:approved, ai:ready-for-qa, etc.).</li>
          <li>Verify `.command-center.jsonc` has repo commands + paths.</li>
        </ol>
      </div>

      <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>Active harness</h3>
        {config ? (
          <div style={{ display: "grid", gap: 6, color: "#444" }}>
            <div>Config path: <code>{config.configPath || "(not found)"}</code></div>
            <div>Provider: <strong>{config.agentHarness?.provider}</strong></div>
            <div>Command prefix: <code>{config.agentHarness?.commandPrefix}</code></div>
          </div>
        ) : (
          <div style={{ color: "#666" }}>Loading config...</div>
        )}
      </div>

      <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 16, display: "grid", gap: 12 }}>
        <h3 style={{ marginTop: 0 }}>Repos</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <input value={repoOwner} onChange={(e) => setRepoOwner(e.target.value)} placeholder="Owner" style={{ padding: 8 }} />
          <input value={repoName} onChange={(e) => setRepoName(e.target.value)} placeholder="Repo" style={{ padding: 8 }} />
          <input value={repoBranch} onChange={(e) => setRepoBranch(e.target.value)} placeholder="Default branch" style={{ padding: 8 }} />
        </div>
        <button onClick={addRepo} style={{ padding: "8px 12px", width: "fit-content" }}>
          Add repo
        </button>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <select value={repoProvider} onChange={(e) => setRepoProvider(e.target.value)} style={{ padding: 8 }}>
            <option value="opencode">opencode</option>
            <option value="codex">codex</option>
            <option value="claude-code">claude-code</option>
          </select>
          <select value={repoPrefix} onChange={(e) => setRepoPrefix(e.target.value)} style={{ padding: 8 }}>
            <option value="/opencode">/opencode</option>
            <option value="/codex">/codex</option>
            <option value="/claude">/claude</option>
          </select>
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          <textarea
            value={repoCommandPropose}
            onChange={(e) => setRepoCommandPropose(e.target.value)}
            placeholder="Override propose prompt (optional)"
            style={{ padding: 8, minHeight: 70 }}
          />
          <textarea
            value={repoCommandImplement}
            onChange={(e) => setRepoCommandImplement(e.target.value)}
            placeholder="Override implement prompt (optional)"
            style={{ padding: 8, minHeight: 70 }}
          />
          <textarea
            value={repoCommandFix}
            onChange={(e) => setRepoCommandFix(e.target.value)}
            placeholder="Override fix prompt (optional)"
            style={{ padding: 8, minHeight: 70 }}
          />
        </div>
        <div style={{ fontSize: 12, color: "#666" }}>
          Choose provider/prefix and optional prompt overrides, then click a repo row's \"Set agent\" button to apply.
        </div>

        {repoResult && <div style={{ color: "#555" }}>{repoResult}</div>}

        {repos.length === 0 ? (
          <div style={{ color: "#666" }}>No repos configured yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {repos.map((repo) => {
              let settings: Record<string, unknown> = {};
              try {
                settings = repo.settings_json ? JSON.parse(repo.settings_json) : {};
              } catch {
                settings = {};
              }
              const agent = (settings as { agentHarness?: { provider?: string; commandPrefix?: string; commands?: { proposePlans?: string; implement?: string; fixRobust?: string } } }).agentHarness || {};
              return (
                <div key={`${repo.owner}/${repo.name}`} style={{ border: "1px solid #eee", borderRadius: 8, padding: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{repo.owner}/{repo.name}</div>
                      <div style={{ fontSize: 12, color: "#666" }}>
                        {repo.default_branch ? `Branch: ${repo.default_branch}` : "Branch: (default)"}{" "}
                        {agent.provider ? `- Agent: ${agent.provider}` : ""}
                        {agent.commandPrefix ? ` (${agent.commandPrefix})` : ""}
                      </div>
                      {(agent.commands?.proposePlans || agent.commands?.implement || agent.commands?.fixRobust) && (
                        <div style={{ fontSize: 11, color: "#777", marginTop: 4 }}>
                          Prompt overrides set
                        </div>
                      )}
                    </div>
                    <button onClick={() => setRepoAgent(repo.owner, repo.name)} style={{ padding: "6px 10px" }}>
                      Set agent
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function PRCommentPanel({ onAfterPost }: { onAfterPost: () => void }) {
  const [owner, setOwner] = useState(process.env.NEXT_PUBLIC_GH_OWNER || "");
  const [repo, setRepo] = useState(process.env.NEXT_PUBLIC_GH_REPO || "");
  const [prNumber, setPrNumber] = useState<string>("");
  const [agentHarness, setAgentHarness] = useState<AgentHarnessConfig>(DEFAULT_AGENT);
  const [entries, setEntries] = useState<CommandEntry[]>(DEFAULT_ENTRIES);
  const [command, setCommand] = useState(DEFAULT_ENTRIES[0].value);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string>("");
  const [recent, setRecent] = useState<RecentTarget[]>([]);
  const [prs, setPrs] = useState<GithubPr[]>([]);

  const selectedEntry = useMemo(() => entries.find((entry) => entry.value === command), [entries, command]);
  const finalBody = useMemo(() => {
    if (selectedEntry?.requiresNotes || command.endsWith(":")) {
      return `${command} ${notes}`.trim();
    }
    return command;
  }, [command, notes, selectedEntry]);

  async function loadConfig() {
    try {
      const r = await fetch("/api/config");
      if (!r.ok) return;
      const j = await r.json();
      if (!j?.agentHarness || !j?.commentProtocol) return;
      setAgentHarness(j.agentHarness);
    } catch {
      // Ignore config fetch failures and keep defaults.
    }
  }

  async function loadCommands() {
    try {
    const params = new URLSearchParams();
    if (owner && repo) {
      params.set("owner", owner);
      params.set("repo", repo);
    }
    const suffix = params.toString();
    const r = await fetch(`/api/commands${suffix ? `?${suffix}` : ""}`);
      if (!r.ok) return;
      const j = await r.json();
      if (Array.isArray(j.items) && j.items.length > 0) {
        setEntries(j.items as CommandEntry[]);
      }
    } catch {
      // keep previous entries
    }
  }

  async function loadRecent() {
    const r = await fetch("/api/pr-comment?mode=recent");
    const j = await r.json();
    setRecent(j.items || []);
  }

  async function loadPrs() {
    if (!owner || !repo) return;
    const r = await fetch(`/api/prs?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`);
    const j = await r.json();
    setPrs(j.items || []);
  }

  useEffect(() => {
    loadConfig();
    loadRecent();
    loadCommands();
  }, []);

  useEffect(() => {
    loadPrs();
    loadCommands();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, repo]);

  useEffect(() => {
    if (!entries.find((entry) => entry.value === command)) {
      setCommand(entries[0]?.value ?? "");
    }
  }, [entries, command]);

  async function send() {
    setBusy(true);
    setResult("");
    try {
      const pr = Number(prNumber);
      if (!owner || !repo || !pr || Number.isNaN(pr)) {
        throw new Error("Owner, repo, and PR number are required.");
      }
      const r = await fetch("/api/pr-comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, repo, pr_number: pr, body: finalBody }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed to post comment.");
      setResult(`OK: Comment posted: ${j.url}`);
      setNotes("");
      await loadRecent();
      await loadPrs();
      onAfterPost();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setResult(`Error: ${message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 980 }}>
      <div>
        <h3 style={{ marginTop: 0 }}>PR Comment Control Panel</h3>
        <p style={{ color: "#555", marginTop: 4 }}>
          Post commands as PR comments to drive QA, Ralph, final PR creation, and agent runs.
        </p>
        <div style={{ color: "#666", fontSize: 13 }}>
          Active harness: <strong>{agentHarness.label}</strong> ({agentHarness.commandPrefix})
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <div>
          <label>Owner</label>
          <input value={owner} onChange={(e) => setOwner(e.target.value)} style={{ width: "100%", padding: 8 }} placeholder="e.g. jeremyconger" />
        </div>
        <div>
          <label>Repo</label>
          <input value={repo} onChange={(e) => setRepo(e.target.value)} style={{ width: "100%", padding: 8 }} placeholder="e.g. my-app" />
        </div>
        <div>
          <label>PR #</label>
          <input value={prNumber} onChange={(e) => setPrNumber(e.target.value)} style={{ width: "100%", padding: 8 }} placeholder="e.g. 123" />
        </div>
      </div>

      <div>
        <label>Command</label>
        <select value={command} onChange={(e) => setCommand(e.target.value)} style={{ width: "100%", padding: 8 }}>
          {entries.map((entry: CommandEntry) => (
            <option key={entry.label} value={entry.value}>{entry.label}</option>
          ))}
        </select>
      </div>

      {selectedEntry?.requiresNotes && (
        <div>
          <label>Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={{ width: "100%", padding: 8, minHeight: 90 }} placeholder="Add notes/reason..." />
        </div>
      )}

      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <button disabled={busy} onClick={send} style={{ padding: "10px 14px", cursor: "pointer" }}>
          {busy ? "Posting..." : "Post PR Comment"}
        </button>
        <code style={{ padding: "8px 10px", background: "#f6f8fa", border: "1px solid #eee", borderRadius: 6, flex: 1 }}>
          {finalBody}
        </code>
      </div>

      {result && (
        <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 8, background: "#fff" }}>
          {result}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <h4>Recent targets</h4>
          <div style={{ border: "1px solid #eee", borderRadius: 8, padding: 12 }}>
            {recent.length === 0 ? <div style={{ color: "#666" }}>No recent targets.</div> : (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {recent.map((t, idx) => (
                  <li key={idx}>
                    <code>{t.owner}/{t.repo}#{t.pr_number}</code> <span style={{ color: "#666" }}>({new Date(t.created_at).toLocaleString()})</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div>
          <h4>Open PRs (last 20)</h4>
          <div style={{ border: "1px solid #eee", borderRadius: 8, padding: 12, maxHeight: 280, overflow: "auto" }}>
            {(!owner || !repo) ? (
              <div style={{ color: "#666" }}>Enter owner/repo to load PRs.</div>
            ) : prs.length === 0 ? (
              <div style={{ color: "#666" }}>No PRs or unable to load.</div>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {prs.map((p) => (
                  <li key={p.number}>
                    <a href={p.html_url} target="_blank" rel="noreferrer">{p.title}</a>
                    <div style={{ color: "#666" }}>
                      <code>#{p.number}</code> - {p.draft ? "draft" : "ready"} - {p.state}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div style={{ color: "#666", fontSize: 13 }}>
        Tip: keep this open on your iPad and drive everything by clicking commands rather than typing PR comments manually.
      </div>
    </div>
  );
}
