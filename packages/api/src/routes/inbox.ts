/**
 * Inbox Command Center API.
 *
 * GET /api/inbox/summary collapses the four signal sources (pending actions,
 * tasks, today's events, agent_proposal notifications) into a single response
 * with a deterministic Top 3 + a today section. The frontend renders it
 * directly — no client-side ranking.
 */
import type { FastifyInstance } from "fastify";
import { getUserId, requireAuth } from "../auth.js";
import { buildInboxSummary } from "../inbox-summary.js";

export async function inboxRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/summary", async (request) => {
    const userId = getUserId(request);
    return buildInboxSummary(userId);
  });
}
