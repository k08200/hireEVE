import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { signToken } from "../auth.js";

vi.mock("../email.js", () => ({ sendVerificationEmail: vi.fn(), sendPasswordResetEmail: vi.fn() }));
vi.mock("../gmail.js", () => ({
  getAuthUrl: vi.fn(),
  getLoginAuthUrl: vi.fn(),
  getAuthedClient: vi.fn(),
  getGoogleUserInfo: vi.fn(),
  getOAuth2Client: vi.fn(),
}));

vi.mock("../db.js", () => {
  const prisma = {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        if (where.id === "admin-1")
          return { id: "admin-1", email: "admin@e.com", role: "ADMIN", plan: "FREE" };
        if (where.id === "user-1")
          return { id: "user-1", email: "u@e.com", role: "USER", plan: "FREE" };
        return null;
      }),
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 2),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({
          id: where.id,
          email: "u@e.com",
          name: "User",
          role: data.role || "USER",
          plan: data.plan || "FREE",
        }),
      ),
      groupBy: vi.fn(async () => [{ plan: "FREE", _count: { id: 2 } }]),
    },
    conversation: { count: vi.fn(async () => 10) },
    message: { count: vi.fn(async () => 100), groupBy: vi.fn(async () => []) },
    notification: { deleteMany: vi.fn(async () => ({})), count: vi.fn(async () => 0) },
    agentLog: {
      count: vi.fn(async () => 0),
      findMany: vi.fn(async () => []),
    },
    pendingAction: { count: vi.fn(async () => 0) },
    tokenUsage: {
      aggregate: vi.fn(async () => ({
        _sum: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      })),
    },
    feedbackEvent: {
      groupBy: vi.fn(async ({ where }: { where: { toolName?: string | null } }) =>
        where.toolName === "briefing_top_action"
          ? [
              { signal: "APPROVED", _count: { signal: 3 } },
              { signal: "REJECTED", _count: { signal: 1 } },
            ]
          : [{ signal: "APPROVED", _count: { signal: 2 } }],
      ),
      deleteMany: vi.fn(async () => ({})),
    },
    automationConfig: { deleteMany: vi.fn(async () => ({})) },
    calendarEvent: { deleteMany: vi.fn(async () => ({})) },
    contact: { deleteMany: vi.fn(async () => ({})) },
    reminder: { deleteMany: vi.fn(async () => ({})) },
    note: { deleteMany: vi.fn(async () => ({})) },
    task: { deleteMany: vi.fn(async () => ({})) },
    commitment: { deleteMany: vi.fn(async () => ({})) },
    userToken: { deleteMany: vi.fn(async () => ({})) },
    evaluation: { deleteMany: vi.fn(async () => ({})) },
    testRun: { deleteMany: vi.fn(async () => ({})) },
    agent: { deleteMany: vi.fn(async () => ({})) },
    workspaceMember: { deleteMany: vi.fn(async () => ({})) },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
    device: {
      findUnique: vi.fn(async () => ({ id: "d1" })),
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 1),
      update: vi.fn(async () => ({})),
    },
  };
  return { prisma, db: prisma };
});

const ADMIN_TOKEN = signToken({ userId: "admin-1", email: "admin@e.com" });
const USER_TOKEN = signToken({ userId: "user-1", email: "u@e.com" });

async function buildApp() {
  const { adminRoutes } = await import("../routes/admin.js");
  const app = Fastify();
  await app.register(adminRoutes, { prefix: "/api/admin" });
  return app;
}

describe("admin routes", () => {
  it("rejects unauthenticated with 401", async () => {
    const app = await buildApp();
    expect((await app.inject({ method: "GET", url: "/api/admin/users" })).statusCode).toBe(401);
    await app.close();
  });

  it("rejects non-admin user with 403", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/users",
      headers: { authorization: `Bearer ${USER_TOKEN}` },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("allows admin to list users", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/users",
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it("allows admin to get stats", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/stats",
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty("totalUsers");
    await app.close();
  });

  it("includes trust-loop metrics in ops", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/ops",
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().trust.briefingTop3).toMatchObject({
      total: 4,
      useful: 3,
      wrong: 1,
      usefulRate: 0.75,
    });
    expect(res.json().trust.replyNeeded).toMatchObject({
      total: 2,
      useful: 2,
      usefulRate: 1,
    });
    await app.close();
  });

  it("prevents deleting admin users", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "DELETE",
      url: "/api/admin/users/admin-1",
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/admin/i);
    await app.close();
  });
});
