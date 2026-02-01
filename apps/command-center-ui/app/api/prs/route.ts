import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runCliJson } from "@/lib/cli";

const QuerySchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
});

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const { owner, repo } = QuerySchema.parse({
      owner: url.searchParams.get("owner"),
      repo: url.searchParams.get("repo"),
    });

    const data = await runCliJson<{ items: unknown[]; ok?: boolean; error?: string }>([
      "prs",
      "list",
      "--owner",
      owner,
      "--repo",
      repo,
      "--json",
    ]);
    if ("ok" in data && data.ok === false) {
      return NextResponse.json(data, { status: 400 });
    }
    return NextResponse.json(data);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ items: [], error: message }, { status: 400 });
  }
}
