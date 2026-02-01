import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runCliJson } from "@/lib/cli";

const BodySchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  pr_number: z.number().int().positive(),
  mode: z.enum(["squash", "cherry-pick"]),
});

export async function POST(req: NextRequest) {
  try {
    const body = BodySchema.parse(await req.json());
    const data = await runCliJson<{ url: string; branch: string; pr_number: number; ok?: boolean; error?: string }>([
      "final",
      "create",
      "--owner",
      body.owner,
      "--repo",
      body.repo,
      "--pr",
      String(body.pr_number),
      "--mode",
      body.mode,
      "--json",
    ]);
    if ("ok" in data && data.ok === false) {
      return NextResponse.json(data, { status: 400 });
    }
    return NextResponse.json(data);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
