export const QA_STATUSES = ["proposed", "testing", "failed", "passed"] as const;
export type QaStatus = (typeof QA_STATUSES)[number];

export type QaChecklistStatus = "pending" | "pass" | "fail";

export type QaChecklistItem = {
  id: string;
  text: string;
  status: QaChecklistStatus;
  notes: string;
  evidence: string;
};

export type QaPacketRecord = {
  id: number;
  feature_id: string;
  status: QaStatus;
  checklist_json: string;
  created_at: string;
  updated_at: string;
};
