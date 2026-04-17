/**
 * Agent Decision Logic — Pure functions used by the autonomous agent.
 *
 * Extracted from autonomous-agent.ts so they can be imported without
 * pulling in the full agent runtime (OpenAI client, Gmail, Prisma).
 * Enables focused unit tests and the agent-eval harness.
 */

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

/**
 * Tool risk classification — controls how the autonomous agent handles each tool.
 * - LOW: safe, executes automatically in AUTO mode
 * - MEDIUM: external-facing, requires approval (or pre-approval via alwaysAllowedTools)
 * - HIGH: destructive, always requires explicit user confirmation
 */
export const TOOL_RISK_LEVELS = new Map<string, RiskLevel>([
  // LOW — safe, easily reversible, no external side effects
  ["create_reminder", "LOW"],
  ["dismiss_reminder", "LOW"],
  ["update_task", "LOW"],
  ["classify_emails", "LOW"],
  ["create_task", "LOW"],
  ["update_note", "LOW"],
  ["mark_read", "LOW"],

  // MEDIUM — external-facing, requires user approval before sending
  ["send_email", "MEDIUM"],

  // MEDIUM — external-facing or calendar changes, reversible but visible
  ["create_event", "MEDIUM"],
  ["create_note", "MEDIUM"],
  ["update_contact", "MEDIUM"],
  ["create_contact", "MEDIUM"],

  // LOW — skill execution (prompt template, no external side effect)
  ["execute_skill", "LOW"],
  ["list_skills", "LOW"],

  // HIGH — destructive or hard to reverse
  ["delete_task", "HIGH"],
  ["delete_reminder", "HIGH"],
  ["delete_note", "HIGH"],
  ["delete_event", "HIGH"],
  ["archive_email", "HIGH"],
  ["delete_email", "HIGH"],
]);

/** Get risk level for a tool. Returns undefined for read-only tools. */
export function getToolRisk(toolName: string): RiskLevel | undefined {
  return TOOL_RISK_LEVELS.get(toolName);
}

/**
 * Normalize a notification title for fuzzy dedup.
 * Catches slight variations like "스크럼 장소 확인" vs "스크럼 장소 중복 알림"
 * by stripping whitespace/punctuation and lowercasing to a 30-char key.
 */
export function getNotifKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[\s.,!?·\-_()[\]{}'"]/g, "")
    .slice(0, 30);
}
