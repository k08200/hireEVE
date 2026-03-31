import type { FastifyInstance } from "fastify";
import { getUserId } from "../auth.js";
import {
  clearNotifications,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../background.js";

export async function notificationRoutes(app: FastifyInstance) {
  // GET /api/notifications — Get notifications (supports ?unread=true&limit=50)
  app.get("/", async (request) => {
    const userId = getUserId(request);
    const { unread, limit } = request.query as { unread?: string; limit?: string };
    const notifs = await getNotifications(userId, {
      unreadOnly: unread === "true",
      limit: limit ? Number.parseInt(limit, 10) : 50,
    });
    return {
      notifications: notifs,
      count: notifs.length,
      unread: notifs.filter((n) => !n.isRead).length,
    };
  });

  // PATCH /api/notifications/:id/read — Mark single notification as read
  app.patch("/:id/read", async (request, reply) => {
    const { id } = request.params as { id: string };
    await markNotificationRead(id);
    return reply.code(204).send();
  });

  // PATCH /api/notifications/read-all — Mark all as read
  app.patch("/read-all", async (request, reply) => {
    const userId = getUserId(request);
    await markAllNotificationsRead(userId);
    return reply.code(204).send();
  });

  // DELETE /api/notifications — Clear all notifications
  app.delete("/", async (request, reply) => {
    const userId = getUserId(request);
    await clearNotifications(userId);
    return reply.code(204).send();
  });
}
