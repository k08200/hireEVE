import cors from "@fastify/cors";
import Fastify from "fastify";
import { ensureDemoUser, getUserId } from "./auth.js";
import { startBackgroundAgent } from "./background.js";
import { briefingRoutes } from "./briefing.js";
import { prisma } from "./db.js";
import { authRoutes } from "./routes/auth.js";
import { billingRoutes } from "./routes/billing.js";
import { calendarRoutes } from "./routes/calendar.js";
import { chatRoutes } from "./routes/chat.js";
import { contactRoutes } from "./routes/contacts.js";
import { emailRoutes } from "./routes/email.js";
import { noteRoutes } from "./routes/notes.js";
import { notificationRoutes } from "./routes/notifications.js";
import { reminderRoutes } from "./routes/reminders.js";
import { taskRoutes } from "./routes/tasks.js";
import { webhookRoutes } from "./routes/webhook.js";
import { slackEventRoutes } from "./slack.js";
import { getClientCount, initWebSocket } from "./websocket.js";

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
});

// Raw body support for Stripe webhook signature verification
app.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
  try {
    (req as unknown as { rawBody: string }).rawBody = body as string;
    done(null, JSON.parse(body as string));
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

app.get("/api/health", async () => ({ status: "ok", timestamp: new Date().toISOString() }));

// User data management — "me" routes use auth token
app.get("/api/user/me/export", async (request) => {
  const userId = getUserId(request);
  const [tasks, notes, contacts, reminders, conversations] = await Promise.all([
    prisma.task.findMany({ where: { userId } }),
    prisma.note.findMany({ where: { userId } }),
    prisma.contact.findMany({ where: { userId } }),
    prisma.reminder.findMany({ where: { userId } }),
    prisma.conversation.findMany({
      where: { userId },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    }),
  ]);
  return { tasks, notes, contacts, reminders, conversations, exportedAt: new Date().toISOString() };
});

app.delete("/api/user/me/data", async (request, reply) => {
  const userId = getUserId(request);
  await prisma.$transaction([
    prisma.message.deleteMany({ where: { conversation: { userId } } }),
    prisma.conversation.deleteMany({ where: { userId } }),
    prisma.task.deleteMany({ where: { userId } }),
    prisma.note.deleteMany({ where: { userId } }),
    prisma.contact.deleteMany({ where: { userId } }),
    prisma.reminder.deleteMany({ where: { userId } }),
  ]);
  return reply.code(204).send();
});

// Legacy user data routes (kept for backwards compat)
app.get("/api/user/:userId/export", async (request) => {
  const { userId } = request.params as { userId: string };
  const [tasks, notes, contacts, reminders, conversations] = await Promise.all([
    prisma.task.findMany({ where: { userId } }),
    prisma.note.findMany({ where: { userId } }),
    prisma.contact.findMany({ where: { userId } }),
    prisma.reminder.findMany({ where: { userId } }),
    prisma.conversation.findMany({
      where: { userId },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    }),
  ]);
  return { tasks, notes, contacts, reminders, conversations, exportedAt: new Date().toISOString() };
});

app.delete("/api/user/:userId/data", async (request, reply) => {
  const { userId } = request.params as { userId: string };
  await prisma.$transaction([
    prisma.message.deleteMany({ where: { conversation: { userId } } }),
    prisma.conversation.deleteMany({ where: { userId } }),
    prisma.task.deleteMany({ where: { userId } }),
    prisma.note.deleteMany({ where: { userId } }),
    prisma.contact.deleteMany({ where: { userId } }),
    prisma.reminder.deleteMany({ where: { userId } }),
  ]);
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

// Start meeting monitor (auto-joins meetings 1 min before start)
import("./meeting.js")
  .then(({ startMeetingMonitor }) => {
    startMeetingMonitor("demo-user");
  })
  .catch(() => {
    console.log("[MEETING] Meeting monitor disabled (missing dependencies)");
  });
