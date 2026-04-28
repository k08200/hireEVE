import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signToken } from "../auth.js";

vi.mock("../email.js", () => ({ sendVerificationEmail: vi.fn(), sendPasswordResetEmail: vi.fn() }));
vi.mock("../gmail.js", () => ({
  getAuthUrl: vi.fn(),
  getLoginAuthUrl: vi.fn(),
  getAuthedClient: vi.fn(),
  getGoogleUserInfo: vi.fn(),
  getOAuth2Client: vi.fn(),
}));
vi.mock("../team-risk.js", () => ({
  buildTeamRiskSummary: vi.fn(async (workspaceId: string) => ({
    generatedAt: "2026-04-28T00:00:00.000Z",
    workspaceId,
    memberCount: 1,
    highRiskCount: 1,
    mediumRiskCount: 0,
    sharedContextCount: 0,
    risks: [{ id: "u-1:ctx-1", sharedWith: 0 }],
  })),
}));

type Ws = { id: string; name: string; slug: string; plan: string; _count: { members: number } };
type WsMember = {
  id: string;
  userId: string;
  workspaceId: string;
  role: string;
  createdAt: Date;
  workspace: Ws;
  user: { id: string; name: string; email: string };
};
const wsStore = new Map<string, Ws>();
const memberStore = new Map<string, WsMember>();
let nextWsId = 1;
let nextMemberId = 1;

vi.mock("../db.js", () => {
  const prisma = {
    workspace: {
      findUnique: vi.fn(async ({ where }: { where: { slug?: string; id?: string } }) => {
        if (where.slug) {
          for (const ws of wsStore.values()) if (ws.slug === where.slug) return ws;
          return null;
        }
        return wsStore.get(where.id || "") ?? null;
      }),
      create: vi.fn(
        async ({
          data,
        }: {
          data: {
            name: string;
            slug: string;
            members: { create: { userId: string; role: string } };
          };
        }) => {
          const id = `ws-${nextWsId++}`;
          const ws: Ws = {
            id,
            name: data.name,
            slug: data.slug,
            plan: "FREE",
            _count: { members: 1 },
          };
          wsStore.set(id, ws);
          const mId = `m-${nextMemberId++}`;
          const m: WsMember = {
            id: mId,
            userId: data.members.create.userId,
            workspaceId: id,
            role: data.members.create.role,
            createdAt: new Date(),
            workspace: ws,
            user: { id: data.members.create.userId, name: "Test", email: "t@e.com" },
          };
          memberStore.set(mId, m);
          return ws;
        },
      ),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => wsStore.delete(where.id)),
    },
    workspaceMember: {
      findMany: vi.fn(async ({ where }: { where: { userId?: string; workspaceId?: string } }) => {
        const r: WsMember[] = [];
        for (const m of memberStore.values()) {
          if (where.userId && m.userId === where.userId) r.push(m);
          if (where.workspaceId && m.workspaceId === where.workspaceId) r.push(m);
        }
        return r;
      }),
      findUnique: vi.fn(
        async ({
          where,
        }: {
          where: { id?: string; userId_workspaceId?: { userId: string; workspaceId: string } };
        }) => {
          if (where.id) return memberStore.get(where.id) ?? null;
          if (where.userId_workspaceId) {
            for (const m of memberStore.values()) {
              if (
                m.userId === where.userId_workspaceId.userId &&
                m.workspaceId === where.userId_workspaceId.workspaceId
              )
                return m;
            }
          }
          return null;
        },
      ),
      create: vi.fn(
        async ({ data }: { data: { userId: string; workspaceId: string; role: string } }) => {
          const id = `m-${nextMemberId++}`;
          const ws = wsStore.get(data.workspaceId)!;
          const m: WsMember = {
            id,
            ...data,
            createdAt: new Date(),
            workspace: ws,
            user: { id: data.userId, name: "Inv", email: "inv@e.com" },
          };
          memberStore.set(id, m);
          return m;
        },
      ),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => memberStore.delete(where.id)),
    },
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id?: string; email?: string } }) => {
        if (where.email === "inv@e.com") return { id: "user-3", email: "inv@e.com", name: "Inv" };
        return { id: "user-1", plan: "FREE", role: "USER" };
      }),
    },
    device: {
      findUnique: vi.fn(async () => ({ id: "d1" })),
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 1),
      update: vi.fn(async () => ({})),
    },
  };
  return { prisma, db: prisma };
});

const TOKEN = signToken({ userId: "user-1", email: "t@e.com" });
const auth = () => ({ authorization: `Bearer ${TOKEN}` });

async function buildApp() {
  const { workspaceRoutes } = await import("../routes/workspace.js");
  const app = Fastify();
  await app.register(workspaceRoutes, { prefix: "/api/workspaces" });
  return app;
}

describe("workspace routes", () => {
  beforeEach(() => {
    wsStore.clear();
    memberStore.clear();
    nextWsId = 1;
    nextMemberId = 1;
  });

  it("rejects unauthenticated with 401", async () => {
    const app = await buildApp();
    expect((await app.inject({ method: "GET", url: "/api/workspaces" })).statusCode).toBe(401);
    await app.close();
  });

  it("creates a workspace and user becomes OWNER", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/workspaces",
      headers: auth(),
      payload: { name: "My Team" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().role).toBe("OWNER");
    expect(res.json().slug).toBe("my-team");
    await app.close();
  });

  it("rejects short workspace name", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/workspaces",
      headers: auth(),
      payload: { name: "X" },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("lists workspaces", async () => {
    const app = await buildApp();
    await app.inject({
      method: "POST",
      url: "/api/workspaces",
      headers: auth(),
      payload: { name: "Team A" },
    });
    const res = await app.inject({ method: "GET", url: "/api/workspaces", headers: auth() });
    expect(res.statusCode).toBe(200);
    expect(res.json().workspaces).toHaveLength(1);
    await app.close();
  });

  it("returns team risks for workspace members", async () => {
    const app = await buildApp();
    const c = await app.inject({
      method: "POST",
      url: "/api/workspaces",
      headers: auth(),
      payload: { name: "Risk Team" },
    });
    const res = await app.inject({
      method: "GET",
      url: `/api/workspaces/${c.json().id}/risks`,
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      workspaceId: c.json().id,
      highRiskCount: 1,
      risks: [{ id: "u-1:ctx-1" }],
    });
    await app.close();
  });

  it("rejects team risk reads for non-members", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/workspaces/ws-missing/risks",
      headers: auth(),
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("deletes workspace as owner", async () => {
    const app = await buildApp();
    const c = await app.inject({
      method: "POST",
      url: "/api/workspaces",
      headers: auth(),
      payload: { name: "Del Team" },
    });
    const res = await app.inject({
      method: "DELETE",
      url: `/api/workspaces/${c.json().id}`,
      headers: auth(),
    });
    expect(res.statusCode).toBe(204);
    await app.close();
  });
});
