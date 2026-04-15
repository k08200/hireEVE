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

type Ag = {
  id: string;
  userId: string;
  name: string;
  endpoint: string;
  apiKey?: string;
  createdAt: Date;
};
const store = new Map<string, Ag>();
let nextId = 1;

vi.mock("../db.js", () => {
  const prisma = {
    agent: {
      findMany: vi.fn(async ({ where }: { where: { userId: string } }) => {
        const r: Ag[] = [];
        for (const a of store.values()) if (a.userId === where.userId) r.push(a);
        return r;
      }),
      findUnique: vi.fn(
        async ({ where }: { where: { id: string } }) => store.get(where.id) ?? null,
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const id = `ag-${nextId++}`;
        const ag = { id, ...data, createdAt: new Date() } as Ag;
        store.set(id, ag);
        return ag;
      }),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => store.delete(where.id)),
      count: vi.fn(async () => store.size),
    },
    user: { findUnique: vi.fn(async () => ({ id: "user-1", plan: "FREE", role: "USER" })) },
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
const OTHER = signToken({ userId: "user-2", email: "o@e.com" });
const auth = (t = TOKEN) => ({ authorization: `Bearer ${t}` });

async function buildApp() {
  const { agentRoutes } = await import("../routes/agents.js");
  const app = Fastify();
  await app.register(agentRoutes, { prefix: "/api/agents" });
  return app;
}

describe("agents routes", () => {
  beforeEach(() => {
    store.clear();
    nextId = 1;
  });

  it("rejects unauthenticated with 401", async () => {
    const app = await buildApp();
    expect((await app.inject({ method: "GET", url: "/api/agents" })).statusCode).toBe(401);
    await app.close();
  });

  it("creates an agent with valid endpoint", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/agents",
      headers: auth(),
      payload: { name: "MyAgent", endpoint: "https://api.example.com/agent" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().name).toBe("MyAgent");
    await app.close();
  });

  // SSRF prevention tests
  it("rejects localhost endpoint (SSRF)", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/agents",
      headers: auth(),
      payload: { name: "Bad", endpoint: "http://localhost:8080/agent" },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("rejects private IP endpoint (SSRF)", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/agents",
      headers: auth(),
      payload: { name: "Bad", endpoint: "http://192.168.1.1/agent" },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("rejects .internal endpoint (SSRF)", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/agents",
      headers: auth(),
      payload: { name: "Bad", endpoint: "http://metadata.google.internal/v1" },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("rejects invalid URL", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/agents",
      headers: auth(),
      payload: { name: "Bad", endpoint: "not-a-url" },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("lists agents", async () => {
    const app = await buildApp();
    await app.inject({
      method: "POST",
      url: "/api/agents",
      headers: auth(),
      payload: { name: "A1", endpoint: "https://a.com" },
    });
    const res = await app.inject({ method: "GET", url: "/api/agents", headers: auth() });
    expect(res.statusCode).toBe(200);
    expect(res.json().agents).toHaveLength(1);
    await app.close();
  });

  it("gets agent by id", async () => {
    const app = await buildApp();
    const c = await app.inject({
      method: "POST",
      url: "/api/agents",
      headers: auth(),
      payload: { name: "A1", endpoint: "https://a.com" },
    });
    const res = await app.inject({
      method: "GET",
      url: `/api/agents/${c.json().id}`,
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it("returns 404 for other user's agent", async () => {
    const app = await buildApp();
    const c = await app.inject({
      method: "POST",
      url: "/api/agents",
      headers: auth(),
      payload: { name: "Mine", endpoint: "https://a.com" },
    });
    const res = await app.inject({
      method: "GET",
      url: `/api/agents/${c.json().id}`,
      headers: auth(OTHER),
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("deletes own agent", async () => {
    const app = await buildApp();
    const c = await app.inject({
      method: "POST",
      url: "/api/agents",
      headers: auth(),
      payload: { name: "Del", endpoint: "https://a.com" },
    });
    const res = await app.inject({
      method: "DELETE",
      url: `/api/agents/${c.json().id}`,
      headers: auth(),
    });
    expect(res.statusCode).toBe(204);
    await app.close();
  });
});
