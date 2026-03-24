import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";

export async function noteRoutes(app: FastifyInstance) {
  // GET /api/notes?userId=xxx&search=xxx
  app.get("/", async (request) => {
    const { userId, search } = request.query as { userId?: string; search?: string };
    const where: Record<string, unknown> = {};
    if (userId) where.userId = userId;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { content: { contains: search, mode: "insensitive" } },
      ];
    }

    const notes = await prisma.note.findMany({
      where,
      orderBy: { updatedAt: "desc" },
    });

    return { notes };
  });

  // POST /api/notes
  app.post("/", async (request, reply) => {
    const { userId, title, content } = request.body as {
      userId: string;
      title: string;
      content: string;
    };

    const note = await prisma.note.create({
      data: { userId, title, content },
    });

    return reply.code(201).send(note);
  });

  // PATCH /api/notes/:id
  app.patch("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const updates = request.body as { title?: string; content?: string };

    const note = await prisma.note.update({
      where: { id },
      data: updates,
    });

    return reply.send(note);
  });

  // DELETE /api/notes/:id
  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    await prisma.note.delete({ where: { id } });
    return reply.code(204).send();
  });
}
