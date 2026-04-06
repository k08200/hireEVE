import type { FastifyInstance } from "fastify";
import { getUserId } from "../auth.js";
import { prisma } from "../db.js";

// Per-route rate limit config
const rateLimitConfig = { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } };

export async function memoryRoutes(app: FastifyInstance) {
  // GET /api/memories — List user's memories (optionally filter by type)
  app.get("/", rateLimitConfig, async (request) => {
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

    const memories = await (prisma as any).memory.findMany({
      where,
      orderBy: { updatedAt: "desc" },
    });

    return { memories };
  });

  // POST /api/memories — Create or upsert a memory
  app.post("/", rateLimitConfig, async (request, reply) => {
    const userId = getUserId(request);
    const { type, key, content, source, confidence } = request.body as {
      type: string;
      key: string;
      content: string;
      source?: string;
      confidence?: number;
    };

    const memory = await (prisma as any).memory.upsert({
      where: { userId_type_key: { userId, type, key } },
      update: { content, source, confidence: confidence ?? 1.0, updatedAt: new Date() },
      create: {
        userId,
        type,
        key,
        content,
        source,
        confidence: confidence ?? 1.0,
      },
    });

    return reply.code(201).send(memory);
  });

  // DELETE /api/memories/:id
  app.delete("/:id", rateLimitConfig, async (request, reply) => {
    const userId = getUserId(request);
    const { id } = request.params as { id: string };
    const memory = await (prisma as any).memory.findUnique({ where: { id } });
    if (!memory) return reply.code(404).send({ error: "Memory not found" });
    if (memory.userId !== userId) return reply.code(403).send({ error: "Forbidden" });
    await (prisma as any).memory.delete({ where: { id } });
    return reply.code(204).send();
  });

  // GET /api/memories/stats — Memory usage stats
  app.get("/stats", rateLimitConfig, async (request) => {
    const userId = getUserId(request);
    const counts: { type: string; _count: number }[] = await (prisma as any).memory.groupBy({
      by: ["type"],
      where: { userId },
      _count: true,
    });
    const total = counts.reduce((sum: number, c: { _count: number }) => sum + c._count, 0);
    return { total, byType: counts };
  });
}
