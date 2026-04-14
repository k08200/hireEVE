import type { FastifyInstance } from "fastify";
import { getUserId, requireAuth } from "../auth.js";
import { runAgentForUser } from "../autonomous-agent.js";
import { db, prisma } from "../db.js";

// MEDIUM-risk tools that users may pre-approve for AUTO mode.
// HIGH-risk tools (delete_*, archive_email) are intentionally excluded — they
// always require per-action approval.
const PRE_APPROVABLE_TOOLS = new Set([
  "send_email",
  "create_event",
  "create_note",
  "update_contact",
  "create_contact",
]);

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
      alwaysAllowedTools: (configAny.alwaysAllowedTools as string[]) ?? [],
      preApprovableTools: Array.from(PRE_APPROVABLE_TOOLS),
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
      "alwaysAllowedTools",
    ];
    const data: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) data[key] = body[key];
    }

    // Validate agentMode
    if (data.agentMode && !["SUGGEST", "AUTO"].includes(data.agentMode as string)) {
      data.agentMode = "SUGGEST";
    }

    // Validate alwaysAllowedTools — only MEDIUM-risk tools from the whitelist
    // are permitted. Drop unknown or HIGH-risk tool names silently.
    if ("alwaysAllowedTools" in data) {
      const raw = data.alwaysAllowedTools;
      const list = Array.isArray(raw)
        ? raw.filter((t): t is string => typeof t === "string" && PRE_APPROVABLE_TOOLS.has(t))
        : [];
      data.alwaysAllowedTools = Array.from(new Set(list));
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
      alwaysAllowedTools: (configAny.alwaysAllowedTools as string[]) ?? [],
      preApprovableTools: Array.from(PRE_APPROVABLE_TOOLS),
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
