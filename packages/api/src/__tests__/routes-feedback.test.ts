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

type FeedbackRow = {
  id: string;
  userId: string;
  source: string;
  signal: string;
  recipient: string | null;
  toolName: string | null;
  createdAt: Date;
};
const events: FeedbackRow[] = [];
let nextId = 1;

vi.mock("../db.js", () => {
  const prisma = {
    feedbackEvent: {
      findMany: vi.fn(
        async ({
          where,
          take,
        }: {
          where: {
            userId: string;
            source?: string;
            signal?: string;
            recipient?: string;
            toolName?: string;
          };
          take?: number;
        }) => {
          let rows = events.filter(
            (e) =>
              e.userId === where.userId &&
              (!where.source || e.source === where.source) &&
              (!where.signal || e.signal === where.signal) &&
              (!where.recipient || e.recipient === where.recipient) &&
              (!where.toolName || e.toolName === where.toolName),
          );
          rows = rows.slice().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
          if (typeof take === "number") rows = rows.slice(0, take);
          return rows;
        },
      ),
      groupBy: vi.fn(async ({ where }: { where: { userId: string; createdAt: { gte: Date } } }) => {
        const filtered = events.filter(
          (e) => e.userId === where.userId && e.createdAt >= where.createdAt.gte,
        );
        const counts = new Map<string, number>();
        for (const e of filtered) counts.set(e.signal, (counts.get(e.signal) ?? 0) + 1);
        return Array.from(counts, ([signal, count]) => ({
          signal,
          _count: { signal: count },
        }));
      }),
    },
    user: {
      findUnique: vi.fn(async () => ({ id: "user-1", plan: "FREE", role: "USER" })),
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

const TOKEN = signToken({ userId: "user-1", email: "test@example.com" });

function auth() {
  return { authorization: `Bearer ${TOKEN}` };
}

async function buildApp() {
  const { feedbackRoutes } = await import("../routes/feedback.js");
  const app = Fastify();
  await app.register(feedbackRoutes, { prefix: "/api/feedback" });
  return app;
}

function reset() {
  events.length = 0;
  nextId = 1;
}

function seed(over: Partial<FeedbackRow> = {}): FeedbackRow {
  const row: FeedbackRow = {
    id: `f-${nextId++}`,
    userId: "user-1",
    source: "PENDING_ACTION",
    signal: "APPROVED",
    recipient: null,
    toolName: null,
    createdAt: new Date(),
    ...over,
  };
  events.push(row);
  return row;
}

describe("feedback routes", () => {
  beforeEach(reset);

  it("rejects unauthenticated requests with 401", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/feedback" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("returns the requesting user's events newest-first", async () => {
    const old = seed({ id: "old", createdAt: new Date(Date.now() - 1000) });
    const fresh = seed({ id: "fresh", createdAt: new Date() });
    seed({ id: "other", userId: "user-2" });

    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/feedback",
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);
    const ids = res.json().events.map((e: { id: string }) => e.id);
    expect(ids).toEqual([fresh.id, old.id]);
    await app.close();
  });

  it("filters by signal", async () => {
    seed({ id: "approved", signal: "APPROVED" });
    seed({ id: "rejected", signal: "REJECTED" });
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/feedback?signal=REJECTED",
      headers: auth(),
    });
    expect(res.json().events.map((e: { id: string }) => e.id)).toEqual(["rejected"]);
    await app.close();
  });

  it("ignores unknown filter values without erroring", async () => {
    seed({ id: "ok" });
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/feedback?signal=BANANA&source=NOT_A_SOURCE",
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().events).toHaveLength(1);
    await app.close();
  });

  it("summary rolls up signal counts across the last 30 days", async () => {
    seed({ signal: "APPROVED" });
    seed({ signal: "APPROVED" });
    seed({ signal: "REJECTED" });
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/feedback/summary",
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.counts.APPROVED).toBe(2);
    expect(body.counts.REJECTED).toBe(1);
    await app.close();
  });
});
