import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";

export async function agentRoutes(app: FastifyInstance) {
  // POST /api/agents — Register an agent
  app.post("/", async (request, reply) => {
    const { name, endpoint, apiKey, userId } = request.body as {
      name: string;
      endpoint: string;
      apiKey?: string;
      userId: string;
    };

    const agent = await prisma.agent.create({
      data: { name, endpoint, apiKey, userId },
    });

    return reply.code(201).send(agent);
  });

  // GET /api/agents — List agents
  app.get("/", async (request) => {
    const { userId } = request.query as { userId?: string };

    const where = userId ? { userId } : {};
    const [agents, total] = await Promise.all([
      prisma.agent.findMany({ where, orderBy: { createdAt: "desc" } }),
      prisma.agent.count({ where }),
    ]);

    return { agents, total };
  });

  // GET /api/agents/:id — Get agent details with test count
  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const agent = await prisma.agent.findUnique({
      where: { id },
      include: { _count: { select: { testRuns: true } } },
    });

    if (!agent) return reply.code(404).send({ error: "Agent not found" });
    return agent;
  });

  // DELETE /api/agents/:id
  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    await prisma.agent.delete({ where: { id } });
    return reply.code(204).send();
  });
}
