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
vi.mock("../push.js", () => ({ sendPushNotification: vi.fn(async () => undefined) }));
vi.mock("../websocket.js", () => ({ pushNotification: vi.fn() }));

type StoredReminder = {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  remindAt: Date;
  status: string;
  createdAt: Date;
};
type StoredNotification = {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: Date;
};
const reminderStore = new Map<string, StoredReminder>();
const notificationStore = new Map<string, StoredNotification>();
let nextId = 1;
let nextNotificationId = 1;

vi.mock("../db.js", () => {
  const prisma = {
    reminder: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const results: StoredReminder[] = [];
        for (const r of reminderStore.values()) {
          if (r.userId === where.userId) results.push(r);
        }
        return results;
      }),
      findUnique: vi.fn(
        async ({ where }: { where: { id: string } }) => reminderStore.get(where.id) ?? null,
      ),
      create: vi.fn(
        async ({
          data,
        }: {
          data: {
            userId: string;
            title: string;
            remindAt: Date;
            description: string | null;
          };
        }) => {
          const id = `rem-${nextId++}`;
          const reminder: StoredReminder = {
            ...data,
            id,
            status: "PENDING",
            createdAt: new Date(),
          };
          reminderStore.set(id, reminder);
          return reminder;
        },
      ),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const r = reminderStore.get(where.id);
          if (!r) throw new Error("Not found");
          const updated = { ...r, ...data };
          reminderStore.set(where.id, updated as StoredReminder);
          return updated;
        },
      ),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id?: string; status?: string; remindAt?: { lte: Date }; userId?: string };
          data: Record<string, unknown>;
        }) => {
          let count = 0;
          for (const [id, r] of reminderStore) {
            if (where.id && r.id !== where.id) continue;
            if (where.userId && r.userId !== where.userId) continue;
            if (where.status && r.status !== where.status) continue;
            if (where.remindAt?.lte && r.remindAt > where.remindAt.lte) continue;
            reminderStore.set(id, { ...r, ...data } as StoredReminder);
            count++;
          }
          return { count };
        },
      ),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        reminderStore.delete(where.id);
      }),
      deleteMany: vi.fn(async ({ where }: { where: { userId: string; id?: { in: string[] } } }) => {
        let count = 0;
        for (const [id, r] of reminderStore) {
          if (r.userId !== where.userId) continue;
          if (where.id?.in && !where.id.in.includes(id)) continue;
          reminderStore.delete(id);
          count++;
        }
        return { count };
      }),
    },
    notification: {
      findMany: vi.fn(async ({ where }: { where: { userId: string; type?: string } }) => {
        const results: StoredNotification[] = [];
        for (const n of notificationStore.values()) {
          if (n.userId !== where.userId) continue;
          if (where.type && n.type !== where.type) continue;
          results.push(n);
        }
        return results;
      }),
      create: vi.fn(
        async ({ data }: { data: Omit<StoredNotification, "id" | "isRead" | "createdAt"> }) => {
          const notification: StoredNotification = {
            ...data,
            id: `notif-${nextNotificationId++}`,
            isRead: false,
            createdAt: new Date(),
          };
          notificationStore.set(notification.id, notification);
          return notification;
        },
      ),
    },
    pushDeliveryLog: {
      findMany: vi.fn(async () => []),
    },
    pushSubscription: {
      count: vi.fn(async () => 1),
      findMany: vi.fn(async () => []),
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
  const { reminderRoutes } = await import("../routes/reminders.js");
  const app = Fastify();
  await app.register(reminderRoutes, { prefix: "/api/reminders" });
  return app;
}

function resetStores() {
  reminderStore.clear();
  notificationStore.clear();
  nextId = 1;
  nextNotificationId = 1;
}

const FUTURE = new Date(Date.now() + 3600_000).toISOString();

// ── Tests ────────────────────────────────────────────────────────

