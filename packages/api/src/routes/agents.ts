import type { FastifyInstance } from "fastify";
import { getUserId } from "../auth.js";
import { prisma } from "../db.js";

export async function agentRoutes(app: FastifyInstance) {
  // POST /api/agents — Register an agent
  app.post("/", async (request, reply) => {
    const userId = getUserId(request);
    const { name, endpoint, apiKey } = request.body as {
      name: string;
      endpoint: string;
      apiKey?: string;
    };

    const agent = await prisma.agent.create({
      data: { name, endpoint, apiKey, userId },
    });

    return reply.code(201).send(agent);
  });

  // GET /api/agents — List agents for authenticated user
  app.get("/", async (request) => {
    const userId = getUserId(request);

    const [agents, total] = await Promise.all([
      prisma.agent.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
      }),
      prisma.agent.count({ where: { userId } }),
    ]);

    return { agents, total };
  });

  // GET /api/agents/:id — Get agent details
  app.get("/:id", async (request, reply) => {
    const userId = getUserId(request);
    const { id } = request.params as { id: string };

    const agent = await prisma.agent.findUnique({
      where: { id },
      include: { _count: { select: { testRuns: true } } },
    });

    if (!agent || agent.userId !== userId) {
      return reply.code(404).send({ error: "Agent not found" });
    }
    return agent;
  });

  // DELETE /api/agents/:id
  app.delete("/:id", async (request, reply) => {
    const userId = getUserId(request);
    const { id } = request.params as { id: string };

    const agent = await prisma.agent.findUnique({ where: { id } });
    if (!agent || agent.userId !== userId) {
      return reply.code(404).send({ error: "Agent not found" });
    }

    await prisma.agent.delete({ where: { id } });
    return reply.code(204).send();
  });
}
