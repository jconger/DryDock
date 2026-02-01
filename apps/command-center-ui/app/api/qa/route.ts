import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runCliJson } from "@/lib/cli";
import { QA_STATUSES, type QaChecklistItem } from "@/lib/qa-types";

const ChecklistItemSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  status: z.enum(["pending", "pass", "fail"]),
  notes: z.string().optional().default(""),
  evidence: z.string().optional().default(""),
});

const CreateSchema = z.object({
  feature_id: z.string().min(1),
  checklist: z.array(z.string().min(1)).min(1),
});

const PatchSchema = z.object({
  id: z.number().int().positive(),
  status: z.enum(QA_STATUSES).optional(),
  checklist: z.array(ChecklistItemSchema).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const featureId = url.searchParams.get("feature_id");
    if (!featureId) {
      return NextResponse.json({ error: "feature_id required" }, { status: 400 });
    }
    const data = await runCliJson<{ item: unknown; ok?: boolean; error?: string }>([
      "qa",
      "get",
      "--feature-id",
      featureId,
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
    const data = await runCliJson<{ item: unknown; ok?: boolean; error?: string }>([
      "qa",
      "create",
      "--feature-id",
      payload.feature_id,
      "--items",
      payload.checklist.join("|"),
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

export async function PATCH(req: NextRequest) {
  try {
    const json = await req.json();
    const payload = PatchSchema.parse(json);
    const args = [
      "qa",
      "update",
      "--id",
      String(payload.id),
      "--json",
    ];
    if (payload.status) args.push("--status", payload.status);
    if (payload.checklist) args.push("--checklist-json", JSON.stringify(payload.checklist));
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
