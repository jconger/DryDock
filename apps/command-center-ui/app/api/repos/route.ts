import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runCliJson } from "@/lib/cli";

const CreateSchema = z.object({
  owner: z.string().min(1),
  name: z.string().min(1),
  default_branch: z.string().optional().nullable(),
});

const PatchSchema = z.object({
  owner: z.string().min(1),
  name: z.string().min(1),
  provider: z.string().optional().nullable(),
  prefix: z.string().optional().nullable(),
  command_propose: z.string().optional().nullable(),
  command_implement: z.string().optional().nullable(),
  command_fix: z.string().optional().nullable(),
  config: z.record(z.any()).optional(),
  replace: z.boolean().optional(),
});

export async function GET() {
  try {
    const data = await runCliJson<{ items: unknown[]; ok?: boolean; error?: string }>([
      "repos",
      "list",
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

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const payload = CreateSchema.parse(json);
    const args = [
      "repos",
      "add",
      "--owner",
      payload.owner,
      "--name",
      payload.name,
      "--json",
    ];
    if (payload.default_branch) args.push("--default-branch", payload.default_branch);
    const data = await runCliJson<{ item: unknown; ok?: boolean; error?: string }>(args);
    if ("ok" in data && data.ok === false) {
      return NextResponse.json(data, { status: 400 });
    }
    return NextResponse.json(data);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const json = await req.json();
    const payload = PatchSchema.parse(json);
    let response: { item: unknown; ok?: boolean; error?: string } | null = null;

    const agentFields = payload.provider || payload.prefix || payload.command_propose || payload.command_implement || payload.command_fix;
    if (agentFields) {
      const args = [
        "repos",
        "set-agent",
        "--owner",
        payload.owner,
        "--name",
        payload.name,
        "--json",
      ];
      if (payload.provider) args.push("--provider", payload.provider);
      if (payload.prefix) args.push("--prefix", payload.prefix);
      if (payload.command_propose) args.push("--command-propose", payload.command_propose);
      if (payload.command_implement) args.push("--command-implement", payload.command_implement);
      if (payload.command_fix) args.push("--command-fix", payload.command_fix);
      response = await runCliJson<{ item: unknown; ok?: boolean; error?: string }>(args);
      if ("ok" in response && response.ok === false) {
        return NextResponse.json(response, { status: 400 });
      }
    }

    if (payload.config) {
      const args = [
        "repos",
        "set-config",
        "--owner",
        payload.owner,
        "--name",
        payload.name,
        "--config-json",
        JSON.stringify(payload.config),
        "--json",
      ];
      if (payload.replace) args.push("--replace");
      response = await runCliJson<{ item: unknown; ok?: boolean; error?: string }>(args);
      if ("ok" in response && response.ok === false) {
        return NextResponse.json(response, { status: 400 });
      }
    }

    if (!response) {
      return NextResponse.json({ error: "No update fields provided." }, { status: 400 });
    }
    return NextResponse.json(response);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
