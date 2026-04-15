/**
 * Skills API — Reusable workflows saved as memory-backed templates.
 *
 * Uses the existing Memory table with type="SKILL" to store user-defined
 * shortcuts like "weekly report", "investor update email", "daily task review".
 *
 * No schema migration needed — leverages existing infrastructure.
 */

import type { FastifyInstance } from "fastify";
import { getUserId, requireAuth } from "../auth.js";
import { forget, recall, remember } from "../memory.js";

interface SkillPayload {
  name: string;
  description: string;
  prompt: string;
}

export async function skillRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  // GET /api/skills — List user's skills
  app.get("/", async (request) => {
    const userId = getUserId(request);
    const raw = await recall(userId, undefined, "SKILL");
    const parsed = JSON.parse(raw);
    const skills = (parsed.memories || []).map(
      (m: { key: string; content: string; updatedAt: string }) => {
        try {
          const data = JSON.parse(m.content);
          return {
            id: m.key,
            name: data.name,
            description: data.description,
            prompt: data.prompt,
            updatedAt: m.updatedAt,
          };
        } catch {
          return {
            id: m.key,
            name: m.key,
            description: "",
            prompt: m.content,
            updatedAt: m.updatedAt,
          };
        }
      },
    );
    return { skills };
  });

  // POST /api/skills — Create a skill
  app.post("/", async (request, reply) => {
    const userId = getUserId(request);
    const { name, description, prompt } = request.body as SkillPayload;

    if (!name || !prompt) {
      return reply.code(400).send({ error: "Name and prompt are required" });
    }

    const key = `skill_${name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .slice(0, 40)}`;
    const content = JSON.stringify({ name, description: description || "", prompt });

    await remember(userId, "SKILL", key, content, "user");
    return reply.code(201).send({ id: key, name, description, prompt });
  });

  // DELETE /api/skills/:key — Delete a skill
  app.delete("/:key", async (request, reply) => {
    const userId = getUserId(request);
    const { key } = request.params as { key: string };

    const result = JSON.parse(await forget(userId, key, "SKILL"));
    if (!result.success) {
      return reply.code(404).send({ error: "Skill not found" });
    }
    return reply.code(204).send();
  });

  // POST /api/skills/:key/execute — Run a skill (returns the prompt for chat)
  app.post("/:key/execute", async (request) => {
    const userId = getUserId(request);
    const { key } = request.params as { key: string };
    const { variables } = (request.body || {}) as { variables?: Record<string, string> };

    const raw = await recall(userId, key, "SKILL");
    const parsed = JSON.parse(raw);
    const match = parsed.memories?.find((m: { key: string }) => m.key === key);

    if (!match) {
      return { error: "Skill not found" };
    }

    let prompt: string;
    try {
      const data = JSON.parse(match.content);
      prompt = data.prompt;
    } catch {
      prompt = match.content;
    }

    // Replace {{variable}} placeholders
    if (variables) {
      for (const [k, v] of Object.entries(variables)) {
        prompt = prompt.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v);
      }
    }

    return { prompt, skillName: match.key };
  });
}
