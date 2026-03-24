import cors from "@fastify/cors";
import Fastify from "fastify";
import { startBackgroundAgent } from "./background.js";
import { briefingRoutes } from "./briefing.js";
import { prisma } from "./db.js";
import { authRoutes } from "./routes/auth.js";
import { billingRoutes } from "./routes/billing.js";
import { chatRoutes } from "./routes/chat.js";
import { contactRoutes } from "./routes/contacts.js";
import { noteRoutes } from "./routes/notes.js";
import { notificationRoutes } from "./routes/notifications.js";
import { reminderRoutes } from "./routes/reminders.js";
import { taskRoutes } from "./routes/tasks.js";
import { webhookRoutes } from "./routes/webhook.js";
import { slackEventRoutes } from "./slack.js";

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

app.get("/api/health", async () => ({ status: "ok", timestamp: new Date().toISOString() }));

app.get("/api/notion/status", async () => ({
  configured: !!process.env.NOTION_API_KEY,
}));

// Activity feed — recent items across all categories
app.get("/api/activity", async (request) => {
  const { userId } = request.query as { userId?: string };
  const uid = userId || "demo-user";
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
    ...tasks.map((t) => ({
      type: "task" as const,
      title: t.title,
      status: t.status,
      createdAt: t.createdAt.toISOString(),
    })),
    ...notes.map((n) => ({
      type: "note" as const,
      title: n.title,
      status: null,
      createdAt: n.createdAt.toISOString(),
    })),
    ...reminders.map((r) => ({
      type: "reminder" as const,
      title: r.title,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    })),
    ...conversations.map((c) => ({
      type: "conversation" as const,
      title: c.title || "Chat",
      status: `${c._count.messages} msgs`,
      createdAt: c.createdAt.toISOString(),
    })),
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 20);

  return { activity };
});

app.addHook("onClose", async () => {
  await prisma.$disconnect();
});

const port = Number(process.env.PORT) || 3001;
await app.listen({ port, host: "0.0.0.0" });
console.log(`hireEVE API running on http://localhost:${port}`);

// Start autonomous background agent
startBackgroundAgent();
