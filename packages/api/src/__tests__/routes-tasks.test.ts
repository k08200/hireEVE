import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signToken } from "../auth.js";

// ── Mocks ────────────────────────────────────────────────────────

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

type StoredTask = {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
};
const taskStore = new Map<string, StoredTask>();
let nextId = 1;

// Mock the tasks service
const listTasksSpy = vi.fn(async (userId: string) => {
  const results: StoredTask[] = [];
  for (const t of taskStore.values()) {
    if (t.userId === userId) results.push(t);
  }
  return { tasks: results };
});
const createTaskSpy = vi.fn(
  async (userId: string, title: string, description?: string, priority?: string) => {
    const id = `task-${nextId++}`;
    const task: StoredTask = {
      id,
      userId,
      title,
      description: description || null,
      status: "TODO",
      priority: priority?.toUpperCase() || "MEDIUM",
    };
    taskStore.set(id, task);
    return task;
  },
);
const updateTaskSpy = vi.fn(async (taskId: string, updates: Record<string, unknown>) => {
  const task = taskStore.get(taskId);
  if (!task) throw new Error("Not found");
  const updated = { ...task, ...updates };
  taskStore.set(taskId, updated as StoredTask);
  return updated;
});
const deleteTaskSpy = vi.fn(async (taskId: string) => {
  taskStore.delete(taskId);
  return { success: true };
});

vi.mock("../tasks.js", () => ({
  listTasks: (...args: unknown[]) => listTasksSpy(...(args as [string])),
  createTask: (...args: unknown[]) =>
    createTaskSpy(...(args as [string, string, string | undefined, string | undefined])),
  updateTask: (...args: unknown[]) => updateTaskSpy(...(args as [string, Record<string, unknown>])),
  deleteTask: (...args: unknown[]) => deleteTaskSpy(...(args as [string])),
}));

vi.mock("../db.js", () => {
  const prisma = {
    task: {
      findUnique: vi.fn(
        async ({ where }: { where: { id: string } }) => taskStore.get(where.id) ?? null,
      ),
    },
    user: {
      findUnique: vi.fn(async () => ({
        id: "user-1",
        plan: "FREE",
        role: "USER",
      })),
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

// ── Helpers ──────────────────────────────────────────────────────

const TOKEN = signToken({ userId: "user-1", email: "test@example.com" });
const OTHER_TOKEN = signToken({
  userId: "user-2",
  email: "other@example.com",
});

function auth(token = TOKEN) {
  return { authorization: `Bearer ${token}` };
}

async function buildApp() {
  const { taskRoutes } = await import("../routes/tasks.js");
  const app = Fastify();
  await app.register(taskRoutes, { prefix: "/api/tasks" });
  return app;
}

function resetStores() {
  taskStore.clear();
  nextId = 1;
}

// ── Tests ────────────────────────────────────────────────────────

describe("tasks routes", () => {
  beforeEach(resetStores);

  it("rejects unauthenticated requests with 401", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/tasks" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  // GET /api/tasks
  it("lists tasks for authenticated user", async () => {
    const app = await buildApp();
    await app.inject({
      method: "POST",
      url: "/api/tasks",
      headers: auth(),
      payload: { title: "Task 1" },
    });
    const res = await app.inject({
      method: "GET",
      url: "/api/tasks",
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().tasks).toHaveLength(1);
    await app.close();
  });

  // POST /api/tasks
  it("creates a task", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/tasks",
      headers: auth(),
      payload: { title: "New Task", description: "Details", priority: "HIGH" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().title).toBe("New Task");
    await app.close();
  });

  // PATCH /api/tasks/:id
  it("updates own task", async () => {
    const app = await buildApp();
    const create = await app.inject({
      method: "POST",
      url: "/api/tasks",
      headers: auth(),
      payload: { title: "Old" },
    });
    const id = create.json().id;

    const res = await app.inject({
      method: "PATCH",
      url: `/api/tasks/${id}`,
      headers: auth(),
      payload: { title: "Updated" },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it("returns 404 for non-existent task", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "PATCH",
      url: "/api/tasks/non-existent",
      headers: auth(),
      payload: { title: "X" },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("returns 403 when updating another user's task", async () => {
    const app = await buildApp();
    const create = await app.inject({
      method: "POST",
      url: "/api/tasks",
      headers: auth(),
      payload: { title: "Mine" },
    });
    const id = create.json().id;

    const res = await app.inject({
      method: "PATCH",
      url: `/api/tasks/${id}`,
      headers: auth(OTHER_TOKEN),
      payload: { title: "Hijack" },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  // DELETE /api/tasks/:id
  it("deletes own task", async () => {
    const app = await buildApp();
    const create = await app.inject({
      method: "POST",
      url: "/api/tasks",
      headers: auth(),
      payload: { title: "Del" },
    });
    const id = create.json().id;

    const res = await app.inject({
      method: "DELETE",
      url: `/api/tasks/${id}`,
      headers: auth(),
    });
    expect(res.statusCode).toBe(204);
    await app.close();
  });

  it("returns 403 when deleting another user's task", async () => {
    const app = await buildApp();
    const create = await app.inject({
      method: "POST",
      url: "/api/tasks",
      headers: auth(),
      payload: { title: "Mine" },
    });
    const id = create.json().id;

    const res = await app.inject({
      method: "DELETE",
      url: `/api/tasks/${id}`,
      headers: auth(OTHER_TOKEN),
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});
