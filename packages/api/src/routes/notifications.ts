import type { FastifyInstance } from "fastify";
import { getUserId } from "../auth.js";
import { clearNotifications, getNotifications } from "../background.js";

export async function notificationRoutes(app: FastifyInstance) {
  // GET /api/notifications — Get pending notifications
  app.get("/", async (request) => {
    const userId = getUserId(request);
    const notifs = getNotifications(userId);
    return { notifications: notifs, count: notifs.length };
  });

  // DELETE /api/notifications — Clear all notifications
  app.delete("/", async (request, reply) => {
    const userId = getUserId(request);
    clearNotifications(userId);
    return reply.code(204).send();
  });
}
