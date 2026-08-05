/**
 * IMAP provider connection routes (formerly routes/naver-imap.ts; a
 * per-provider factory since Phase 2). Registered once per provider:
 *
 *   GET  /api/<prefix>/status     — connected accounts (multi since 0b)
 *   POST /api/<prefix>/connect    — body { email, password } → verify + row
 *   POST /api/<prefix>/disconnect — body { email? } → remove one, or all
 *
 * `password` is the app password the user generates in the provider's
 * security settings (Naver "외부 메일 가져오기 비밀번호", Apple
 * app-specific password) — NOT their account login password. We test the
 * credentials with a short IMAP LOGIN handshake before persisting them so a
 * typo doesn't quietly leave the user "connected" with bad creds that fail
 * on every poll.
 *
 * Phase 0b (docs/providers/multi-provider-plan.md): credentials live in
 * LinkedInboxAccount rows — one row per mailbox, which is what makes this
 * multi-account. The old response shape (connected/email/host/connectedAt =
 * the first account) is preserved for existing Naver clients; `accounts` is
 * the real list. New providers reuse the same shape so the settings UI is
 * one component.
 *
 * `opts.gate` (Phase 2, CASA surface freeze): while the provider's flag is
 * OFF every route — including unauthenticated probes — answers 404, so the
 * DAST-scanned surface is identical to the flag not existing at all.
 */

import type { FastifyInstance } from "fastify";
import { getUserId, requireAuth } from "../auth.js";
import { requireEntitled } from "../billing/entitlement-guard.js";
import { encryptToken } from "../crypto-tokens.js";
import { prisma } from "../db.js";
import { hostMatchesProvider, type ImapProviderConfig } from "../mail/imap-providers.js";
import { verifyImapCredentials } from "../mail/imap-sync.js";
import { isAllowedImapHost } from "../mail/is-allowed-imap-host.js";

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

export function imapConnectRoutes(
  cfg: ImapProviderConfig,
  opts: { gate?: () => boolean } = {},
): (app: FastifyInstance) => Promise<void> {
  return async function routes(app: FastifyInstance) {
    // Feature-flag gate FIRST — as onRequest, because the app-level auth hook
    // is a preHandler and would otherwise answer 401 before this runs. A dark
    // provider must be indistinguishable from a route that doesn't exist,
    // even to an unauthenticated probe — so the body replicates Fastify's
    // default 404 (fastify/lib/four-oh-four.js) byte-for-byte: a static
    // "Not Found" message would let a scanner diff this route against a
    // truly unregistered sibling and learn it exists.
    if (opts.gate) {
      const gate = opts.gate;
      app.addHook("onRequest", async (request, reply) => {
        if (!gate()) {
          const { url, method } = request.raw;
          reply.code(404);
          return reply.send({
            message: `Route ${method}:${url} not found`,
            error: "Not Found",
            statusCode: 404,
          });
        }
      });
    }
    app.addHook("preHandler", requireAuth);

    app.get("/status", async (request) => {
      const userId = getUserId(request);
      const rows = await prisma.linkedInboxAccount.findMany({
        where: { userId, provider: cfg.provider },
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
        // Every call opens a real IMAP connection to the provider; without a
        // tight limit this is both a credential-stuffing oracle and a way to
        // get our egress IP blocked by the provider.
        config: { rateLimit: { max: 5, timeWindow: "15 minutes" } },
      },
      async (request, reply) => {
        const userId = getUserId(request);
        const { email, password, host } = request.body;
        const imapHost = (host ?? cfg.defaultHost).trim();

        // SSRF guard: this host is opened as a TLS connection here AND on every
        // subsequent poll. Reject anything outside the provider allowlist before
        // we connect, so a user can't probe internal hosts via this endpoint.
        // Also pin host↔provider: the global allowlist alone would let a NAVER
        // row point at the iCloud host (and vice versa).
        if (!isAllowedImapHost(imapHost) || !hostMatchesProvider(imapHost, cfg)) {
          reply.code(400);
          return {
            ok: false,
            message: `Unsupported IMAP host. Only ${cfg.defaultHost} is allowed.`,
          };
        }

        // Cap NEW accounts only — re-verifying an address that already has a row
        // (password rotation) must always be allowed, mirroring the Google
        // link route's "never lock a user out of reconnecting" rule.
        const existing = await prisma.linkedInboxAccount.findUnique({
          where: { userId_provider_email: { userId, provider: cfg.provider, email } },
          select: { id: true },
        });
        if (!existing) {
          const count = await prisma.linkedInboxAccount.count({
            where: { userId, provider: cfg.provider },
          });
          if (count >= cfg.maxAccounts) {
            reply.code(400);
            return { ok: false, message: `At most ${cfg.maxAccounts} ${cfg.label} accounts.` };
          }
        }

        // Smoke-test the credentials before persisting. We don't want the
        // user to leave the settings page thinking they're connected when
        // every subsequent poll will silently 401.
        const verify = await verifyImapCredentials({
          provider: cfg,
          email,
          password,
          host: imapHost,
        });
        if (!verify.ok) {
          reply.code(400);
          return { ok: false, message: verify.message };
        }

        await prisma.linkedInboxAccount.upsert({
          where: { userId_provider_email: { userId, provider: cfg.provider, email } },
          create: {
            userId,
            provider: cfg.provider,
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
      // No email (the legacy client shape) removes every account for this
      // provider — exactly what the old single-account disconnect did.
      await prisma.linkedInboxAccount.deleteMany({
        where: { userId, provider: cfg.provider, ...(email ? { email } : {}) },
      });
      return { ok: true };
    });
  };
}
