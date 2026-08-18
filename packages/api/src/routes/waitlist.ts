import type { FastifyInstance } from "fastify";
import { db } from "../db.js";
import { sendWaitlistAdminAlert, sendWaitlistConfirmationEmail } from "../mail/email.js";

const waitlistBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["email"],
  properties: {
    email: { type: "string", minLength: 3, maxLength: 320 },
    name: { type: "string", minLength: 1, maxLength: 120 },
    useCase: { type: "string", minLength: 1, maxLength: 500 },
    // "How did you hear about us?" — free text, deliberately not an enum so a
    // channel we never thought of still gets recorded verbatim. Over-long
    // answers are truncated, not rejected: a chatty reply must not cost us
    // the signup. See the schema comment on Waitlist.source for why this is
    // the only attribution we can still collect.
    source: { type: "string", minLength: 1, maxLength: 400 },
  },
} as const;

/** Max stored length of `source`; longer answers are truncated to fit. */
const SOURCE_MAX = 80;

// Bounded quantifiers (≤64 local, ≤253 domain, ≤63 TLD) to avoid polynomial-time
// regex backtracking on long crafted inputs. CodeQL js/polynomial-redos.
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{1,63}$/;

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function trimOrUndefined(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

export function waitlistRoutes(app: FastifyInstance) {
  // POST /api/waitlist — public endpoint, anyone can submit. Tighter rate
  // limit than the global default to discourage spam without affecting real
  // signups.
  app.post(
    "/",
    {
      schema: { body: waitlistBodySchema },
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "10 minutes",
        },
      },
    },
    async (request, reply) => {
      const body = request.body as {
        email: string;
        name?: string;
        useCase?: string;
        source?: string;
      };
      const email = normalizeEmail(body.email);
      if (!EMAIL_RE.test(email)) {
        return reply.code(400).send({ error: "Invalid email" });
      }

      const name = trimOrUndefined(body.name, 120);
      const useCase = trimOrUndefined(body.useCase, 500);
      const source = trimOrUndefined(body.source, SOURCE_MAX);

      // Idempotent dedup — if email already exists we still return 200 so
      // the form doesn't leak whether someone is already on the list.
      const existing = await db.waitlist.findUnique({
        where: { email },
        select: { id: true, status: true, source: true },
      });

      const entry = existing
        ? await db.waitlist.update({
            where: { email },
            data: {
              name: name ?? undefined,
              useCase: useCase ?? undefined,
              // First touch wins. A resubmission that omits the question —
              // or answers it from a different device — must not overwrite
              // the channel that actually brought this person in.
              source: existing.source ? undefined : (source ?? undefined),
            },
            select: { id: true, email: true, name: true, useCase: true, source: true },
          })
        : await db.waitlist.create({
            data: { email, name, useCase, source },
            select: { id: true, email: true, name: true, useCase: true, source: true },
          });

      // Fire-and-forget admin notification — don't block the response if
      // the email service is slow or misconfigured. Also fires on
      // re-submissions so the admin sees follow-up interest.
      sendWaitlistAdminAlert({ ...entry, isResubmission: !!existing }).catch((err) => {
        console.error("[WAITLIST] Admin alert failed:", err);
      });

      // Fire-and-forget applicant confirmation — same best-effort pattern.
      // First submission only: re-submissions already got one, don't spam.
      if (!existing) {
        sendWaitlistConfirmationEmail(entry.email, entry.name).catch((err) => {
          console.error("[WAITLIST] Applicant confirmation failed:", err);
        });
      }

      return reply.code(200).send({ ok: true, alreadyOnList: !!existing });
    },
  );
}
