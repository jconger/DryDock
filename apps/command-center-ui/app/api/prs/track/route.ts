import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runCliJson } from "@/lib/cli";

const BodySchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  pr_number: z.number().int().positive(),
  type: z.enum(["working", "final"]),
  working_pr_number: z.number().int().positive().optional().nullable(),
});

export async function POST(req: NextRequest) {
  try {
    const body = BodySchema.parse(await req.json());
    const args = [
      "prs",
      "track",
      "--owner",
      body.owner,
      "--repo",
      body.repo,
      "--pr",
      String(body.pr_number),
      "--type",
      body.type,
      "--json",
    ];
    if (body.working_pr_number) {
      args.push("--working-pr", String(body.working_pr_number));
    }
    const data = await runCliJson<{ item: unknown; ok?: boolean; error?: string }>(args);
    if ("ok" in data && data.ok === false) {
      return NextResponse.json(data, { status: 400 });
    }
    return NextResponse.json(data);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
