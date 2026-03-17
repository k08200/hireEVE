import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { getAuthUrl, getOAuth2Client } from "../gmail.js";

export async function authRoutes(app: FastifyInstance) {
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

      // For MVP, use the first user or create one
      let user = await prisma.user.findFirst();
      if (!user) {
        user = await prisma.user.create({
          data: { email: "eve-user@local", name: "EVE User" },
        });
      }

      // Save tokens
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

      // Redirect back to chat
      return reply.redirect("http://localhost:8001/chat?gmail=connected");
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
