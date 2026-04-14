/**
 * Gmail Pub/Sub push endpoint.
 *
 * Flow:
 *   Gmail mailbox change → Google publishes to Pub/Sub topic →
 *   Pub/Sub push subscription posts here → we resolve the user and sync.
 *
 * Setup (ops):
 *   1. Create a Pub/Sub topic, e.g. projects/<proj>/topics/gmail-push.
 *   2. Grant roles/pubsub.publisher to gmail-api-push@system.gserviceaccount.com.
 *   3. Create a push subscription targeting POST /api/gmail/push with
 *      a shared secret in the URL (?token=<GMAIL_PUSH_TOKEN>).
 *   4. Each user with Gmail connected calls POST /api/gmail/watch/enable
 *      to register their mailbox against the topic. Watches expire in 7
 *      days and need to be renewed (tracked as follow-up work).
 *
 * Security: Pub/Sub push can in principle be called by anyone who learns
 * the URL. We gate with a shared secret passed in the query string — set
 * GMAIL_PUSH_TOKEN in the env and match it in the Pub/Sub subscription.
 * A future hardening step would be OIDC JWT validation via google-auth-library.
 */

import type { FastifyInstance } from "fastify";
import { getUserId, requireAuth } from "../auth.js";
import { prisma } from "../db.js";
import { syncEmails } from "../email-sync.js";
import { registerGmailWatch, stopGmailWatch } from "../gmail.js";

interface PubSubPushBody {
  message?: {
    data?: string;
    messageId?: string;
    publishTime?: string;
    attributes?: Record<string, string>;
  };
  subscription?: string;
}

interface GmailPushPayload {
  emailAddress: string;
  historyId: string | number;
}

export async function gmailPushRoutes(app: FastifyInstance) {
  // ── Public Pub/Sub push target ────────────────────────────────────────
  // No requireAuth here — Pub/Sub posts as Google, not as the user. The
  // GMAIL_PUSH_TOKEN query parameter is the auth boundary.
  app.post("/push", async (request, reply) => {
    const expected = process.env.GMAIL_PUSH_TOKEN;
    if (!expected) {
      return reply.code(503).send({ error: "Gmail push not configured" });
    }
    const token = (request.query as { token?: string }).token;
    if (!token || token !== expected) {
      return reply.code(401).send({ error: "Invalid push token" });
    }

    const body = request.body as PubSubPushBody;
    const dataB64 = body?.message?.data;
    if (!dataB64) {
      // Ack empty pushes so Pub/Sub does not retry.
      return reply.code(204).send();
    }

    let payload: GmailPushPayload;
    try {
      const decoded = Buffer.from(dataB64, "base64").toString("utf-8");
      payload = JSON.parse(decoded);
    } catch {
      // Malformed payload — ack so Pub/Sub stops retrying, but log.
      console.warn("[GMAIL-PUSH] Dropping malformed Pub/Sub payload");
      return reply.code(204).send();
    }

    const email = payload.emailAddress?.toLowerCase();
    if (!email) {
      return reply.code(204).send();
    }

    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true },
    });
    if (!user) {
      // Unknown user — ack to drain the subscription.
      return reply.code(204).send();
    }

    // Fire-and-forget the sync so we return fast and Pub/Sub does not time out.
    // Errors are swallowed here; the 1-minute polling fallback will catch up.
    syncEmails(user.id, 30).catch((err) => {
      console.warn(`[GMAIL-PUSH] sync failed for ${user.id}: ${String(err)}`);
    });

    return reply.code(204).send();
  });

  // ── Authenticated management endpoints ────────────────────────────────
  app.post("/watch/enable", { preHandler: requireAuth }, async (request, reply) => {
    const userId = getUserId(request);
    const result = await registerGmailWatch(userId);
    if ("error" in result) {
      return reply.code(400).send(result);
    }
    return reply.send(result);
  });

  app.post("/watch/disable", { preHandler: requireAuth }, async (request, reply) => {
    const userId = getUserId(request);
    const result = await stopGmailWatch(userId);
    if (!result.ok) {
      return reply.code(400).send({ error: result.error || "Failed to stop watch" });
    }
    return reply.send({ ok: true });
  });
}
