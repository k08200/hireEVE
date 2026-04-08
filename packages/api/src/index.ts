import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import type { PrismaClient } from "@prisma/client";
import Fastify from "fastify";
import { ensureDemoUser, getUserId, requireAuth } from "./auth.js";
import { startBackgroundAgent } from "./background.js";
import { briefingRoutes } from "./briefing.js";
import { db, prisma } from "./db.js";
import { adminRoutes } from "./routes/admin.js";
import { agentRoutes } from "./routes/agents.js";
import { authRoutes } from "./routes/auth.js";
import { automationRoutes } from "./routes/automations.js";
import { billingRoutes } from "./routes/billing.js";
import { calendarRoutes } from "./routes/calendar.js";
import { chatRoutes } from "./routes/chat.js";
import { contactRoutes } from "./routes/contacts.js";
import { emailRoutes } from "./routes/email.js";
import { memoryRoutes } from "./routes/memory.js";
import { noteRoutes } from "./routes/notes.js";
import { notificationRoutes } from "./routes/notifications.js";
import { reminderRoutes } from "./routes/reminders.js";
import { taskRoutes } from "./routes/tasks.js";
import { tokenUsageRoutes } from "./routes/token-usage.js";
import { webhookRoutes } from "./routes/webhook.js";
import { workspaceRoutes } from "./routes/workspace.js";
import { slackEventRoutes } from "./slack.js";
import { getClientCount, initWebSocket } from "./websocket.js";

type TxClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

const app = Fastify({ logger: true });

const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || "http://localhost:8001,http://localhost:3000")
  .split(",")
  .map((o) => o.trim());

await app.register(cors, {
  origin: (origin, cb) => {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      cb(null, true);
    } else {
      cb(new Error("Not allowed by CORS"), false);
    }
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  credentials: true,
});

// Global rate limiting — 100 requests per minute per IP
await app.register(rateLimit, {
  max: 100,
  timeWindow: "1 minute",
  allowList: (req: { url?: string }) => {
    // Auth endpoints need higher throughput (login, callback, token verify)
    return (req.url ?? "").startsWith("/api/auth/");
  },
});

// Raw body support for Stripe webhook signature verification
app.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
  try {
    const str = (body as string) || "{}";
    (req as unknown as { rawBody: string }).rawBody = str;
    done(null, JSON.parse(str));
  } catch (err) {
    done(err as Error, undefined);
  }
});

await app.register(billingRoutes, { prefix: "/api/billing" });
await app.register(webhookRoutes, { prefix: "/api/webhook" });
await app.register(chatRoutes, { prefix: "/api/chat" });
await app.register(taskRoutes, { prefix: "/api/tasks" });
await app.register(noteRoutes, { prefix: "/api/notes" });
await app.register(authRoutes, { prefix: "/api/auth" });
await app.register(reminderRoutes, { prefix: "/api/reminders" });
await app.register(contactRoutes, { prefix: "/api/contacts" });
await app.register(slackEventRoutes, { prefix: "/api/slack" });
await app.register(briefingRoutes, { prefix: "/api/briefing" });
await app.register(notificationRoutes, { prefix: "/api/notifications" });
await app.register(calendarRoutes, { prefix: "/api/calendar" });
await app.register(emailRoutes, { prefix: "/api/email" });
await app.register(workspaceRoutes, { prefix: "/api/workspaces" });
await app.register(automationRoutes, { prefix: "/api/automations" });
await app.register(adminRoutes, { prefix: "/api/admin" });
await app.register(agentRoutes, { prefix: "/api/agents" });
await app.register(memoryRoutes, { prefix: "/api/memories" });
await app.register(tokenUsageRoutes, { prefix: "/api/usage" });

app.get("/api/health", async () => ({ status: "ok", timestamp: new Date().toISOString() }));

