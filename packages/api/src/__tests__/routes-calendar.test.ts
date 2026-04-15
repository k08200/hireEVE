import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signToken } from "../auth.js";

vi.mock("../email.js", () => ({ sendVerificationEmail: vi.fn(), sendPasswordResetEmail: vi.fn() }));
vi.mock("../gmail.js", () => ({
  getAuthUrl: vi.fn(),
  getLoginAuthUrl: vi.fn(),
  getAuthedClient: vi.fn(async () => null),
  getGoogleUserInfo: vi.fn(),
  getOAuth2Client: vi.fn(),
}));
vi.mock("../calendar.js", () => ({
  createEvent: vi.fn(async () => ({ eventId: null })),
  deleteEvent: vi.fn(async () => {}),
}));

type Ev = {
  id: string;
  userId: string;
  title: string;
  startTime: Date;
  endTime: Date;
  googleId: string | null;
  [k: string]: unknown;
};
const store = new Map<string, Ev>();
let nextId = 1;

vi.mock("../db.js", () => {
  const prisma = {
    calendarEvent: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const r: Ev[] = [];
        for (const e of store.values()) if (e.userId === where.userId) r.push(e);
        return r;
      }),
      findUnique: vi.fn(
        async ({ where }: { where: { id: string } }) => store.get(where.id) ?? null,
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const id = `ev-${nextId++}`;
        const ev = { id, ...data } as Ev;
        store.set(id, ev);
        return ev;
      }),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const ev = store.get(where.id);
          if (!ev) throw new Error("Not found");
          const u = { ...ev, ...data };
          store.set(where.id, u as Ev);
          return u;
        },
      ),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => store.delete(where.id)),
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
  const { calendarRoutes } = await import("../routes/calendar.js");
  const app = Fastify();
  await app.register(calendarRoutes, { prefix: "/api/calendar" });
  return app;
}

describe("calendar routes", () => {
  beforeEach(() => {
    store.clear();
    nextId = 1;
  });

  it("rejects unauthenticated with 401", async () => {
    const app = await buildApp();
    expect((await app.inject({ method: "GET", url: "/api/calendar" })).statusCode).toBe(401);
    await app.close();
  });

  it("creates and lists events", async () => {
    const app = await buildApp();
    const c = await app.inject({
      method: "POST",
      url: "/api/calendar",
      headers: auth(),
      payload: {
        title: "Meeting",
        startTime: new Date().toISOString(),
        endTime: new Date(Date.now() + 3600_000).toISOString(),
      },
    });
    expect(c.statusCode).toBe(200);
    expect(c.json().title).toBe("Meeting");

    const list = await app.inject({ method: "GET", url: "/api/calendar", headers: auth() });
    expect(list.json().events).toHaveLength(1);
    await app.close();
  });

  it("gets single event", async () => {
    const app = await buildApp();
    const c = await app.inject({
      method: "POST",
      url: "/api/calendar",
      headers: auth(),
      payload: {
        title: "Ev",
        startTime: new Date().toISOString(),
        endTime: new Date(Date.now() + 3600_000).toISOString(),
      },
    });
    const res = await app.inject({
      method: "GET",
      url: `/api/calendar/${c.json().id}`,
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it("returns 403 for other user's event", async () => {
    const app = await buildApp();
    const c = await app.inject({
      method: "POST",
      url: "/api/calendar",
      headers: auth(),
      payload: {
        title: "Mine",
        startTime: new Date().toISOString(),
        endTime: new Date(Date.now() + 3600_000).toISOString(),
      },
    });
    const res = await app.inject({
      method: "GET",
      url: `/api/calendar/${c.json().id}`,
      headers: auth(OTHER),
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("updates own event", async () => {
    const app = await buildApp();
    const c = await app.inject({
      method: "POST",
      url: "/api/calendar",
      headers: auth(),
      payload: {
        title: "Old",
        startTime: new Date().toISOString(),
        endTime: new Date(Date.now() + 3600_000).toISOString(),
      },
    });
    const res = await app.inject({
      method: "PATCH",
      url: `/api/calendar/${c.json().id}`,
      headers: auth(),
      payload: { description: "Updated" },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it("deletes own event", async () => {
    const app = await buildApp();
    const c = await app.inject({
      method: "POST",
      url: "/api/calendar",
      headers: auth(),
      payload: {
        title: "Del",
        startTime: new Date().toISOString(),
        endTime: new Date(Date.now() + 3600_000).toISOString(),
      },
    });
    const res = await app.inject({
      method: "DELETE",
      url: `/api/calendar/${c.json().id}`,
      headers: auth(),
    });
    expect(res.statusCode).toBe(204);
    await app.close();
  });

  it("returns 403 when deleting other user's event", async () => {
    const app = await buildApp();
    const c = await app.inject({
      method: "POST",
      url: "/api/calendar",
      headers: auth(),
      payload: {
        title: "Mine",
        startTime: new Date().toISOString(),
        endTime: new Date(Date.now() + 3600_000).toISOString(),
      },
    });
    const res = await app.inject({
      method: "DELETE",
      url: `/api/calendar/${c.json().id}`,
      headers: auth(OTHER),
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});
