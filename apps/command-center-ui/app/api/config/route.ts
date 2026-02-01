import { NextResponse } from "next/server";
import { runCliJson } from "@/lib/cli";

export async function GET() {
  try {
    const data = await runCliJson<{ configPath: string | null; agentHarness: unknown; commentProtocol: unknown; ok?: boolean; error?: string }>([
      "config",
      "show",
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
