import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createFeature, listFeatures, updateFeatureStatus } from "@/lib/features";
import { FEATURE_STATUSES } from "@/lib/feature-types";

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
    const items = listFeatures(Number.isFinite(limit) ? limit : 50);
    return NextResponse.json({ items });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ items: [], error: message }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const payload = CreateSchema.parse(json);
    const item = createFeature(payload);
    return NextResponse.json({ item });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const json = await req.json();
    const { id, status } = PatchSchema.parse(json);
    updateFeatureStatus(id, status);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
