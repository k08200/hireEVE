/**
 * GitHub connection routes (BYO personal access token).
 *
 *   GET  /api/github/status     — connected? since when?
 *   POST /api/github/connect    — body { token } → verify via /user → encrypt + save
 *   POST /api/github/disconnect — clear the three github* columns
 *
 * The token is a GitHub PAT with the `notifications` scope (and `repo` for
 * private repos). We verify it with a /user call before persisting so a
 * typo doesn't leave the user "connected" with a token that 401s on every
 * poll — same contract as the Naver IMAP connect route.
 */

import type { FastifyInstance } from "fastify";
import { getUserId, requireAuth } from "../auth.js";
import { encryptToken } from "../crypto-tokens.js";
import { prisma } from "../db.js";
import { verifyGitHubToken } from "../mail/github-client.js";

const connectBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["token"],
  properties: {
    token: { type: "string", minLength: 8, maxLength: 255 },
  },
} as const;

export async function githubRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/status", async (request) => {
    const userId = getUserId(request);
    const user = (await prisma.user.findUnique({
      where: { id: userId },
      select: { githubTokenCipher: true, githubConnectedAt: true, githubLastPolledAt: true },
    })) as {
      githubTokenCipher: string | null;
      githubConnectedAt: Date | null;
      githubLastPolledAt: Date | null;
    } | null;
    return {
      connected: Boolean(user?.githubTokenCipher),
      connectedAt: user?.githubConnectedAt?.toISOString() ?? null,
      lastPolledAt: user?.githubLastPolledAt?.toISOString() ?? null,
    };
  });

  app.post<{ Body: { token: string } }>(
    "/connect",
    {
      schema: { body: connectBodySchema },
      // Each call hits GitHub with a candidate token — rate-limit so it
      // can't be used as a token-probing oracle.
      config: { rateLimit: { max: 5, timeWindow: "15 minutes" } },
    },
    async (request, reply) => {
      const userId = getUserId(request);
      const { token } = request.body;

      const verify = await verifyGitHubToken(token);
      if (!verify.ok) {
        reply.code(400);
        return { ok: false, message: verify.message };
      }

      await prisma.user.update({
        where: { id: userId },
        data: {
          githubTokenCipher: encryptToken(token),
          githubConnectedAt: new Date(),
          // Fresh connection: start the cursor now so the first poll doesn't
          // replay the user's entire notification backlog as interrupts.
          githubLastPolledAt: new Date(),
        },
      });

      return { ok: true, login: verify.login };
    },
  );

  app.post("/disconnect", async (request) => {
    const userId = getUserId(request);
    await prisma.user.update({
      where: { id: userId },
      data: { githubTokenCipher: null, githubConnectedAt: null, githubLastPolledAt: null },
    });
    // Disconnecting must also clear what the integration already put on the
    // board. GitHub items are never auto-resolved, so without this they sit
    // in the firewall forever after the source is gone — and they compete
    // for the board's window against real mail (2026-08-10).
    const { count } = await prisma.attentionItem.updateMany({
      // SNOOZED too: the scheduler's resurrect sweep flips any snoozed item
      // back to OPEN on its wake time, so leaving them would resurface
      // GitHub cards after the source is gone (precedent: the deleted-email
      // resolver in mail/email-sync.ts uses the same pair).
      where: { userId, source: "GITHUB", status: { in: ["OPEN", "SNOOZED"] } },
      data: { status: "RESOLVED", resolvedAt: new Date() },
    });
    return { ok: true, clearedItems: count };
  });
}
