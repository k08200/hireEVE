import type { FastifyInstance } from "fastify";
import { comparePassword, hashPassword, signToken } from "../auth.js";
import { prisma } from "../db.js";
import { getAuthUrl, getOAuth2Client } from "../gmail.js";

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

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
        name: name || email.split("@")[0],
      },
    });

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
    if (!user || !user.passwordHash) {
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
      const { verifyToken } = await import("../auth.js");
      const payload = verifyToken(auth.slice(7));
      const user = await prisma.user.findUnique({ where: { id: payload.userId } });
      if (!user) return reply.code(404).send({ error: "User not found" });

      return reply.send({
        user: { id: user.id, email: user.email, name: user.name, plan: user.plan },
      });
    } catch {
      return reply.code(401).send({ error: "Invalid token" });
    }
  });

  // GET /api/auth/google — Start OAuth flow
  app.get("/google", async (_request, reply) => {
    const url = getAuthUrl();
    return reply.redirect(url);
  });

  // GET /api/auth/google/callback — OAuth callback
  app.get("/google/callback", async (request, reply) => {
    const { code } = request.query as { code?: string };

    if (!code) {
      return reply.code(400).send({ error: "Missing authorization code" });
    }

    try {
      const oauth2 = getOAuth2Client();
      const { tokens } = await oauth2.getToken(code);

      let user = await prisma.user.findFirst();
      if (!user) {
        user = await prisma.user.create({
          data: { email: "eve-user@local", name: "EVE User" },
        });
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

      const webUrl = process.env.WEB_URL || "http://localhost:8001";
      return reply.redirect(`${webUrl}/chat?gmail=connected`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "OAuth failed";
      return reply.code(500).send({ error: message });
    }
  });

  // GET /api/auth/google/status — Check if Gmail is connected
  app.get("/google/status", async (_request, reply) => {
    const user = await prisma.user.findFirst();
    if (!user) return reply.send({ connected: false });

    const token = await prisma.userToken.findUnique({
      where: { userId_provider: { userId: user.id, provider: "google" } },
    });

    return reply.send({ connected: !!token });
  });
}
