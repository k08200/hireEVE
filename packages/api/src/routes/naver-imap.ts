/**
 * Naver IMAP connection routes.
 *
 *   GET  /api/naver-imap/status     — connected accounts (multi since 0b)
 *   POST /api/naver-imap/connect    — body { email, password } → verify + row
 *   POST /api/naver-imap/disconnect — body { email? } → remove one, or all
 *
 * `password` is the "외부 메일 가져오기 비밀번호" the user generates in
 * their Naver security settings — NOT their Naver account login password.
 * We test the credentials with a short IMAP LOGIN handshake before
 * persisting them so a typo doesn't quietly leave the user "connected"
 * with bad creds that fail on every poll.
 *
 * Phase 0b (docs/providers/multi-provider-plan.md): credentials live in
 * LinkedInboxAccount rows (provider NAVER) — one row per mailbox, which is
 * what makes this multi-account. The old response shape (connected/email/
 * host/connectedAt = the first account) is preserved for existing clients;
 * `accounts` is the real list.
 */

import type { FastifyInstance } from "fastify";
import { getUserId, requireAuth } from "../auth.js";
import { requireEntitled } from "../billing/entitlement-guard.js";
import { encryptToken } from "../crypto-tokens.js";
import { prisma } from "../db.js";
import { isAllowedImapHost } from "../mail/is-allowed-imap-host.js";
import { verifyNaverImapCredentials } from "../mail/naver-imap.js";

const DEFAULT_NAVER_IMAP_HOST = "imap.naver.com:993";

// Same ceiling as the Google link route (routes/auth.ts MAX_LINKED_INBOXES):
// a cap per provider keeps one user from turning the serial IMAP poll into a
// multi-minute tick for everyone behind them.
const MAX_NAVER_ACCOUNTS = 10;

const connectBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["email", "password"],
  properties: {
    email: { type: "string", format: "email", maxLength: 200 },
    password: { type: "string", minLength: 4, maxLength: 200 },
    host: { type: "string", maxLength: 200 },
  },
} as const;

export async function naverImapRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/status", async (request) => {
    const userId = getUserId(request);
    const rows = await prisma.linkedInboxAccount.findMany({
      where: { userId, provider: "NAVER" },
      select: {
        email: true,
        imapHost: true,
        createdAt: true,
        lastSyncedAt: true,
        needsReconnect: true,
      },
      orderBy: { createdAt: "asc" },
    });
    const first = rows[0];
    return {
      // Legacy single-account shape — existing web/desktop clients read these.
      connected: rows.length > 0,
      email: first?.email ?? null,
      host: first?.imapHost ?? null,
      connectedAt: first?.createdAt.toISOString() ?? null,
      // The real list (multi-account since Phase 0b).
      accounts: rows.map((r) => ({
        email: r.email,
        host: r.imapHost,
        connectedAt: r.createdAt.toISOString(),
        lastSyncedAt: r.lastSyncedAt?.toISOString() ?? null,
        needsReconnect: r.needsReconnect,
      })),
    };
  });

  app.post<{
    Body: { email: string; password: string; host?: string };
  }>(
    "/connect",
    {
      // Multi-account (connecting a SECOND inbox beyond the primary Google
      // account) is a paid feature — Pro/Team/Enterprise only. requireAuth
      // first sets userId for requireEntitled. Inert while the paywall is off.
      // /status (read) and /disconnect stay open so a downgraded user can still
      // see and remove an inbox they connected while paid.
      preHandler: [requireAuth, requireEntitled],
      schema: { body: connectBodySchema },
      // Every call opens a real IMAP connection to Naver; without a tight
      // limit this is both a credential-stuffing oracle and a way to get
      // our egress IP blocked by Naver.
      config: { rateLimit: { max: 5, timeWindow: "15 minutes" } },
    },
    async (request, reply) => {
      const userId = getUserId(request);
      const { email, password, host } = request.body;
      const imapHost = (host ?? DEFAULT_NAVER_IMAP_HOST).trim();

      // SSRF guard: this host is opened as a TLS connection here AND on every
      // subsequent poll. Reject anything outside the provider allowlist before
      // we connect, so a user can't probe internal hosts via this endpoint.
      if (!isAllowedImapHost(imapHost)) {
        reply.code(400);
        return { ok: false, message: "Unsupported IMAP host. Only imap.naver.com:993 is allowed." };
      }

      // Cap NEW accounts only — re-verifying an address that already has a row
      // (password rotation) must always be allowed, mirroring the Google
      // link route's "never lock a user out of reconnecting" rule.
      const existing = await prisma.linkedInboxAccount.findUnique({
        where: { userId_provider_email: { userId, provider: "NAVER", email } },
        select: { id: true },
      });
      if (!existing) {
        const count = await prisma.linkedInboxAccount.count({
          where: { userId, provider: "NAVER" },
        });
        if (count >= MAX_NAVER_ACCOUNTS) {
          reply.code(400);
          return { ok: false, message: `At most ${MAX_NAVER_ACCOUNTS} Naver accounts.` };
        }
      }

      // Smoke-test the credentials before persisting. We don't want the
      // user to leave the settings page thinking they're connected when
      // every subsequent poll will silently 401.
      const verify = await verifyNaverImapCredentials({
        email,
        password,
        host: imapHost,
      });
      if (!verify.ok) {
        reply.code(400);
        return { ok: false, message: verify.message };
      }

      await prisma.linkedInboxAccount.upsert({
        where: { userId_provider_email: { userId, provider: "NAVER", email } },
        create: {
          userId,
          provider: "NAVER",
          email,
          imapHost,
          imapPasswordCipher: encryptToken(password),
        },
        update: {
          imapHost,
          imapPasswordCipher: encryptToken(password),
          // A successful re-verify clears the reconnect prompt.
          needsReconnect: false,
        },
      });

      return { ok: true, email, host: imapHost };
    },
  );

  // No body schema on purpose: the deployed web client POSTs with NO body at
  // all, and a schema would 400 that. The optional email is validated by hand.
  app.post<{ Body: { email?: string } | null }>("/disconnect", async (request, reply) => {
    const userId = getUserId(request);
    const email = request.body?.email;
    if (email !== undefined && (typeof email !== "string" || email.length > 200)) {
      reply.code(400);
      return { ok: false, message: "email must be a string" };
    }
    // No email (the legacy client shape) removes every Naver account —
    // exactly what the old single-account disconnect did when one existed.
    await prisma.linkedInboxAccount.deleteMany({
      where: { userId, provider: "NAVER", ...(email ? { email } : {}) },
    });
    return { ok: true };
  });
}
