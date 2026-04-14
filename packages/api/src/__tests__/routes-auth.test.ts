import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifyToken } from "../auth.js";

// Stub email sender — auth register fires it non-blocking and swallows errors,
// but we want to assert it was called with the right token.
const sendVerificationEmailSpy = vi.fn(async () => true);
vi.mock("../email.js", () => ({
  sendVerificationEmail: (...args: unknown[]) => sendVerificationEmailSpy(...args),
  sendPasswordResetEmail: vi.fn(async () => true),
}));

// Stub gmail OAuth helpers so we don't hit googleapis in tests.
vi.mock("../gmail.js", () => ({
  getAuthUrl: vi.fn(() => "https://example.com/oauth"),
  getLoginAuthUrl: vi.fn(() => "https://example.com/oauth-login"),
  getAuthedClient: vi.fn(),
  getGoogleUserInfo: vi.fn(),
  getOAuth2Client: vi.fn(),
}));

// In-memory user / userToken / deviceSession stores.
type StoredUser = {
  id: string;
  email: string;
  passwordHash?: string | null;
  name?: string | null;
  plan: string;
  role: string;
  verifyToken?: string | null;
  verifyTokenExp?: Date | null;
};
const userStore = new Map<string, StoredUser>();
const userByEmail = new Map<string, string>();
let nextUserId = 1;

vi.mock("../db.js", () => {
  const prisma = {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { email?: string; id?: string } }) => {
        if (where.email) return userStore.get(userByEmail.get(where.email) || "") ?? null;
        if (where.id) return userStore.get(where.id) ?? null;
        return null;
      }),
      create: vi.fn(async ({ data }: { data: Omit<StoredUser, "id" | "plan" | "role"> }) => {
        const id = `user-${nextUserId++}`;
        const user: StoredUser = { id, plan: "FREE", role: "USER", ...data };
        userStore.set(id, user);
        userByEmail.set(data.email, id);
        return user;
      }),
    },
    userToken: { findFirst: vi.fn(async () => null) },
    automationConfig: { create: vi.fn(async () => ({})) },
    device: {
      create: vi.fn(async () => ({ id: "device-1" })),
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => ({ id: "device-1" })),
      deleteMany: vi.fn(async () => ({ count: 0 })),
      update: vi.fn(async () => ({})),
      count: vi.fn(async () => 1),
    },
  };
  return { prisma, db: prisma };
});

async function buildApp() {
  const { authRoutes } = await import("../routes/auth.js");
  const app = Fastify();
  await app.register(authRoutes, { prefix: "/api/auth" });
  return app;
}

function resetStores() {
  userStore.clear();
  userByEmail.clear();
  nextUserId = 1;
  sendVerificationEmailSpy.mockClear();
}

describe("POST /api/auth/register", () => {
  beforeEach(resetStores);

  it("creates a user, returns a valid JWT, and fires a verification email", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "alice@example.com", password: "correcthorsebatterystaple" },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.user.email).toBe("alice@example.com");
    expect(body.user.id).toBe("user-1");

    // Token must decode to the new user.
    const payload = verifyToken(body.token);
    expect(payload.userId).toBe("user-1");
    expect(payload.email).toBe("alice@example.com");

    // Password must not be stored as plaintext.
    const stored = userStore.get("user-1");
    expect(stored?.passwordHash).toBeTruthy();
    expect(stored?.passwordHash).not.toBe("correcthorsebatterystaple");

    // Verification email is non-blocking — give the microtask queue one tick.
    await new Promise((resolve) => setImmediate(resolve));
    expect(sendVerificationEmailSpy).toHaveBeenCalledWith("alice@example.com", expect.any(String));

    await app.close();
  });

  it("rejects missing email or password", async () => {
    const app = await buildApp();
    const res1 = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "a@b.com" },
    });
    expect(res1.statusCode).toBe(400);

    const res2 = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { password: "longenough" },
    });
    expect(res2.statusCode).toBe(400);

    await app.close();
  });

  it("rejects passwords shorter than 8 characters", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "short@example.com", password: "short" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/8 characters/);
    await app.close();
  });

  it("rejects duplicate emails with 409", async () => {
    const app = await buildApp();
    await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "dup@example.com", password: "longenoughpw" },
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "dup@example.com", password: "differentpw" },
    });
    expect(res.statusCode).toBe(409);
    await app.close();
  });
});

describe("POST /api/auth/login", () => {
  beforeEach(resetStores);

  async function registerUser(app: ReturnType<typeof Fastify>, email: string, password: string) {
    return app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email, password },
    });
  }

  it("accepts the correct password and returns a valid token", async () => {
    const app = await buildApp();
    await registerUser(app, "bob@example.com", "correcthorsebattery");

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "bob@example.com", password: "correcthorsebattery" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user.email).toBe("bob@example.com");
    expect(verifyToken(body.token).email).toBe("bob@example.com");
    await app.close();
  });

  it("rejects the wrong password with 401 and a generic message", async () => {
    const app = await buildApp();
    await registerUser(app, "carol@example.com", "correctpassword");

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "carol@example.com", password: "wrongpassword" },
    });
    expect(res.statusCode).toBe(401);
    // Message must not leak whether the account exists.
    expect(res.json().error).toBe("Invalid email or password");
    await app.close();
  });

  it("rejects an unknown email with the same generic 401", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "ghost@example.com", password: "doesntmatter" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("Invalid email or password");
    await app.close();
  });

  it("rejects missing fields with 400", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "x@y.com" },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
