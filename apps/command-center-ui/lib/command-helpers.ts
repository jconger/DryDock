import type { AgentHarnessConfig, CommentProtocol } from "@/lib/constants";

export type CommandEntry = { label: string; value: string; requiresNotes?: boolean };

export function buildCommandEntries(agent: AgentHarnessConfig, protocol: CommentProtocol): CommandEntry[] {
  return [
    { label: protocol.commands.qaGenerate, value: protocol.commands.qaGenerate },
    { label: protocol.commands.qaPass, value: protocol.commands.qaPass },
    { label: `${protocol.commands.qaFail} <notes>`, value: protocol.commands.qaFail, requiresNotes: true },
    { label: protocol.commands.ralphRun, value: protocol.commands.ralphRun },
    { label: `${protocol.commands.ralphAccept} <reason>`, value: protocol.commands.ralphAccept, requiresNotes: true },
    { label: protocol.commands.finalCreate, value: protocol.commands.finalCreate },
    {
      label: `${agent.commandPrefix} propose plans`,
      value: `${agent.commandPrefix} ${agent.commands.proposePlans}`,
    },
    {
      label: `${agent.commandPrefix} implement (per spec)`,
      value: `${agent.commandPrefix} ${agent.commands.implement}`,
    },
    {
      label: `${agent.commandPrefix} fix robust (from Fix Bundle)`,
      value: `${agent.commandPrefix} ${agent.commands.fixRobust}`,
    },
  ];
}
