import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import { comparePassword, getUserId, hashPassword, signToken, verifyToken } from "../auth.js";
import { prisma } from "../db.js";
import { sendPasswordResetEmail, sendVerificationEmail } from "../email.js";
import { getAuthUrl, getGoogleUserInfo, getLoginAuthUrl, getOAuth2Client } from "../gmail.js";

export async function authRoutes(app: FastifyInstance) {
  // POST /api/auth/register — Create account
  app.post("/register", async (request, reply) => {
    const { email, password, name } = request.body as {
      email: string;
      password: string;
      name?: string;
    };

    if (!email || !password) {
      return reply.code(400).send({ error: "Email and password required" });
    }
    if (password.length < 6) {
      return reply.code(400).send({ error: "Password must be at least 6 characters" });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return reply.code(409).send({ error: "Email already registered" });
    }

    const verifyToken = crypto.randomBytes(32).toString("hex");
    const verifyTokenExp = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
        name: name || email.split("@")[0],
        verifyToken,
        verifyTokenExp,
      },
    });

    // Send verification email (non-blocking)
    sendVerificationEmail(email, verifyToken).catch(() => {});

    const token = signToken({ userId: user.id, email: user.email });
    return reply.code(201).send({
      token,
      user: { id: user.id, email: user.email, name: user.name, plan: user.plan },
    });
  });

  // POST /api/auth/login — Sign in
  app.post("/login", async (request, reply) => {
    const { email, password } = request.body as { email: string; password: string };

    if (!email || !password) {
      return reply.code(400).send({ error: "Email and password required" });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user?.passwordHash) {
      return reply.code(401).send({ error: "Invalid email or password" });
    }

    const valid = await comparePassword(password, user.passwordHash);
    if (!valid) {
      return reply.code(401).send({ error: "Invalid email or password" });
    }

    const token = signToken({ userId: user.id, email: user.email });
    return reply.send({
      token,
      user: { id: user.id, email: user.email, name: user.name, plan: user.plan },
    });
  });

  // GET /api/auth/me — Get current user
  app.get("/me", async (request, reply) => {
    const auth = request.headers.authorization;
    if (!auth?.startsWith("Bearer ")) {
      return reply.code(401).send({ error: "Not authenticated" });
    }

    try {
      const payload = verifyToken(auth.slice(7));
      const user = await prisma.user.findUnique({ where: { id: payload.userId } });
      if (!user) return reply.code(404).send({ error: "User not found" });

      // Check Google connection
      const googleToken = await prisma.userToken.findFirst({
        where: { userId: user.id, provider: "google" },
      });

      return reply.send({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          plan: user.plan,
          googleConnected: !!googleToken,
        },
      });
    } catch {
      return reply.code(401).send({ error: "Invalid token" });
    }
  });

  // PATCH /api/auth/me — Update profile
  app.patch("/me", async (request, reply) => {
    const userId = getUserId(request);
    if (userId === "demo-user") {
      return reply.code(403).send({ error: "Demo user cannot update profile" });
    }

    const { name } = request.body as { name?: string };
    const user = await prisma.user.update({
      where: { id: userId },
      data: { ...(name !== undefined && { name }) },
    });

    return reply.send({
      user: { id: user.id, email: user.email, name: user.name, plan: user.plan },
    });
  });

  // POST /api/auth/change-password — Change password
  app.post("/change-password", async (request, reply) => {
    const userId = getUserId(request);
    if (userId === "demo-user") {
      return reply.code(403).send({ error: "Demo user cannot change password" });
    }

    const { currentPassword, newPassword } = request.body as {
      currentPassword: string;
      newPassword: string;
    };

    if (!currentPassword || !newPassword) {
      return reply.code(400).send({ error: "Current and new password required" });
    }
    if (newPassword.length < 6) {
      return reply.code(400).send({ error: "New password must be at least 6 characters" });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user?.passwordHash) {
      return reply.code(400).send({ error: "No password set" });
    }

    const valid = await comparePassword(currentPassword, user.passwordHash);
    if (!valid) {
      return reply.code(401).send({ error: "Current password is incorrect" });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(newPassword) },
    });

    return reply.send({ success: true });
  });

  // POST /api/auth/set-password — Set password for OAuth users who don't have one
  app.post("/set-password", async (request, reply) => {
    const userId = getUserId(request);
    if (userId === "demo-user") {
      return reply.code(403).send({ error: "Demo user cannot set password" });
    }

    const { newPassword } = request.body as { newPassword: string };
    if (!newPassword || newPassword.length < 6) {
      return reply.code(400).send({ error: "Password must be at least 6 characters" });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return reply.code(404).send({ error: "User not found" });
    }
    if (user.passwordHash) {
      return reply.code(400).send({ error: "Password already set. Use change-password instead." });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(newPassword) },
    });

    return reply.send({ success: true });
  });

  // GET /api/auth/has-password — Check if user has a password set
  app.get("/has-password", async (request, reply) => {
    const userId = getUserId(request);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    return reply.send({ hasPassword: !!user?.passwordHash });
  });

  // GET /api/auth/google/login — Start Google social login flow
  app.get("/google/login", async (_request, reply) => {
    const url = getLoginAuthUrl();
    return reply.redirect(url);
  });

  // GET /api/auth/google — Start OAuth flow for Gmail/Calendar integration (pass userId via state)
  app.get("/google", async (request, reply) => {
    const userId = getUserId(request);
    const url = getAuthUrl(userId);
    return reply.redirect(url);
  });

  // GET /api/auth/google/callback — OAuth callback (handles both login and integration)
  app.get("/google/callback", async (request, reply) => {
    const { code, state } = request.query as { code?: string; state?: string };

    if (!code) {
      return reply.code(400).send({ error: "Missing authorization code" });
    }

    const webUrl = process.env.WEB_URL || "http://localhost:8001";

    try {
      const oauth2 = getOAuth2Client();
      const { tokens } = await oauth2.getToken(code);

      // --- Google Social Login flow ---
      if (state === "__login__") {
        if (!tokens.access_token) {
          return reply.redirect(`${webUrl}/login?error=google_failed`);
        }

        const profile = await getGoogleUserInfo(tokens.access_token);

        // Find or create user by email
        let user = await prisma.user.findUnique({ where: { email: profile.email } });
        if (!user) {
          user = await prisma.user.create({
            data: {
              email: profile.email,
              name: profile.name || profile.email.split("@")[0],
              passwordHash: null, // Google-only user, no password
              emailVerified: true, // Google accounts are pre-verified
            },
          });
        } else if (!user.emailVerified) {
          await prisma.user.update({
            where: { id: user.id },
            data: { emailVerified: true },
          });
        }

        const token = signToken({ userId: user.id, email: user.email });
        return reply.redirect(`${webUrl}/auth/callback?token=${token}`);
      }

      // --- Gmail/Calendar integration flow ---
      const userId = state || "demo-user";
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        return reply.code(404).send({ error: "User not found" });
      }

      await prisma.userToken.upsert({
        where: { userId_provider: { userId: user.id, provider: "google" } },
        create: {
          userId: user.id,
          provider: "google",
          accessToken: tokens.access_token ?? "",
          refreshToken: tokens.refresh_token || null,
          expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        },
        update: {
          accessToken: tokens.access_token ?? "",
          refreshToken: tokens.refresh_token || undefined,
          expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        },
      });

      return reply.redirect(`${webUrl}/settings?google=connected`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "OAuth failed";
      if (state === "__login__") {
        return reply.redirect(`${webUrl}/login?error=${encodeURIComponent(message)}`);
      }
      return reply.code(500).send({ error: message });
    }
  });

  // DELETE /api/auth/google — Disconnect Google account
  app.delete("/google", async (request, reply) => {
    const userId = getUserId(request);
    await prisma.userToken.deleteMany({
      where: { userId, provider: "google" },
    });
    return reply.code(204).send();
  });

  // GET /api/auth/google/status — Check if Gmail is connected
  app.get("/google/status", async (request, reply) => {
    const userId = getUserId(request);
    const token = await prisma.userToken.findFirst({
      where: { userId, provider: "google" },
    });
    return reply.send({ connected: !!token });
  });

  // POST /api/auth/forgot-password — Request password reset
  app.post("/forgot-password", async (request, reply) => {
    const { email } = request.body as { email: string };
    if (!email) return reply.code(400).send({ error: "Email required" });

    const user = await prisma.user.findUnique({ where: { email } });
    // Always return success to prevent email enumeration
    if (!user) return reply.send({ success: true });

    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenExp = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken, resetTokenExp },
    });

    await sendPasswordResetEmail(email, resetToken);

    return reply.send({ success: true });
  });

  // POST /api/auth/reset-password — Reset password with token
  app.post("/reset-password", async (request, reply) => {
    const { token, newPassword } = request.body as {
      token: string;
      newPassword: string;
    };

    if (!token || !newPassword) {
      return reply.code(400).send({ error: "Token and new password required" });
    }
    if (newPassword.length < 6) {
      return reply.code(400).send({ error: "Password must be at least 6 characters" });
    }

    const user = await prisma.user.findFirst({
      where: {
        resetToken: token,
        resetTokenExp: { gte: new Date() },
      },
    });

    if (!user) {
      return reply.code(400).send({ error: "Invalid or expired reset token" });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(newPassword),
        resetToken: null,
        resetTokenExp: null,
      },
    });

    return reply.send({ success: true });
  });

  // GET /api/auth/verify-email — Verify email with token
  app.get("/verify-email", async (request, reply) => {
    const { token } = request.query as { token?: string };

    if (!token) {
      return reply.code(400).send({ error: "Missing verification token" });
    }

    const user = await prisma.user.findFirst({
      where: {
        verifyToken: token,
        verifyTokenExp: { gte: new Date() },
      },
    });

    if (!user) {
      return reply.code(400).send({ error: "Invalid or expired verification token" });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        verifyToken: null,
        verifyTokenExp: null,
      },
    });

    const webUrl = process.env.WEB_URL || "http://localhost:8001";
    return reply.redirect(`${webUrl}/login?verified=true`);
  });

  // POST /api/auth/resend-verification — Resend verification email
  app.post("/resend-verification", async (request, reply) => {
    const userId = getUserId(request);
    if (userId === "demo-user") {
      return reply.code(403).send({ error: "Demo user" });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return reply.code(404).send({ error: "User not found" });
    if (user.emailVerified) return reply.send({ success: true, alreadyVerified: true });

    const verifyToken = crypto.randomBytes(32).toString("hex");
    const verifyTokenExp = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: { verifyToken, verifyTokenExp },
    });

    await sendVerificationEmail(user.email, verifyToken);
    return reply.send({ success: true });
  });
}
