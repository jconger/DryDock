import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runCliJson } from "@/lib/cli";

const PostSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  pr_number: z.number().int().positive(),
  body: z.string().min(1),
});

export async function GET(req: NextRequest) {
  const mode = new URL(req.url).searchParams.get("mode");
  if (mode === "recent") {
    const data = await runCliJson<{ items: unknown[]; ok?: boolean; error?: string }>([
      "recent",
      "list",
      "--limit",
      "12",
      "--json",
    ]);
    if ("ok" in data && data.ok === false) {
      return NextResponse.json(data, { status: 400 });
    }
    return NextResponse.json(data);
  }
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const { owner, repo, pr_number, body } = PostSchema.parse(json);

    const data = await runCliJson<{ url: string; ok?: boolean; error?: string }>([
      "pr-comment",
      "post",
      "--owner",
      owner,
      "--repo",
      repo,
      "--pr",
      String(pr_number),
      "--body",
      body,
      "--json",
    ]);
    if ("ok" in data && data.ok === false) {
      return NextResponse.json(data, { status: 400 });
    }
    return NextResponse.json(data);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
