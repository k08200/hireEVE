import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signToken, verifyToken } from "../auth.js";

// Stub email sender — auth register fires it non-blocking and swallows errors,
// but we want to assert it was called with the right token.
const sendVerificationEmailSpy = vi.fn(async () => true);
const sendPasswordResetEmailSpy = vi.fn(async () => true);
vi.mock("../email.js", () => ({
  sendVerificationEmail: (...args: unknown[]) => sendVerificationEmailSpy(...args),
  sendPasswordResetEmail: (...args: unknown[]) => sendPasswordResetEmailSpy(...args),
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
  emailVerified?: boolean;
  resetToken?: string | null;
  resetTokenExp?: Date | null;
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
      findFirst: vi.fn(
        async ({
          where,
        }: {
          where: { resetToken?: string; verifyToken?: string; resetTokenExp?: unknown; verifyTokenExp?: unknown };
        }) => {
          for (const user of userStore.values()) {
            if (where.resetToken && user.resetToken === where.resetToken) {
              if (user.resetTokenExp && user.resetTokenExp.getTime() >= Date.now()) return user;
              return null;
            }
            if (where.verifyToken && user.verifyToken === where.verifyToken) {
              if (user.verifyTokenExp && user.verifyTokenExp.getTime() >= Date.now()) return user;
              return null;
            }
          }
          return null;
        },
      ),
      create: vi.fn(async ({ data }: { data: Omit<StoredUser, "id" | "plan" | "role"> }) => {
        const id = `user-${nextUserId++}`;
        const user: StoredUser = { id, plan: "FREE", role: "USER", ...data };
        userStore.set(id, user);
        userByEmail.set(data.email, id);
        return user;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const user = userStore.get(where.id);
        if (!user) throw new Error("User not found");
        const updated = { ...user, ...data };
        userStore.set(where.id, updated as StoredUser);
        return updated;
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
  sendPasswordResetEmailSpy.mockClear();
}

/** Register a user via the route and return the JWT token. */
async function registerAndGetToken(
  app: ReturnType<typeof Fastify>,
  email = "test@example.com",
  password = "testpassword123",
) {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { email, password },
  });
  return res.json().token as string;
}

function authHeader(token: string) {
  return { authorization: `Bearer ${token}` };
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

// ── GET /api/auth/me ──────────────────────────────────────────────

describe("GET /api/auth/me", () => {
  beforeEach(resetStores);

  it("returns the authenticated user profile", async () => {
    const app = await buildApp();
    const token = await registerAndGetToken(app, "me@example.com");

    const res = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: authHeader(token),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user.email).toBe("me@example.com");
    expect(body.user.id).toBe("user-1");
    expect(body.user).toHaveProperty("googleConnected");
    await app.close();
  });

  it("rejects requests without Authorization header", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/auth/me" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("rejects an invalid token", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: authHeader("invalid.jwt.token"),
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

// ── PATCH /api/auth/me ────────────────────────────────────────────

describe("PATCH /api/auth/me", () => {
  beforeEach(resetStores);

  it("updates the user name", async () => {
    const app = await buildApp();
    const token = await registerAndGetToken(app);

    const res = await app.inject({
      method: "PATCH",
      url: "/api/auth/me",
      headers: authHeader(token),
      payload: { name: "New Name" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().user.name).toBe("New Name");
    await app.close();
  });
});

// ── POST /api/auth/change-password ────────────────────────────────

describe("POST /api/auth/change-password", () => {
  beforeEach(resetStores);

  it("changes password with correct current password", async () => {
    const app = await buildApp();
    const token = await registerAndGetToken(app, "cp@example.com", "oldpassword1");

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/change-password",
      headers: authHeader(token),
      payload: { currentPassword: "oldpassword1", newPassword: "newpassword1" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);

    // Verify login works with new password
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "cp@example.com", password: "newpassword1" },
    });
    expect(login.statusCode).toBe(200);
    await app.close();
  });

  it("rejects wrong current password", async () => {
    const app = await buildApp();
    const token = await registerAndGetToken(app, "cp2@example.com", "correctpw1");

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/change-password",
      headers: authHeader(token),
      payload: { currentPassword: "wrongpassword", newPassword: "newpassword1" },
    });

    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("rejects missing fields", async () => {
    const app = await buildApp();
    const token = await registerAndGetToken(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/change-password",
      headers: authHeader(token),
      payload: { currentPassword: "oldpw" },
    });

    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("rejects new password shorter than 6 characters", async () => {
    const app = await buildApp();
    const token = await registerAndGetToken(app, "short@example.com", "oldpassword1");

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/change-password",
      headers: authHeader(token),
      payload: { currentPassword: "oldpassword1", newPassword: "short" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/6 characters/);
    await app.close();
  });
});

// ── POST /api/auth/set-password ───────────────────────────────────

describe("POST /api/auth/set-password", () => {
  beforeEach(resetStores);

  it("sets password for a user without one", async () => {
    // Simulate an OAuth user (no password) by inserting directly into the store
    const oauthUser: StoredUser = {
      id: "oauth-user",
      email: "oauth@example.com",
      passwordHash: null,
      name: "OAuth User",
      plan: "FREE",
      role: "USER",
    };
    userStore.set("oauth-user", oauthUser);
    userByEmail.set("oauth@example.com", "oauth-user");

    const app = await buildApp();
    const token = signToken({ userId: "oauth-user", email: "oauth@example.com" });

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/set-password",
      headers: authHeader(token),
      payload: { newPassword: "mynewpassword" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(userStore.get("oauth-user")?.passwordHash).toBeTruthy();
    await app.close();
  });

  it("rejects if password is already set", async () => {
    const app = await buildApp();
    const token = await registerAndGetToken(app, "has-pw@example.com", "existingpw1");

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/set-password",
      headers: authHeader(token),
      payload: { newPassword: "anotherpw123" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/already set/i);
    await app.close();
  });

  it("rejects password shorter than 6 characters", async () => {
    userStore.set("oauth-2", {
      id: "oauth-2",
      email: "o2@example.com",
      passwordHash: null,
      name: "O2",
      plan: "FREE",
      role: "USER",
    });
    const app = await buildApp();
    const token = signToken({ userId: "oauth-2", email: "o2@example.com" });

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/set-password",
      headers: authHeader(token),
      payload: { newPassword: "short" },
    });

    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ── GET /api/auth/has-password ────────────────────────────────────

describe("GET /api/auth/has-password", () => {
  beforeEach(resetStores);

  it("returns true for users with a password", async () => {
    const app = await buildApp();
    const token = await registerAndGetToken(app);

    const res = await app.inject({
      method: "GET",
      url: "/api/auth/has-password",
      headers: authHeader(token),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().hasPassword).toBe(true);
    await app.close();
  });

  it("returns false for OAuth-only users", async () => {
    userStore.set("no-pw", {
      id: "no-pw",
      email: "nopw@example.com",
      passwordHash: null,
      plan: "FREE",
      role: "USER",
    });
    const app = await buildApp();
    const token = signToken({ userId: "no-pw", email: "nopw@example.com" });

    const res = await app.inject({
      method: "GET",
      url: "/api/auth/has-password",
      headers: authHeader(token),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().hasPassword).toBe(false);
    await app.close();
  });
});

// ── POST /api/auth/forgot-password ────────────────────────────────

describe("POST /api/auth/forgot-password", () => {
  beforeEach(resetStores);

  it("sends reset email for existing user and always returns success", async () => {
    const app = await buildApp();
    await registerAndGetToken(app, "forgot@example.com");

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/forgot-password",
      payload: { email: "forgot@example.com" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(sendPasswordResetEmailSpy).toHaveBeenCalledWith("forgot@example.com", expect.any(String));

    // Verify resetToken was stored
    const user = userStore.get("user-1");
    expect(user?.resetToken).toBeTruthy();
    expect(user?.resetTokenExp).toBeInstanceOf(Date);
    await app.close();
  });

  it("returns success even for non-existent email (prevents enumeration)", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/forgot-password",
      payload: { email: "ghost@example.com" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(sendPasswordResetEmailSpy).not.toHaveBeenCalled();
    await app.close();
  });

  it("rejects missing email", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/forgot-password",
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ── POST /api/auth/reset-password ─────────────────────────────────

describe("POST /api/auth/reset-password", () => {
  beforeEach(resetStores);

  it("resets password with valid token", async () => {
    const app = await buildApp();
    await registerAndGetToken(app, "reset@example.com", "oldpassword1");

    // Trigger forgot-password to set resetToken
    await app.inject({
      method: "POST",
      url: "/api/auth/forgot-password",
      payload: { email: "reset@example.com" },
    });
    const resetToken = userStore.get("user-1")?.resetToken;

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/reset-password",
      payload: { token: resetToken, newPassword: "newpassword1" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);

    // resetToken should be cleared
    expect(userStore.get("user-1")?.resetToken).toBeNull();

    // Login with new password should work
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "reset@example.com", password: "newpassword1" },
    });
    expect(login.statusCode).toBe(200);
    await app.close();
  });

  it("rejects invalid reset token", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/reset-password",
      payload: { token: "bogus-token", newPassword: "newpassword1" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/invalid or expired/i);
    await app.close();
  });

  it("rejects missing fields", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/reset-password",
      payload: { token: "abc" },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("rejects short new password", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/reset-password",
      payload: { token: "abc", newPassword: "short" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/6 characters/);
    await app.close();
  });
});

// ── GET /api/auth/verify-email ────────────────────────────────────

describe("GET /api/auth/verify-email", () => {
  beforeEach(resetStores);

  it("verifies email with valid token and redirects", async () => {
    const app = await buildApp();
    await registerAndGetToken(app, "verify@example.com");

    const user = userStore.get("user-1");
    const vToken = user?.verifyToken;

    const res = await app.inject({
      method: "GET",
      url: `/api/auth/verify-email?token=${vToken}`,
    });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain("verified=true");

    // verifyToken should be cleared
    expect(userStore.get("user-1")?.verifyToken).toBeNull();
    expect(userStore.get("user-1")?.emailVerified).toBe(true);
    await app.close();
  });

  it("rejects missing token", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/auth/verify-email",
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("rejects invalid token", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/auth/verify-email?token=bogus",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/invalid or expired/i);
    await app.close();
  });
});

// ── POST /api/auth/resend-verification ────────────────────────────

describe("POST /api/auth/resend-verification", () => {
  beforeEach(resetStores);

  it("resends verification email for unverified user", async () => {
    const app = await buildApp();
    const token = await registerAndGetToken(app, "unver@example.com");
    sendVerificationEmailSpy.mockClear();

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/resend-verification",
      headers: authHeader(token),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(sendVerificationEmailSpy).toHaveBeenCalledWith("unver@example.com", expect.any(String));
    await app.close();
  });

  it("returns alreadyVerified for verified users", async () => {
    const app = await buildApp();
    const token = await registerAndGetToken(app, "ver@example.com");
    // Mark as verified
    const user = userStore.get("user-1")!;
    userStore.set("user-1", { ...user, emailVerified: true });

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/resend-verification",
      headers: authHeader(token),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().alreadyVerified).toBe(true);
    await app.close();
  });
});

// ── POST /api/auth/logout ─────────────────────────────────────────

describe("POST /api/auth/logout", () => {
  beforeEach(resetStores);

  it("returns success with a valid token", async () => {
    const app = await buildApp();
    const token = await registerAndGetToken(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: authHeader(token),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });

  it("returns success even without a token", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});
