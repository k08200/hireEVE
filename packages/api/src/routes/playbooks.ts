/**
 * Built-in EVE Playbooks API.
 *
 * These routes are read-only in v0. They expose the canonical playbook
 * registry and context-aware recommendations inferred from the Work Graph.
 */

import type { FastifyInstance } from "fastify";
import { getUserId, requireAuth } from "../auth.js";
import { buildPlaybookRecommendations, listEvePlaybooks } from "../playbooks.js";

export function playbookRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/", async () => ({ playbooks: listEvePlaybooks() }));

  app.get("/recommendations", async (request) => {
    const userId = getUserId(request);
    const { limit, contextLimit } = request.query as { limit?: string; contextLimit?: string };
    return await buildPlaybookRecommendations(userId, {
      limit: parseOptionalInteger(limit),
      contextLimit: parseOptionalInteger(contextLimit),
    });
  });
}

function parseOptionalInteger(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}
