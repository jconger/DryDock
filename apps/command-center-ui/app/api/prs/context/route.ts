import { NextRequest, NextResponse } from "next/server";
import { runCliJson } from "@/lib/cli";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const owner = url.searchParams.get("owner");
    const repo = url.searchParams.get("repo");
    const pr = url.searchParams.get("pr");
    if (!owner || !repo || !pr) {
      return NextResponse.json({ error: "owner, repo, and pr are required" }, { status: 400 });
    }
    const data = await runCliJson<{ pr: unknown; files: string[]; diff_snippets: string; truncated: boolean }>([
      "prs",
      "context",
      "--owner",
      owner,
      "--repo",
      repo,
      "--pr",
      pr,
      "--json",
    ]);
    return NextResponse.json(data);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
