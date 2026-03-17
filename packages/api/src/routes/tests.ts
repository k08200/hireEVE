import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { DEFAULT_SCENARIOS } from "../engine/scenarios.js";
import { executeTestRun } from "../engine/worker.js";

export async function testRoutes(app: FastifyInstance) {
  // POST /api/tests — Create and start a test run
  app.post("/", async (request, reply) => {
    const { agentId, userId, scenarioCount } = request.body as {
      agentId: string;
      userId: string;
      scenarioCount?: number;
    };

    const count = Math.min(scenarioCount ?? DEFAULT_SCENARIOS.length, DEFAULT_SCENARIOS.length);

    const testRun = await prisma.testRun.create({
      data: {
        agentId,
        userId,
        scenarioCount: count,
        status: "QUEUED",
      },
    });

    // Fire and forget — run in background
    executeTestRun(testRun.id).catch((err) =>
      console.error(`[engine] Background execution failed for ${testRun.id}:`, err),
    );

    return reply.code(201).send(testRun);
  });

  // GET /api/tests/:id — Get test result with evaluations
  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const testRun = await prisma.testRun.findUnique({
      where: { id },
      include: {
        evaluations: { orderBy: { createdAt: "asc" } },
        agent: { select: { name: true } },
      },
    });

    if (!testRun) return reply.code(404).send({ error: "TestRun not found" });
    return testRun;
  });

  // GET /api/tests — List test runs
  app.get("/", async (request) => {
    const { userId, agentId, status } = request.query as {
      userId?: string;
      agentId?: string;
      status?: string;
    };

    const where: Record<string, unknown> = {};
    if (userId) where.userId = userId;
    if (agentId) where.agentId = agentId;
    if (status) where.status = status;

    const [tests, total] = await Promise.all([
      prisma.testRun.findMany({
        where,
        include: { agent: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.testRun.count({ where }),
    ]);

    return { tests, total };
  });

  // PATCH /api/tests/:id — Update test run status/results
  app.patch("/:id", async (request) => {
    const { id } = request.params as { id: string };
    const data = request.body as {
      status?: "RUNNING" | "COMPLETED" | "FAILED";
      score?: number;
      passCount?: number;
      failCount?: number;
      warnCount?: number;
    };

    const updateData: Record<string, unknown> = { ...data };
    if (data.status === "RUNNING") updateData.startedAt = new Date();
    if (data.status === "COMPLETED" || data.status === "FAILED")
      updateData.completedAt = new Date();

    const testRun = await prisma.testRun.update({
      where: { id },
      data: updateData,
    });

    return testRun;
  });
}
