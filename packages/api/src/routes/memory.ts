import type { FastifyInstance } from "fastify";
import { getUserId } from "../auth.js";
import { prisma } from "../db.js";

export async function memoryRoutes(app: FastifyInstance) {
  // GET /api/memories — List user's memories (optionally filter by type)
  app.get("/", async (request) => {
    const userId = getUserId(request);
    const { type, search } = request.query as { type?: string; search?: string };
    const where: Record<string, unknown> = { userId };
    if (type) where.type = type;
    if (search) {
      where.OR = [
        { key: { contains: search, mode: "insensitive" } },
        { content: { contains: search, mode: "insensitive" } },
      ];
    }

    const memories = await prisma.memory.findMany({
      where,
      orderBy: { updatedAt: "desc" },
    });

    return { memories };
  });

  // POST /api/memories — Create or upsert a memory
  app.post("/", async (request, reply) => {
    const userId = getUserId(request);
    const { type, key, content, source, confidence } = request.body as {
      type: string;
      key: string;
      content: string;
      source?: string;
      confidence?: number;
    };

    const memory = await prisma.memory.upsert({
      where: { userId_type_key: { userId, type, key } },
      update: { content, source, confidence: confidence ?? 1.0, updatedAt: new Date() },
      create: {
        userId,
        type: type as "PREFERENCE" | "FACT" | "DECISION" | "CONTEXT" | "FEEDBACK",
        key,
        content,
        source,
        confidence: confidence ?? 1.0,
      },
    });

    return reply.code(201).send(memory);
  });

  // DELETE /api/memories/:id
  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    await prisma.memory.delete({ where: { id } });
    return reply.code(204).send();
  });

  // GET /api/memories/stats — Memory usage stats
  app.get("/stats", async (request) => {
    const userId = getUserId(request);
    const counts = await prisma.memory.groupBy({
      by: ["type"],
      where: { userId },
      _count: true,
    });
    const total = counts.reduce((sum, c) => sum + c._count, 0);
    return { total, byType: counts };
  });
}
