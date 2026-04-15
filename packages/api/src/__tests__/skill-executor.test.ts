import { beforeEach, describe, expect, it, vi } from "vitest";

type Skill = { key: string; content: string; updatedAt: string };
const store = new Map<string, Skill>();

vi.mock("../memory.js", () => ({
  remember: vi.fn(async (_userId: string, _type: string, key: string, content: string) => {
    store.set(key, { key, content, updatedAt: new Date().toISOString() });
    return JSON.stringify({ success: true, id: key });
  }),
  recall: vi.fn(async (_userId: string, _query?: string, _type?: string) => {
    const memories: Array<{ type: string; key: string; content: string; updatedAt: string }> = [];
    for (const s of store.values()) {
      memories.push({ type: "SKILL", key: s.key, content: s.content, updatedAt: s.updatedAt });
    }
    if (memories.length === 0)
      return JSON.stringify({ memories: [], message: "No memories found" });
    return JSON.stringify({ memories });
  }),
  forget: vi.fn(),
  MEMORY_TOOLS: [],
}));

const { executeSkill, listUserSkills } = await import("../skill-executor.js");

function addSkill(name: string, prompt: string, description = "") {
  const key = `skill_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
  store.set(key, {
    key,
    content: JSON.stringify({ name, description, prompt }),
    updatedAt: new Date().toISOString(),
  });
}

describe("skill-executor", () => {
  beforeEach(() => store.clear());

  describe("listUserSkills", () => {
    it("returns empty array when no skills exist", async () => {
      const result = await listUserSkills("user-1");
      expect(result.skills).toEqual([]);
    });

    it("lists skills with extracted variables", async () => {
      addSkill("Weekly Report", "Summarize tasks for {{week}} assigned to {{team}}");
      addSkill("Quick Note", "Create a note about {{topic}}");

      const result = await listUserSkills("user-1");
      expect(result.skills).toHaveLength(2);

      const weekly = result.skills.find((s) => s.name === "Weekly Report");
      expect(weekly?.variables).toEqual(["week", "team"]);

      const note = result.skills.find((s) => s.name === "Quick Note");
      expect(note?.variables).toEqual(["topic"]);
    });

    it("lists skills with no variables", async () => {
      addSkill("Daily Standup", "List today's tasks and yesterday's completed items");

      const result = await listUserSkills("user-1");
      expect(result.skills[0].variables).toEqual([]);
    });
  });

  describe("executeSkill", () => {
    it("returns error when skill not found", async () => {
      const result = await executeSkill("user-1", "nonexistent");
      expect(result).toHaveProperty("error");
      expect((result as { error: string }).error).toContain("not found");
    });

    it("executes a skill by name", async () => {
      addSkill("Weekly Report", "Summarize this week's tasks");

      const result = await executeSkill("user-1", "Weekly Report");
      expect(result).toEqual({
        prompt: "Summarize this week's tasks",
        skillName: "Weekly Report",
      });
    });

    it("matches skill name case-insensitively", async () => {
      addSkill("Weekly Report", "Summarize tasks");

      const result = await executeSkill("user-1", "weekly report");
      expect(result).toHaveProperty("prompt");
    });

    it("matches by partial normalized name", async () => {
      addSkill("Weekly Report", "Summarize tasks");

      const result = await executeSkill("user-1", "weekly_report");
      expect(result).toHaveProperty("prompt");
    });

    it("substitutes variables", async () => {
      addSkill("Greet", "Hello {{name}}, welcome to {{company}}!");

      const result = await executeSkill("user-1", "Greet", {
        name: "Alice",
        company: "Acme",
      });
      expect(result).toEqual({
        prompt: "Hello Alice, welcome to Acme!",
        skillName: "Greet",
      });
    });

    it("substitutes duplicate variables", async () => {
      addSkill("Repeat", "{{word}} {{word}} {{word}}");

      const result = await executeSkill("user-1", "Repeat", { word: "hello" });
      expect(result).toEqual({
        prompt: "hello hello hello",
        skillName: "Repeat",
      });
    });

    it("leaves unmatched variables as-is", async () => {
      addSkill("Partial", "Hello {{name}}, your role is {{role}}");

      const result = await executeSkill("user-1", "Partial", { name: "Bob" });
      expect(result).toEqual({
        prompt: "Hello Bob, your role is {{role}}",
        skillName: "Partial",
      });
    });

    it("works without variables parameter", async () => {
      addSkill("Simple", "Just do the thing");

      const result = await executeSkill("user-1", "Simple");
      expect(result).toEqual({
        prompt: "Just do the thing",
        skillName: "Simple",
      });
    });
  });
});
