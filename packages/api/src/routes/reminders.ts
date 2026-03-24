import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";

export async function reminderRoutes(app: FastifyInstance) {
  app.get("/", async (request) => {
    const { userId } = request.query as { userId?: string };
    const reminders = await prisma.reminder.findMany({
      where: userId ? { userId } : {},
      orderBy: { remindAt: "asc" },
    });
    return { reminders };
  });

  app.post("/", async (request, reply) => {
    const { userId, title, remindAt, description } = request.body as {
      userId: string;
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
    const { id } = request.params as { id: string };
    const { status } = request.body as { status: string };
    const reminder = await prisma.reminder.update({ where: { id }, data: { status: status as "PENDING" | "SENT" | "DISMISSED" } });
    return reply.send(reminder);
  });

  app.patch("/:id/dismiss", async (request, reply) => {
    const { id } = request.params as { id: string };
    const reminder = await prisma.reminder.update({ where: { id }, data: { status: "DISMISSED" } });
    return reply.send(reminder);
  });

  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    await prisma.reminder.delete({ where: { id } });
    return reply.code(204).send();
  });
}
