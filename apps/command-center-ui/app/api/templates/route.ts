import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runCliJson } from "@/lib/cli";

const TemplateSchema = z.object({
  type: z.enum(["qa", "fix-bundle", "ralph"]),
  feature_id: z.string().optional(),
  feature_title: z.string().optional(),
  working_pr: z.string().optional(),
  working_branch: z.string().optional(),
  spec_ref: z.string().optional(),
  acceptance: z.array(z.string()).optional(),
  edge: z.array(z.string()).optional(),
  ralph_checklist: z.array(z.string()).optional(),
  failed_checks: z.array(z.string()).optional(),
  repro_steps: z.array(z.string()).optional(),
  expected: z.string().optional(),
  actual: z.string().optional(),
  evidence: z.string().optional(),
  changed_files: z.array(z.string()).optional(),
  diff_snippets: z.string().optional(),
  fix_style: z.string().optional(),
  ralph_findings: z.array(z.string()).optional(),
  result_notes: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const payload = TemplateSchema.parse(json);
    const args = ["templates", "render", "--type", payload.type, "--json"];
    if (payload.feature_id) {
      args.push("--feature-id", payload.feature_id);
    }
    args.push("--data-json", JSON.stringify(payload));
    const result = await runCliJson<{ content: string; type: string; templatePath: string }>(args);
    return NextResponse.json(result);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
