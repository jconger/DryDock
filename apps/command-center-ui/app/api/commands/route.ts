import { NextRequest, NextResponse } from "next/server";
import { runCliText } from "@/lib/cli";

function parseCommands(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({
      label: line,
      value: line,
      requiresNotes: line.endsWith(":") || line.includes("/cc qa fail:") || line.includes("/cc ralph accept:"),
    }));
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const owner = url.searchParams.get("owner");
    const repo = url.searchParams.get("repo");
    const args = ["commands"];
    if (owner && repo) {
      args.push("--owner", owner, "--repo", repo);
    }
    const result = await runCliText(args);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ items: parseCommands(result.data) });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
