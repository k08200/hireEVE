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

type Skill = { key: string; content: string; updatedAt: string };
const store = new Map<string, Skill>();

vi.mock("../memory.js", () => ({
  remember: vi.fn(async (_userId: string, _type: string, key: string, content: string) => {
    store.set(key, { key, content, updatedAt: new Date().toISOString() });
    return JSON.stringify({ success: true, id: key, message: `Remembered: ${key}` });
  }),
  recall: vi.fn(async (_userId: string, query?: string, _type?: string) => {
    const memories: { type: string; key: string; content: string; updatedAt: string }[] = [];
    for (const s of store.values()) {
      if (!query || s.key.includes(query)) {
        memories.push({ type: "SKILL", key: s.key, content: s.content, updatedAt: s.updatedAt });
      }
    }
    if (memories.length === 0)
      return JSON.stringify({ memories: [], message: "No memories found" });
    return JSON.stringify({ memories });
  }),
  forget: vi.fn(async (_userId: string, key: string) => {
    if (store.has(key)) {
      store.delete(key);
      return JSON.stringify({ success: true, message: `Forgot: ${key}` });
    }
    return JSON.stringify({ success: false, message: `Memory not found: ${key}` });
  }),
  MEMORY_TOOLS: [],
}));

vi.mock("../db.js", () => {
  const prisma = {
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
const auth = () => ({ authorization: `Bearer ${TOKEN}` });

async function buildApp() {
  const { skillRoutes } = await import("../routes/skills.js");
  const app = Fastify();
  await app.register(skillRoutes, { prefix: "/api/skills" });
  return app;
}

describe("skills routes", () => {
  beforeEach(() => {
    store.clear();
  });

  it("rejects unauthenticated with 401", async () => {
    const app = await buildApp();
    expect((await app.inject({ method: "GET", url: "/api/skills" })).statusCode).toBe(401);
    await app.close();
  });

  it("creates and lists a skill", async () => {
    const app = await buildApp();
    const create = await app.inject({
      method: "POST",
      url: "/api/skills",
      headers: auth(),
      payload: {
        name: "Weekly Report",
        description: "Generate weekly summary",
        prompt: "Summarize this week's tasks and meetings",
      },
    });
    expect(create.statusCode).toBe(201);
    expect(create.json().name).toBe("Weekly Report");

    const list = await app.inject({ method: "GET", url: "/api/skills", headers: auth() });
    expect(list.json().skills).toHaveLength(1);
    await app.close();
  });

  it("rejects skill without name or prompt", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/skills",
      headers: auth(),
      payload: { name: "No Prompt" },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("deletes a skill", async () => {
    const app = await buildApp();
    const create = await app.inject({
      method: "POST",
      url: "/api/skills",
      headers: auth(),
      payload: { name: "Temp", prompt: "temp prompt" },
    });
    const res = await app.inject({
      method: "DELETE",
      url: `/api/skills/${create.json().id}`,
      headers: auth(),
    });
    expect(res.statusCode).toBe(204);
    await app.close();
  });

  it("executes a skill with variable substitution", async () => {
    const app = await buildApp();
    await app.inject({
      method: "POST",
      url: "/api/skills",
      headers: auth(),
      payload: { name: "Greet", prompt: "Say hello to {{name}}" },
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/skills/skill_greet/execute",
      headers: auth(),
      payload: { variables: { name: "Alice" } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().prompt).toBe("Say hello to Alice");
    await app.close();
  });
});
