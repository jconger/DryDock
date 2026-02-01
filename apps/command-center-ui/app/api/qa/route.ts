import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createQaPacket, getLatestQaPacket, updateQaPacket } from "@/lib/qa";
import { updateFeatureStatus } from "@/lib/features";
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

function parseChecklist(recordChecklist: string) {
  try {
    return JSON.parse(recordChecklist) as QaChecklistItem[];
  } catch {
    return [] as QaChecklistItem[];
  }
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const featureId = url.searchParams.get("feature_id");
    if (!featureId) {
      return NextResponse.json({ error: "feature_id required" }, { status: 400 });
    }
    const packet = getLatestQaPacket(featureId);
    if (!packet) return NextResponse.json({ item: null });
    return NextResponse.json({
      item: { ...packet, checklist: parseChecklist(packet.checklist_json) },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const payload = CreateSchema.parse(json);
    const checklist: QaChecklistItem[] = payload.checklist.map((text, idx) => ({
      id: `item_${idx + 1}`,
      text,
      status: "pending",
      notes: "",
      evidence: "",
    }));
    const packet = createQaPacket(payload.feature_id, checklist, "testing");
    updateFeatureStatus(payload.feature_id, "QA_IN_PROGRESS");
    return NextResponse.json({
      item: { ...packet, checklist },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const json = await req.json();
    const payload = PatchSchema.parse(json);
    const packet = updateQaPacket(payload.id, {
      status: payload.status,
      checklist: payload.checklist,
    });
    if (!packet) {
      return NextResponse.json({ error: "QA packet not found" }, { status: 404 });
    }
    if (payload.status === "failed") {
      updateFeatureStatus(packet.feature_id, "QA_FAILED");
    }
    if (payload.status === "passed") {
      updateFeatureStatus(packet.feature_id, "QA_PASSED");
    }
    if (payload.status === "testing") {
      updateFeatureStatus(packet.feature_id, "QA_IN_PROGRESS");
    }
    return NextResponse.json({
      item: { ...packet, checklist: payload.checklist ?? parseChecklist(packet.checklist_json) },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
