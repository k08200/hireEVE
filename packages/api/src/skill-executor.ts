/**
 * Skill Executor — EVE tool for running saved reusable workflows.
 *
 * Provides execute_skill and list_skills tools so EVE can discover
 * and run user-defined skills during chat and autonomous mode.
 */

import { recall } from "./memory.js";

interface SkillData {
  name: string;
  description: string;
  prompt: string;
}

interface SkillMemory {
  key: string;
  content: string;
  updatedAt: string;
}

export const SKILL_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "execute_skill",
      description:
        "Run a saved reusable workflow (skill) by name. Skills are user-defined prompt templates. " +
        "Use list_skills first to see available skills. Variables in {{double braces}} are replaced with provided values.",
      parameters: {
        type: "object",
        properties: {
          skill_name: {
            type: "string",
            description:
              'The skill name to execute (e.g. "weekly_report", "investor_update"). ' +
              "Matched case-insensitively against saved skill names.",
          },
          variables: {
            type: "object",
            description:
              "Optional key-value pairs to substitute {{placeholders}} in the skill prompt. " +
              'Example: {"name": "Alice", "date": "2026-04-15"}',
            additionalProperties: { type: "string" },
          },
        },
        required: ["skill_name"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_skills",
      description:
        "List all saved skills for the current user. Returns skill names, descriptions, and available {{variables}}.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
];

function parseSkillContent(content: string): SkillData {
  try {
    return JSON.parse(content) as SkillData;
  } catch {
    return { name: "", description: "", prompt: content };
  }
}

function extractVariables(prompt: string): string[] {
  const matches = prompt.match(/\{\{(\w+)\}\}/g);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.slice(2, -2)))];
}

/** List all skills for a user */
export async function listUserSkills(
  userId: string,
): Promise<{ skills: Array<{ name: string; description: string; variables: string[] }> }> {
  const raw = await recall(userId, undefined, "SKILL");
  const parsed = JSON.parse(raw);
  const memories: SkillMemory[] = parsed.memories || [];

  const skills = memories.map((m) => {
    const data = parseSkillContent(m.content);
    return {
      name: data.name || m.key,
      description: data.description || "",
      variables: extractVariables(data.prompt),
    };
  });

  return { skills };
}

/** Execute a skill by name with optional variable substitution */
export async function executeSkill(
  userId: string,
  skillName: string,
  variables?: Record<string, string>,
): Promise<{ prompt: string; skillName: string } | { error: string }> {
  const raw = await recall(userId, undefined, "SKILL");
  const parsed = JSON.parse(raw);
  const memories: SkillMemory[] = parsed.memories || [];

  // Match by name (case-insensitive) or by key
  const normalizedName = skillName.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  const match = memories.find((m) => {
    const data = parseSkillContent(m.content);
    const nameMatch = data.name.toLowerCase().replace(/[^a-z0-9]+/g, "_") === normalizedName;
    const keyMatch = m.key === `skill_${normalizedName}`;
    return nameMatch || keyMatch;
  });

  if (!match) {
    return { error: `Skill "${skillName}" not found. Use list_skills to see available skills.` };
  }

  const data = parseSkillContent(match.content);
  let prompt = data.prompt;

  if (variables) {
    for (const [k, v] of Object.entries(variables)) {
      prompt = prompt.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v);
    }
  }

  return { prompt, skillName: data.name || match.key };
}
