import type { FastifyInstance } from "fastify";
import { getUserId, requireAuth } from "../auth.js";
import { runAgentForUser } from "../autonomous-agent.js";
import { db, prisma } from "../db.js";

export async function automationRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  // GET /api/automations — Get user's automation config
  app.get("/", async (request) => {
    const userId = getUserId(request);

    let config = await prisma.automationConfig.findUnique({ where: { userId } });

    // Create default config if none exists
    if (!config) {
      config = await prisma.automationConfig.create({ data: { userId } });
    }

    const configAny = config as Record<string, unknown>;
    return {
      meetingAutoJoin: config.meetingAutoJoin,
      meetingAutoSummarize: config.meetingAutoSummarize,
      emailAutoClassify: config.emailAutoClassify,
      reminderAutoCheck: config.reminderAutoCheck,
      dailyBriefing: config.dailyBriefing,
      briefingTime: config.briefingTime,
      downloadAutoOrganize: config.downloadAutoOrganize,
      autonomousAgent: configAny.autonomousAgent ?? true,
      agentMode: configAny.agentMode ?? "AUTO",
      agentIntervalMin: configAny.agentIntervalMin ?? 5,
    };
  });

  // PATCH /api/automations — Update automation config
  app.patch("/", async (request) => {
    const userId = getUserId(request);
    const body = request.body as Record<string, unknown>;

    // Only allow known fields
    const allowed = [
      "meetingAutoJoin",
      "meetingAutoSummarize",
      "emailAutoClassify",
      "reminderAutoCheck",
      "dailyBriefing",
      "briefingTime",
      "downloadAutoOrganize",
      "autonomousAgent",
      "agentMode",
      "agentIntervalMin",
    ];
    const data: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) data[key] = body[key];
    }

    // Validate agentMode
    if (data.agentMode && !["SUGGEST", "AUTO"].includes(data.agentMode as string)) {
      data.agentMode = "SUGGEST";
    }

    const config = await prisma.automationConfig.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });

    const configAny = config as Record<string, unknown>;
    return {
      meetingAutoJoin: config.meetingAutoJoin,
      meetingAutoSummarize: config.meetingAutoSummarize,
      emailAutoClassify: config.emailAutoClassify,
      reminderAutoCheck: config.reminderAutoCheck,
      dailyBriefing: config.dailyBriefing,
      briefingTime: config.briefingTime,
      downloadAutoOrganize: config.downloadAutoOrganize,
      autonomousAgent: configAny.autonomousAgent ?? true,
      agentMode: configAny.agentMode ?? "AUTO",
      agentIntervalMin: configAny.agentIntervalMin ?? 5,
    };
  });

  // POST /api/automations/run-now — Manually trigger agent for current user
  app.post("/run-now", async (request) => {
    const userId = getUserId(request);
    if (userId === "demo-user") {
      return { error: "Agent not available for demo user" };
    }

    const config = await prisma.automationConfig.findUnique({ where: { userId } });
    const mode = ((config as Record<string, unknown>)?.agentMode as string) || "AUTO";

    // Run in background so the response returns immediately
    runAgentForUser(userId, mode).catch((err) => {
      console.error(`[AGENT] Manual run failed for ${userId}:`, err);
    });

    return { triggered: true, mode };
  });

  // GET /api/automations/agent-logs — Get autonomous agent activity logs
  app.get("/agent-logs", async (request) => {
    const userId = getUserId(request);
    const { limit, offset } = (request.query || {}) as { limit?: string; offset?: string };

    const logs = await db.agentLog.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: Math.min(Number(limit) || 50, 100),
      skip: Number(offset) || 0,
    });

    return { logs };
  });
}
