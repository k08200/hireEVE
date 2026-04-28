export const AGENT_MODES = ["SHADOW", "SUGGEST", "AUTO"] as const;

export type AgentMode = (typeof AGENT_MODES)[number];

export function normalizeAgentMode(value: unknown): AgentMode {
  return AGENT_MODES.includes(value as AgentMode) ? (value as AgentMode) : "SUGGEST";
}
