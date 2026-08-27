/**
 * /api/keys — CRUD for MCP machine credentials. The raw key appears exactly
 * once (creation response); the list never carries hashes; revocation is a
 * userId-scoped timestamp so a foreign id is a no-op, not a leak.
 */

import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signToken } from "../auth.js";

const keyFindMany = vi.hoisted(() => vi.fn(async () => [] as unknown[]));
const keyCount = vi.hoisted(() => vi.fn(async () => 0));
const keyCreate = vi.hoisted(() =>
  vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "k-new", ...data })),
);
const keyUpdateMany = vi.hoisted(() => vi.fn(async () => ({ count: 1 })));

vi.mock("../db.js", () => {
  const prisma = {
    apiKey: {
      findMany: keyFindMany,
      count: keyCount,
      create: keyCreate,
      updateMany: keyUpdateMany,
      findUnique: vi.fn(async () => null),
      update: vi.fn(async () => ({})),
    },
    user: { findUnique: vi.fn(async () => ({ id: "user-1", plan: "FREE", role: "USER" })) },
    device: {
      findUnique: vi.fn(async () => ({ id: "d1" })),
      count: vi.fn(async () => 1),
      update: vi.fn(async () => ({})),
    },
  };
  return { prisma, db: prisma };
});
vi.mock("../sentry.js", () => ({ captureError: vi.fn() }));

const TOKEN = signToken({ userId: "user-1", email: "t@e.com" });
const auth = () => ({ authorization: `Bearer ${TOKEN}` });

async function buildApp() {
  const { apiKeyRoutes } = await import("../routes/api-keys.js");
  const app = Fastify();
  await app.register(apiKeyRoutes, { prefix: "/api/keys" });
  return app;
}

beforeEach(() => {
  keyFindMany.mockReset();
  keyFindMany.mockResolvedValue([]);
  keyCount.mockReset();
  keyCount.mockResolvedValue(0);
  keyCreate.mockClear();
  keyUpdateMany.mockClear();
});

describe("POST /api/keys", () => {
  it("mints a key, returns the raw secret ONCE, stores only the hash", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/keys",
      headers: auth(),
      payload: { name: "claude-desktop" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.key).toMatch(/^klorn_sk_[0-9a-f]{64}$/);
    expect(body.name).toBe("claude-desktop");
    expect(body.prefix).toBe(body.key.slice(0, 15));
    const stored = keyCreate.mock.calls[0][0].data as Record<string, string>;
    expect(stored.keyHash).toBeTruthy();
    expect(stored.keyHash).not.toBe(body.key);
    expect(JSON.stringify(stored)).not.toContain(body.key);
    await app.close();
  });

  it("400s a missing/oversized name and the active-key cap", async () => {
    const app = await buildApp();
    const noName = await app.inject({
      method: "POST",
      url: "/api/keys",
      headers: auth(),
      payload: {},
    });
    expect(noName.statusCode).toBe(400);
    keyCount.mockResolvedValue(5);
    const capped = await app.inject({
      method: "POST",
      url: "/api/keys",
      headers: auth(),
      payload: { name: "one-too-many" },
    });
    expect(capped.statusCode).toBe(400);
    expect(keyCreate).not.toHaveBeenCalled();
    await app.close();
  });
});

describe("GET /api/keys", () => {
  it("lists keys without hashes, with a revoked flag", async () => {
    keyFindMany.mockResolvedValue([
      {
        id: "k1",
        name: "laptop",
        prefix: "klorn_sk_ab12cd",
        createdAt: new Date("2026-08-01T00:00:00Z"),
        lastUsedAt: null,
        revokedAt: null,
      },
      {
        id: "k2",
        name: "old",
        prefix: "klorn_sk_ff00aa",
        createdAt: new Date("2026-07-01T00:00:00Z"),
        lastUsedAt: new Date("2026-07-02T00:00:00Z"),
        revokedAt: new Date("2026-07-03T00:00:00Z"),
      },
    ]);
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/keys", headers: auth() });
    const { keys } = res.json();
    expect(keys).toHaveLength(2);
    expect(keys[0]).toEqual({
      id: "k1",
      name: "laptop",
      prefix: "klorn_sk_ab12cd",
      createdAt: "2026-08-01T00:00:00.000Z",
      lastUsedAt: null,
      revoked: false,
    });
    expect(keys[1].revoked).toBe(true);
    expect(JSON.stringify(keys)).not.toContain("keyHash");
    await app.close();
  });
});

describe("DELETE /api/keys/:id", () => {
  it("revokes scoped to the caller's user id", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "DELETE", url: "/api/keys/k1", headers: auth() });
    expect(res.statusCode).toBe(200);
    expect(keyUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "k1", userId: "user-1", revokedAt: null }),
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      }),
    );
    await app.close();
  });
});