// User data management — "me" routes require authentication
app.get("/api/user/me/export", { preHandler: requireAuth }, async (request) => {
  const userId = getUserId(request);
  const [
    tasks,
    notes,
    contacts,
    reminders,
    conversations,
    calendarEvents,
    notifications,
    automationConfig,
    agentLogs,
  ] = await Promise.all([
    prisma.task.findMany({ where: { userId } }),
    prisma.note.findMany({ where: { userId } }),
    prisma.contact.findMany({ where: { userId } }),
    prisma.reminder.findMany({ where: { userId } }),
    prisma.conversation.findMany({
      where: { userId },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    }),
    prisma.calendarEvent.findMany({ where: { userId } }),
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.automationConfig.findUnique({ where: { userId } }),
    db.agentLog.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);
  return {
    tasks,
    notes,
    contacts,
    reminders,
    conversations,
    calendarEvents,
    notifications,
    automationConfig,
    agentLogs,
    exportedAt: new Date().toISOString(),
  };
});

app.delete("/api/user/me/data", { preHandler: requireAuth }, async (request, reply) => {
  const userId = getUserId(request);
  await prisma.$transaction(async (tx: TxClient) => {
    await tx.pushSubscription.deleteMany({ where: { userId } });
    await tx.notification.deleteMany({ where: { userId } });
    await (tx as unknown as typeof db).agentLog.deleteMany({ where: { userId } });
    await tx.automationConfig.deleteMany({ where: { userId } });
    await tx.calendarEvent.deleteMany({ where: { userId } });
    await tx.userToken.deleteMany({ where: { userId } });
    await (tx as unknown as typeof db).tokenUsage.deleteMany({ where: { userId } });
    await (tx as unknown as typeof db).memory.deleteMany({ where: { userId } });
    await (tx as unknown as typeof db).conversationSummary.deleteMany({
      where: { conversation: { userId } },
    });
    await tx.message.deleteMany({ where: { conversation: { userId } } });
    await tx.conversation.deleteMany({ where: { userId } });
    await tx.task.deleteMany({ where: { userId } });
    await tx.note.deleteMany({ where: { userId } });
    await tx.contact.deleteMany({ where: { userId } });
    await tx.reminder.deleteMany({ where: { userId } });
  });
  return reply.code(204).send();
});

// User data export/delete — authenticated
app.get("/api/user/export", { preHandler: requireAuth }, async (request) => {
  const userId = getUserId(request);
  const [
    tasks,
    notes,
    contacts,
    reminders,
    conversations,
    calendarEvents,
    notifications,
    automationConfig,
    agentLogs,
  ] = await Promise.all([
    prisma.task.findMany({ where: { userId } }),
    prisma.note.findMany({ where: { userId } }),
    prisma.contact.findMany({ where: { userId } }),
    prisma.reminder.findMany({ where: { userId } }),
    prisma.conversation.findMany({
      where: { userId },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    }),
    prisma.calendarEvent.findMany({ where: { userId } }),
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.automationConfig.findUnique({ where: { userId } }),
    db.agentLog.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);
  return {
    tasks,
    notes,
    contacts,
    reminders,
    conversations,
    calendarEvents,
    notifications,
    automationConfig,
    agentLogs,
    exportedAt: new Date().toISOString(),
  };
});

app.delete("/api/user/data", { preHandler: requireAuth }, async (request, reply) => {
  const userId = getUserId(request);
  await prisma.$transaction(async (tx: TxClient) => {
    await tx.pushSubscription.deleteMany({ where: { userId } });
    await tx.notification.deleteMany({ where: { userId } });
    await (tx as unknown as typeof db).agentLog.deleteMany({ where: { userId } });
    await tx.automationConfig.deleteMany({ where: { userId } });
    await tx.calendarEvent.deleteMany({ where: { userId } });
    await tx.userToken.deleteMany({ where: { userId } });
    await (tx as unknown as typeof db).tokenUsage.deleteMany({ where: { userId } });
    await (tx as unknown as typeof db).memory.deleteMany({ where: { userId } });
    await (tx as unknown as typeof db).conversationSummary.deleteMany({
      where: { conversation: { userId } },
    });
    await tx.message.deleteMany({ where: { conversation: { userId } } });
    await tx.conversation.deleteMany({ where: { userId } });
    await tx.task.deleteMany({ where: { userId } });
    await tx.note.deleteMany({ where: { userId } });
    await tx.contact.deleteMany({ where: { userId } });
    await tx.reminder.deleteMany({ where: { userId } });
  });
  return reply.code(204).send();
});

app.get("/api/notion/status", async () => ({
  configured: !!process.env.NOTION_API_KEY,
}));

// Activity feed — recent items across all categories
app.get("/api/activity", async (request) => {
  const uid = getUserId(request);
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // last 7 days

  const [tasks, notes, reminders, conversations] = await Promise.all([
    prisma.task.findMany({
      where: { userId: uid, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.note.findMany({
      where: { userId: uid, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.reminder.findMany({
      where: { userId: uid, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.conversation.findMany({
      where: { userId: uid, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { _count: { select: { messages: true } } },
    }),
  ]);

  const activity = [
    ...tasks.map((t: { title: string; status: string; createdAt: Date }) => ({
      type: "task" as const,
      title: t.title,
      status: t.status,
      createdAt: t.createdAt.toISOString(),
    })),
    ...notes.map((n: { title: string; createdAt: Date }) => ({
      type: "note" as const,
      title: n.title,
      status: null,
      createdAt: n.createdAt.toISOString(),
    })),
    ...reminders.map((r: { title: string; status: string; createdAt: Date }) => ({
      type: "reminder" as const,
      title: r.title,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    })),
    ...conversations.map(
      (c: { title: string | null; _count: { messages: number }; createdAt: Date }) => ({
        type: "conversation" as const,
        title: c.title || "Chat",
        status: `${c._count.messages} msgs`,
        createdAt: c.createdAt.toISOString(),
      }),
    ),
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 20);

  return { activity };
});

// WebSocket status endpoint (must be before listen)
app.get("/api/ws/status", async () => ({
  connected: getClientCount(),
  connectedByUser: getClientCount("demo-user"),
}));

app.addHook("onClose", async () => {
  await prisma.$disconnect();
});

// --- Server Startup (wrapped in try-catch to prevent silent crashes) ---
try {
  // Verify database connection before proceeding
  await prisma.$queryRaw`SELECT 1`;
  console.log("[STARTUP] Database connection verified");

  // Ensure demo user exists for unauthenticated access
  await ensureDemoUser();

  const port = Number(process.env.PORT) || 3001;
  await app.listen({ port, host: "0.0.0.0" });
  console.log(`hireEVE API running on http://localhost:${port}`);

  // Attach WebSocket server to the underlying HTTP server
  const httpServer = app.server;
  initWebSocket(httpServer);

  // Start autonomous background agent
  startBackgroundAgent();

  // Start reminder notification scheduler
  import("./reminder-scheduler.js")
    .then(({ startReminderScheduler }) => {
      startReminderScheduler();
    })
    .catch((err) => {
      console.error("[REMINDER] Scheduler failed to start:", err);
    });

  // Start automation scheduler (daily briefing, email classify)
  import("./automation-scheduler.js")
    .then(({ startAutomationScheduler }) => {
      startAutomationScheduler();
    })
    .catch((err) => {
      console.error("[AUTOMATION] Scheduler failed to start:", err);
    });

  // Start autonomous LLM reasoning agent
  import("./autonomous-agent.js")
    .then(({ startAutonomousAgent }) => {
      startAutonomousAgent();
    })
    .catch((err) => {
      console.error("[AGENT] Autonomous agent failed to start:", err);
    });
} catch (err) {
  console.error("[STARTUP] Fatal error during server initialization:", err);
  // Still try to start a minimal health-check server so Render doesn't mark as crashed
  try {
    const fallbackPort = Number(process.env.PORT) || 3001;
    const fallback = Fastify();
    fallback.get("/api/health", async () => ({
      status: "error",
      message: "Server failed to start. Check logs.",
    }));
    fallback.get("*", async (_req, reply) => {
      reply.code(503).send({ error: "Service unavailable — startup failed" });
    });
    await fallback.listen({ port: fallbackPort, host: "0.0.0.0" });
    console.error(`[STARTUP] Fallback health server on port ${fallbackPort}`);
  } catch (fallbackErr) {
    console.error("[STARTUP] Even fallback server failed:", fallbackErr);
    process.exit(1);
  }
}