describe("reminders routes", () => {
  beforeEach(resetStores);

  it("rejects unauthenticated requests with 401", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/reminders" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  // GET
  it("lists reminders for authenticated user", async () => {
    const app = await buildApp();
    await app.inject({
      method: "POST",
      url: "/api/reminders",
      headers: auth(),
      payload: { title: "R1", remindAt: FUTURE },
    });
    const res = await app.inject({
      method: "GET",
      url: "/api/reminders",
      headers: auth(),
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().reminders).toHaveLength(1);
    await app.close();
  });

  // POST
  it("creates a reminder", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/reminders",
      headers: auth(),
      payload: { title: "Call Bob", remindAt: FUTURE, description: "About Q4" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().title).toBe("Call Bob");
    expect(res.json().status).toBe("PENDING");
    await app.close();
  });

  it("diagnoses recent reminders and deliveries", async () => {
    const app = await buildApp();
    await app.inject({
      method: "POST",
      url: "/api/reminders",
      headers: auth(),
      payload: { title: "Diag", remindAt: FUTURE },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/reminders/diagnostics",
      headers: auth(),
    });

    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().subscriptions).toBe(1);
    expect(res.json().reminders[0].title).toBe("Diag");
    await app.close();
  });

  it("delivers due reminders on demand", async () => {
    const app = await buildApp();
    await app.inject({
      method: "POST",
      url: "/api/reminders",
      headers: auth(),
      payload: { title: "Due", remindAt: new Date(Date.now() - 1_000).toISOString() },
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/reminders/deliver-due",
      headers: auth(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ found: 1, delivered: 1 });
    expect([...reminderStore.values()][0]?.status).toBe("SENT");
    expect(notificationStore.size).toBe(1);
    await app.close();
  });

  // PATCH /:id (status update)
  it("updates reminder status", async () => {
    const app = await buildApp();
    const create = await app.inject({
      method: "POST",
      url: "/api/reminders",
      headers: auth(),
      payload: { title: "R1", remindAt: FUTURE },
    });
    const id = create.json().id;

    const res = await app.inject({
      method: "PATCH",
      url: `/api/reminders/${id}`,
      headers: auth(),
      payload: { status: "SENT" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("SENT");
    await app.close();
  });

  it("returns 403 when updating another user's reminder", async () => {
    const app = await buildApp();
    const create = await app.inject({
      method: "POST",
      url: "/api/reminders",
      headers: auth(),
      payload: { title: "Mine", remindAt: FUTURE },
    });
    const id = create.json().id;

    const res = await app.inject({
      method: "PATCH",
      url: `/api/reminders/${id}`,
      headers: auth(OTHER_TOKEN),
      payload: { status: "DISMISSED" },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  // PATCH /:id/dismiss
  it("dismisses a reminder", async () => {
    const app = await buildApp();
    const create = await app.inject({
      method: "POST",
      url: "/api/reminders",
      headers: auth(),
      payload: { title: "R1", remindAt: FUTURE },
    });
    const id = create.json().id;

    const res = await app.inject({
      method: "PATCH",
      url: `/api/reminders/${id}/dismiss`,
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("DISMISSED");
    await app.close();
  });

  // PATCH /:id/snooze
  it("snoozes a reminder by adding minutes", async () => {
    const app = await buildApp();
    const create = await app.inject({
      method: "POST",
      url: "/api/reminders",
      headers: auth(),
      payload: { title: "R1", remindAt: FUTURE },
    });
    const id = create.json().id;

    const res = await app.inject({
      method: "PATCH",
      url: `/api/reminders/${id}/snooze`,
      headers: auth(),
      payload: { minutes: 15 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("PENDING");
    await app.close();
  });

  // POST /bulk-delete
  it("bulk-deletes selected reminders", async () => {
    const app = await buildApp();
    const c1 = await app.inject({
      method: "POST",
      url: "/api/reminders",
      headers: auth(),
      payload: { title: "R1", remindAt: FUTURE },
    });
    const c2 = await app.inject({
      method: "POST",
      url: "/api/reminders",
      headers: auth(),
      payload: { title: "R2", remindAt: FUTURE },
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/reminders/bulk-delete",
      headers: auth(),
      payload: { ids: [c1.json().id] },
    });
    expect(res.statusCode).toBe(204);
    expect(reminderStore.size).toBe(1);
    expect(reminderStore.has(c2.json().id)).toBe(true);
    await app.close();
  });

  it("bulk-deletes all reminders when ids is empty", async () => {
    const app = await buildApp();
    await app.inject({
      method: "POST",
      url: "/api/reminders",
      headers: auth(),
      payload: { title: "R1", remindAt: FUTURE },
    });
    await app.inject({
      method: "POST",
      url: "/api/reminders",
      headers: auth(),
      payload: { title: "R2", remindAt: FUTURE },
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/reminders/bulk-delete",
      headers: auth(),
      payload: {},
    });
    expect(res.statusCode).toBe(204);
    expect(reminderStore.size).toBe(0);
    await app.close();
  });

  // DELETE /:id
  it("deletes own reminder", async () => {
    const app = await buildApp();
    const create = await app.inject({
      method: "POST",
      url: "/api/reminders",
      headers: auth(),
      payload: { title: "Del", remindAt: FUTURE },
    });
    const id = create.json().id;

    const res = await app.inject({
      method: "DELETE",
      url: `/api/reminders/${id}`,
      headers: auth(),
    });
    expect(res.statusCode).toBe(204);
    await app.close();
  });

  it("returns 403 when deleting another user's reminder", async () => {
    const app = await buildApp();
    const create = await app.inject({
      method: "POST",
      url: "/api/reminders",
      headers: auth(),
      payload: { title: "Mine", remindAt: FUTURE },
    });
    const id = create.json().id;

    const res = await app.inject({
      method: "DELETE",
      url: `/api/reminders/${id}`,
      headers: auth(OTHER_TOKEN),
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});
