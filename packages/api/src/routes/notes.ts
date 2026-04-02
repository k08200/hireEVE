import type { FastifyInstance } from "fastify";
import { getUserId } from "../auth.js";
import { prisma } from "../db.js";

export async function noteRoutes(app: FastifyInstance) {
  // GET /api/notes?search=xxx&category=xxx
  app.get("/", async (request) => {
    const userId = getUserId(request);
    const { search, category } = request.query as { search?: string; category?: string };
    const where: Record<string, unknown> = { userId };
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { content: { contains: search, mode: "insensitive" } },
      ];
    }
    if (category && category !== "all") {
      where.category = category;
    }

    const notes = await prisma.note.findMany({
      where,
      orderBy: { updatedAt: "desc" },
    });

    return { notes };
  });

  // POST /api/notes
  app.post("/", async (request, reply) => {
    const userId = getUserId(request);
    const { title, content, category } = request.body as {
      title: string;
      content: string;
      category?: string;
    };

    const note = await prisma.note.create({
      data: { userId, title, content, category: category || "general" },
    });

    return reply.code(201).send(note);
  });

  // PATCH /api/notes/:id
  app.patch("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const updates = request.body as { title?: string; content?: string; category?: string };

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
