import type { FastifyInstance } from "fastify";
import { getUserId } from "../auth.js";
import {
  clearNotifications,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../background.js";
import { prisma } from "../db.js";
import { getVapidPublicKey } from "../push.js";

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

  // GET /api/notifications/vapid-key — Get public VAPID key for push subscription
  app.get("/vapid-key", async () => {
    return { publicKey: getVapidPublicKey() };
  });

  // POST /api/notifications/push/subscribe — Register push subscription
  app.post("/push/subscribe", async (request, reply) => {
    const userId = getUserId(request);
    const { endpoint, keys } = request.body as {
      endpoint: string;
      keys: { p256dh: string; auth: string };
    };

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return reply.code(400).send({ error: "Invalid push subscription" });
    }

    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { userId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
      update: { userId, p256dh: keys.p256dh, auth: keys.auth },
    });

    return reply.code(201).send({ success: true });
  });

  // DELETE /api/notifications/push/unsubscribe — Remove push subscription
  app.delete("/push/unsubscribe", async (request, reply) => {
    const { endpoint } = request.body as { endpoint: string };
    if (!endpoint) {
      return reply.code(400).send({ error: "Endpoint required" });
    }

    await prisma.pushSubscription.deleteMany({ where: { endpoint } });
    return reply.code(204).send();
  });
}
