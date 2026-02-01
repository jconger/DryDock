import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { FEATURE_STATUSES } from "@/lib/feature-types";
import { runCliJson } from "@/lib/cli";

const CreateSchema = z.object({
  title: z.string().min(1),
  description_md: z.string().optional(),
  status: z.enum(FEATURE_STATUSES).optional(),
  priority: z.string().optional(),
  impact: z.string().optional(),
  effort: z.string().optional(),
  confidence: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const PatchSchema = z.object({
  id: z.string().min(1),
  status: z.enum(FEATURE_STATUSES),
});

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const limit = Number(url.searchParams.get("limit") ?? "50");
    const items = await runCliJson<{ items: unknown[]; ok?: boolean; error?: string }>([
      "features",
      "list",
      "--limit",
      String(Number.isFinite(limit) ? limit : 50),
      "--json",
    ]);
    if ("ok" in items && items.ok === false) {
      return NextResponse.json(items, { status: 400 });
    }
    return NextResponse.json(items);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ items: [], error: message }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const payload = CreateSchema.parse(json);
    const args = [
      "features",
      "create",
      "--title",
      payload.title,
      "--json",
    ];
    if (payload.description_md) args.push("--description", payload.description_md);
    if (payload.status) args.push("--status", payload.status);
    if (payload.priority) args.push("--priority", payload.priority);
    if (payload.impact) args.push("--impact", payload.impact);
    if (payload.effort) args.push("--effort", payload.effort);
    if (payload.confidence) args.push("--confidence", payload.confidence);
    if (payload.tags?.length) args.push("--tags", payload.tags.join(","));
    const item = await runCliJson<{ item: unknown; ok?: boolean; error?: string }>(args);
    if ("ok" in item && item.ok === false) {
      return NextResponse.json(item, { status: 400 });
    }
    return NextResponse.json(item);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const json = await req.json();
    const { id, status } = PatchSchema.parse(json);
    const response = await runCliJson<{ ok: boolean; error?: string }>([
      "features",
      "status",
      "--id",
      id,
      "--status",
      status,
      "--json",
    ]);
    if ("ok" in response && response.ok === false) {
      return NextResponse.json(response, { status: 400 });
    }
    return NextResponse.json(response);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
