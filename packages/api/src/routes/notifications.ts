import type { FastifyInstance } from "fastify";
import { getNotifications, clearNotifications } from "../background.js";

export async function notificationRoutes(app: FastifyInstance) {
  // GET /api/notifications?userId=xxx — Get pending notifications
  app.get("/", async (request) => {
    const { userId } = request.query as { userId?: string };
    const notifs = getNotifications(userId || "demo-user");
    return { notifications: notifs, count: notifs.length };
  });

  // DELETE /api/notifications?userId=xxx — Clear all notifications
  app.delete("/", async (request, reply) => {
    const { userId } = request.query as { userId?: string };
    clearNotifications(userId || "demo-user");
    return reply.code(204).send();
  });
}
