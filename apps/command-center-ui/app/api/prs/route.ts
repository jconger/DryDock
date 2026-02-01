import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOctokit } from "@/lib/github";

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

    const octokit = getOctokit();
    const resp = await octokit.pulls.list({
      owner,
      repo,
      state: "open",
      per_page: 20,
    });

    return NextResponse.json({ items: resp.data });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ items: [], error: message }, { status: 400 });
  }
}
