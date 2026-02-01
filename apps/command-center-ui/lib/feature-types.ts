export const FEATURE_STATUSES = [
  "PROPOSED",
  "APPROVED",
  "SPEC_CHOOSING",
  "SPEC_SELECTED",
  "IMPLEMENTING",
  "READY_FOR_QA",
  "QA_IN_PROGRESS",
  "QA_FAILED",
  "QA_PASSED",
  "FINAL_PR_CREATED",
  "DONE",
  "DEFERRED",
  "REJECTED",
] as const;

export type FeatureStatus = (typeof FEATURE_STATUSES)[number];

export type FeatureRecord = {
  id: string;
  repo_id: number | null;
  title: string;
  description_md: string;
  source_type: string;
  source_refs_json: string;
  status: FeatureStatus;
  priority: string;
  impact: string;
  effort: string;
  confidence: string;
  tags_json: string;
  created_at: string;
  updated_at: string;
};
