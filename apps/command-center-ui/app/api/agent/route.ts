import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runCliJson } from "@/lib/cli";

const AGENT_MAX_BUFFER = 1024 * 1024 * 20;

const AgentSchema = z.object({
  mode: z.enum(["propose", "implement", "fix"]),
  prompt: z.string().optional(),
  context: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const payload = AgentSchema.parse(json);
    const args = ["agent", "run", "--mode", payload.mode, "--json"];
    if (payload.prompt) args.push("--prompt", payload.prompt);
    if (payload.context) args.push("--context", payload.context);
    const data = await runCliJson<{
      ok: boolean;
      exitCode: number;
      stdout: string;
      stderr: string;
      command: string;
    }>(args, undefined, { maxBuffer: AGENT_MAX_BUFFER });
    return NextResponse.json(data);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
