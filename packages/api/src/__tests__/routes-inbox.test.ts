import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signToken } from "../auth.js";

vi.mock("../email.js", () => ({
  sendVerificationEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}));
vi.mock("../gmail.js", () => ({
  getAuthUrl: vi.fn(),
  getLoginAuthUrl: vi.fn(),
  getAuthedClient: vi.fn(),
  getGoogleUserInfo: vi.fn(),
  getOAuth2Client: vi.fn(),
}));
vi.mock("../action-target.js", () => ({
  resolveActionTarget: vi.fn(async () => null),
}));

const pendingActions: Array<{
  id: string;
  userId: string;
  conversationId: string;
  status: string;
  toolName: string;
  toolArgs: string;
  reasoning: string | null;
  createdAt: Date;
}> = [];
const tasks: Array<{
  id: string;
  userId: string;
  title: string;
  status: string;
  priority: string;
  dueDate: Date | null;
}> = [];
const events: Array<{
  id: string;
  userId: string;
  title: string;
  startTime: Date;
  endTime: Date;
  location: string | null;
}> = [];
const notifications: Array<{
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  link: string | null;
  conversationId: string | null;
  pendingActionId: string | null;
  createdAt: Date;
}> = [];

vi.mock("../db.js", () => {
  const prisma = {
    pendingAction: {
      findMany: vi.fn(async ({ where }: { where: { userId: string; status?: string } }) =>
        pendingActions.filter(
          (a) => a.userId === where.userId && (!where.status || a.status === where.status),
        ),
      ),
    },
    task: {
      findMany: vi.fn(async ({ where }: { where: { userId: string; status?: { not: string } } }) =>
        tasks.filter(
          (t) => t.userId === where.userId && (!where.status?.not || t.status !== where.status.not),
        ),
      ),
    },
    calendarEvent: {
      findMany: vi.fn(
        async ({ where }: { where: { userId: string; startTime: { gte: Date; lt: Date } } }) =>
          events.filter(
            (e) =>
              e.userId === where.userId &&
              e.startTime >= where.startTime.gte &&
              e.startTime < where.startTime.lt,
          ),
      ),
    },
    notification: {
      findMany: vi.fn(
        async ({
          where,
        }: {
          where: {
            userId: string;
            type?: string;
            isRead?: boolean;
            pendingActionId?: null;
          };
        }) =>
          notifications.filter(
            (n) =>
              n.userId === where.userId &&
              (!where.type || n.type === where.type) &&
              (where.isRead === undefined || n.isRead === where.isRead) &&
              (where.pendingActionId !== null || n.pendingActionId === null),
          ),
      ),
    },
    user: {
      findUnique: vi.fn(async () => ({ id: "user-1", plan: "FREE", role: "USER" })),
    },
    device: {
      findUnique: vi.fn(async () => ({ id: "device-1" })),
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 1),
      update: vi.fn(async () => ({})),
    },
  };
  return { prisma, db: prisma };
});

const TOKEN = signToken({ userId: "user-1", email: "test@example.com" });

function auth() {
  return { authorization: `Bearer ${TOKEN}` };
}

async function buildApp() {
  const { inboxRoutes } = await import("../routes/inbox.js");
  const app = Fastify();
  await app.register(inboxRoutes, { prefix: "/api/inbox" });
  return app;
}

function resetStores() {
  pendingActions.length = 0;
  tasks.length = 0;
  events.length = 0;
  notifications.length = 0;
}

describe("inbox routes", () => {
  beforeEach(resetStores);

  it("rejects unauthenticated requests with 401", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/inbox/summary" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("returns empty summary when no signals exist", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/inbox/summary",
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      top3: [],
      today: { events: [], overdueTasks: [], todayTasks: [] },
    });
    await app.close();
  });

  it("ranks pending actions ahead of overdue tasks", async () => {
    pendingActions.push({
      id: "pa-1",
      userId: "user-1",
      conversationId: "c-1",
      status: "PENDING",
      toolName: "send_email",
      toolArgs: "{}",
      reasoning: "needs decision",
      createdAt: new Date(),
    });
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(9, 0, 0, 0);
    tasks.push({
      id: "t-1",
      userId: "user-1",
      title: "Late task",
      status: "TODO",
      priority: "HIGH",
      dueDate: yesterday,
    });

    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/inbox/summary",
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.top3[0]).toMatchObject({ kind: "pending_action", id: "pa-1" });
    expect(body.top3[1]).toMatchObject({ kind: "overdue_task", id: "t-1" });
    await app.close();
  });

  it("scopes signals to the requesting user only", async () => {
    pendingActions.push({
      id: "pa-other",
      userId: "user-2",
      conversationId: "c-2",
      status: "PENDING",
      toolName: "send_email",
      toolArgs: "{}",
      reasoning: null,
      createdAt: new Date(),
    });

    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/inbox/summary",
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().top3).toEqual([]);
    await app.close();
  });
});
