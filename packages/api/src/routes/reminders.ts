import type { FastifyInstance } from "fastify";
import { getUserId } from "../auth.js";
import { prisma } from "../db.js";

export async function reminderRoutes(app: FastifyInstance) {
  app.get("/", async (request) => {
    const userId = getUserId(request);
    const reminders = await prisma.reminder.findMany({
      where: { userId },
      orderBy: { remindAt: "asc" },
    });
    return { reminders };
  });

  app.post("/", async (request, reply) => {
    const userId = getUserId(request);
    const { title, remindAt, description } = request.body as {
      title: string;
      remindAt: string;
      description?: string;
    };
    const reminder = await prisma.reminder.create({
      data: { userId, title, remindAt: new Date(remindAt), description: description || null },
    });
    return reply.code(201).send(reminder);
  });

  app.patch("/:id", async (request, reply) => {
    const userId = getUserId(request);
    const { id } = request.params as { id: string };
    const existing = await prisma.reminder.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "Reminder not found" });
    if (existing.userId !== userId) return reply.code(403).send({ error: "Forbidden" });

    const { status } = request.body as { status: string };
    const reminder = await prisma.reminder.update({
      where: { id },
      data: { status: status as "PENDING" | "SENT" | "DISMISSED" },
    });
    return reply.send(reminder);
  });

  app.patch("/:id/dismiss", async (request, reply) => {
    const userId = getUserId(request);
    const { id } = request.params as { id: string };
    const existing = await prisma.reminder.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "Reminder not found" });
    if (existing.userId !== userId) return reply.code(403).send({ error: "Forbidden" });

    const reminder = await prisma.reminder.update({ where: { id }, data: { status: "DISMISSED" } });
    return reply.send(reminder);
  });

  app.patch("/:id/snooze", async (request, reply) => {
    const userId = getUserId(request);
    const { id } = request.params as { id: string };
    const existing = await prisma.reminder.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "Reminder not found" });
    if (existing.userId !== userId) return reply.code(403).send({ error: "Forbidden" });

    const { minutes } = request.body as { minutes: number };
    const newTime = new Date(Date.now() + minutes * 60 * 1000);
    const reminder = await prisma.reminder.update({
      where: { id },
      data: { remindAt: newTime, status: "PENDING" },
    });
    return reply.send(reminder);
  });

  // Bulk delete
  app.post("/bulk-delete", async (request, reply) => {
    const userId = getUserId(request);
    const { ids } = request.body as { ids?: string[] };

    if (ids && ids.length > 0) {
      // Delete selected reminders
      await prisma.reminder.deleteMany({
        where: { id: { in: ids }, userId },
      });
    } else {
      // Delete all reminders for user
      await prisma.reminder.deleteMany({ where: { userId } });
    }

    return reply.code(204).send();
  });

  app.delete("/:id", async (request, reply) => {
    const userId = getUserId(request);
    const { id } = request.params as { id: string };
    const existing = await prisma.reminder.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "Reminder not found" });
    if (existing.userId !== userId) return reply.code(403).send({ error: "Forbidden" });

    await prisma.reminder.delete({ where: { id } });
    return reply.code(204).send();
  });
}
