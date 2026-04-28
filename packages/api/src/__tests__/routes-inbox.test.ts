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

type AttentionRow = {
  id: string;
  userId: string;
  source: string;
  sourceId: string;
  status: string;
  priority: number;
  surfacedAt: Date;
};
const attentionItems: AttentionRow[] = [];

vi.mock("../db.js", () => {
  const prisma = {
    pendingAction: {
      findMany: vi.fn(
        async ({ where }: { where: { userId?: string; status?: string; id?: { in: string[] } } }) =>
          pendingActions.filter((a) => {
            if (where.userId && a.userId !== where.userId) return false;
            if (where.status && a.status !== where.status) return false;
            if (where.id?.in && !where.id.in.includes(a.id)) return false;
            return true;
          }),
      ),
    },
    attentionItem: {
      findMany: vi.fn(
        async ({
          where,
          orderBy,
          take,
        }: {
          where: { userId: string; source?: string; status?: string };
          orderBy?: Array<Record<string, "desc" | "asc">>;
          take?: number;
        }) => {
          let rows = attentionItems.filter(
            (a) =>
              a.userId === where.userId &&
              (!where.source || a.source === where.source) &&
              (!where.status || a.status === where.status),
          );
          if (orderBy) {
            rows = [...rows].sort((a, b) => {
              for (const clause of orderBy) {
                const [key, dir] = Object.entries(clause)[0] as [
                  keyof AttentionRow,
                  "desc" | "asc",
                ];
                const av = a[key];
                const bv = b[key];
                const aNum = av instanceof Date ? av.getTime() : (av as number);
                const bNum = bv instanceof Date ? bv.getTime() : (bv as number);
                if (aNum === bNum) continue;
                return dir === "desc" ? bNum - aNum : aNum - bNum;
              }
              return 0;
            });
          }
          if (typeof take === "number") rows = rows.slice(0, take);
          return rows;
        },
      ),
      upsert: vi.fn(
        async ({
          where,
          create,
          update,
        }: {
          where: { source_sourceId: { source: string; sourceId: string } };
          create: { userId: string; status: string; priority?: number };
          update: { status: string; priority?: number };
        }) => {
          const idx = attentionItems.findIndex(
            (a) =>
              a.source === where.source_sourceId.source &&
              a.sourceId === where.source_sourceId.sourceId,
          );
          if (idx >= 0) {
            attentionItems[idx] = {
              ...attentionItems[idx],
              status: update.status,
              priority: update.priority ?? attentionItems[idx].priority,
            };
            return attentionItems[idx];
          }
          const row: AttentionRow = {
            id: `ai-${attentionItems.length + 1}`,
            userId: create.userId,
            source: where.source_sourceId.source,
            sourceId: where.source_sourceId.sourceId,
            status: create.status,
            priority: create.priority ?? 50,
            surfacedAt: new Date(),
          };
          attentionItems.push(row);
          return row;
        },
      ),
    },
    task: {
      findMany: vi.fn(
        async ({
          where,
        }: {
          where: { userId?: string; status?: { not: string }; id?: { in: string[] } };
        }) =>
          tasks.filter((t) => {
            if (where.userId && t.userId !== where.userId) return false;
            if (where.status?.not && t.status === where.status.not) return false;
            if (where.id?.in && !where.id.in.includes(t.id)) return false;
            return true;
          }),
      ),
    },
    calendarEvent: {
      findMany: vi.fn(
        async ({
          where,
        }: {
          where: {
            userId?: string;
            startTime?: { gte: Date; lt: Date };
            id?: { in: string[] };
          };
        }) =>
          events.filter((e) => {
            if (where.userId && e.userId !== where.userId) return false;
            if (
              where.startTime &&
              (e.startTime < where.startTime.gte || e.startTime >= where.startTime.lt)
            )
              return false;
            if (where.id?.in && !where.id.in.includes(e.id)) return false;
            return true;
          }),
      ),
    },
    notification: {
      findMany: vi.fn(
        async ({
          where,
        }: {
          where: {
            userId?: string;
            type?: string;
            isRead?: boolean;
            pendingActionId?: null;
            id?: { in: string[] };
          };
        }) =>
          notifications.filter((n) => {
            if (where.userId && n.userId !== where.userId) return false;
            if (where.type && n.type !== where.type) return false;
            if (where.isRead !== undefined && n.isRead !== where.isRead) return false;
            if (where.pendingActionId === null && n.pendingActionId !== null) return false;
            if (where.id?.in && !where.id.in.includes(n.id)) return false;
            return true;
          }),
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
  attentionItems.length = 0;
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

  it("backfills AttentionItems for orphaned PendingActions on read", async () => {
    pendingActions.push({
      id: "pa-orphan",
      userId: "user-1",
      conversationId: "c-1",
      status: "PENDING",
      toolName: "send_email",
      toolArgs: "{}",
      reasoning: "old PA created before mirror existed",
      createdAt: new Date(),
    });
    expect(attentionItems).toHaveLength(0);

    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/inbox/summary",
      headers: auth(),
    });

    expect(res.statusCode).toBe(200);
    expect(attentionItems).toHaveLength(1);
    expect(attentionItems[0]).toMatchObject({
      source: "PENDING_ACTION",
      sourceId: "pa-orphan",
      status: "OPEN",
    });
    expect(res.json().top3[0]).toMatchObject({ kind: "pending_action", id: "pa-orphan" });
    await app.close();
  });

  it("keeps a PendingAction ahead of an URGENT overdue task on priority", async () => {
    // Without the explicit PENDING_ACTION_PRIORITY=100 in the producer, an
    // URGENT overdue task (90) would sort above a PendingAction (50). Pin the
    // canonical "pending actions never get buried" rule.
    pendingActions.push({
      id: "pa-base",
      userId: "user-1",
      conversationId: "c-1",
      status: "PENDING",
      toolName: "send_email",
      toolArgs: "{}",
      reasoning: "decide",
      createdAt: new Date(),
    });
    const oldDue = new Date();
    oldDue.setDate(oldDue.getDate() - 3);
    tasks.push({
      id: "t-urgent-overdue",
      userId: "user-1",
      title: "urgent late",
      status: "TODO",
      priority: "URGENT",
      dueDate: oldDue,
    });

    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/inbox/summary",
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.top3[0].kind).toBe("pending_action");
    expect(body.top3[1].kind).toBe("overdue_task");
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
