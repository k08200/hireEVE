import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../engine/scenarios.js", () => ({
  DEFAULT_SCENARIOS: [{ id: "s1" }, { id: "s2" }, { id: "s3" }],
}));
vi.mock("../engine/worker.js", () => ({
  executeTestRun: vi.fn(async () => {}),
}));

type TestRun = {
  id: string;
  agentId: string;
  userId: string;
  scenarioCount: number;
  status: string;
  [k: string]: unknown;
};
const store = new Map<string, TestRun>();
let nextId = 1;

vi.mock("../db.js", () => {
  const prisma = {
    testRun: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const id = `tr-${nextId++}`;
        const tr = { id, ...data } as TestRun;
        store.set(id, tr);
        return tr;
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const tr = store.get(where.id);
        if (!tr) return null;
        return { ...tr, evaluations: [], agent: { name: "TestAgent" } };
      }),
      findMany: vi.fn(async () =>
        [...store.values()].map((tr) => ({ ...tr, agent: { name: "TestAgent" } })),
      ),
      count: vi.fn(async () => store.size),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const tr = store.get(where.id);
          if (!tr) throw new Error("Not found");
          const u = { ...tr, ...data };
          store.set(where.id, u as TestRun);
          return u;
        },
      ),
    },
  };
  return { prisma, db: prisma };
});

async function buildApp() {
  const { testRoutes } = await import("../routes/tests.js");
  const app = Fastify();
  await app.register(testRoutes, { prefix: "/api/tests" });
  return app;
}

describe("test routes", () => {
  beforeEach(() => {
    store.clear();
    nextId = 1;
  });

  it("creates a test run", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/tests",
      payload: { agentId: "ag-1", userId: "user-1" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().status).toBe("QUEUED");
    expect(res.json().scenarioCount).toBe(3);
    await app.close();
  });

  it("gets test run by id", async () => {
    const app = await buildApp();
    const c = await app.inject({
      method: "POST",
      url: "/api/tests",
      payload: { agentId: "ag-1", userId: "user-1" },
    });
    const res = await app.inject({ method: "GET", url: `/api/tests/${c.json().id}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().agent.name).toBe("TestAgent");
    await app.close();
  });

  it("returns 404 for non-existent test run", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/tests/non-existent" });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("lists test runs", async () => {
    const app = await buildApp();
    await app.inject({
      method: "POST",
      url: "/api/tests",
      payload: { agentId: "ag-1", userId: "user-1" },
    });
    const res = await app.inject({ method: "GET", url: "/api/tests" });
    expect(res.statusCode).toBe(200);
    expect(res.json().tests).toHaveLength(1);
    await app.close();
  });

  it("updates test run status", async () => {
    const app = await buildApp();
    const c = await app.inject({
      method: "POST",
      url: "/api/tests",
      payload: { agentId: "ag-1", userId: "user-1" },
    });
    const res = await app.inject({
      method: "PATCH",
      url: `/api/tests/${c.json().id}`,
      payload: { status: "RUNNING" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("RUNNING");
    await app.close();
  });
});
