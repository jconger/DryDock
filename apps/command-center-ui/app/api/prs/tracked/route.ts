import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runCliJson } from "@/lib/cli";

const QuerySchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  type: z.enum(["working", "final"]).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const { owner, repo, type } = QuerySchema.parse({
      owner: url.searchParams.get("owner"),
      repo: url.searchParams.get("repo"),
      type: url.searchParams.get("type") || undefined,
    });
    const args = ["prs", "tracked", "--owner", owner, "--repo", repo, "--json"];
    if (type) args.push("--type", type);
    const data = await runCliJson<{ items: unknown[]; ok?: boolean; error?: string }>(args);
    if ("ok" in data && data.ok === false) {
      return NextResponse.json(data, { status: 400 });
    }
    return NextResponse.json(data);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ items: [], error: message }, { status: 400 });
  }
}
