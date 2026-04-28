/**
 * Work Graph API.
 *
 * Read-only v0 surface for active work contexts. The graph is currently
 * inferred from email threads, chat conversations, pending actions, and
 * commitments.
 */
import type { FastifyInstance } from "fastify";
import { getUserId, requireAuth } from "../auth.js";
import { buildWorkGraphSummary } from "../work-graph.js";

export function workGraphRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/summary", async (request) => {
    const userId = getUserId(request);
    const { limit } = request.query as { limit?: string };
    const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
    return await buildWorkGraphSummary(userId, {
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    });
  });
}
