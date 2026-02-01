import { NextResponse } from "next/server";
import { getAgentHarness, getCommentProtocol, loadCommandCenterConfig } from "@/lib/config";

export async function GET() {
  const { config, configPath } = loadCommandCenterConfig();
  return NextResponse.json({
    configPath,
    agentHarness: getAgentHarness(config),
    commentProtocol: getCommentProtocol(config),
  });
}
