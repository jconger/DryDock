import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOctokit } from "@/lib/github";
import { listRecentTargets, savePrTarget } from "@/lib/db";

const PostSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  pr_number: z.number().int().positive(),
  body: z.string().min(1),
});

export async function GET(req: NextRequest) {
  const mode = new URL(req.url).searchParams.get("mode");
  if (mode === "recent") {
    const items = listRecentTargets(12);
    return NextResponse.json({ items });
  }
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const { owner, repo, pr_number, body } = PostSchema.parse(json);

    const octokit = getOctokit();
    const resp = await octokit.issues.createComment({
      owner,
      repo,
      issue_number: pr_number, // PR comments use issue API
      body,
    });

    savePrTarget(owner, repo, pr_number);

    return NextResponse.json({ ok: true, url: resp.data.html_url });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
