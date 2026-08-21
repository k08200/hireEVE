/**
 * POST/DELETE /api/email/:id/pin-tier — sender pin CRUD. Focus: ownership
 * scoping, exact parsed-address derivation (display names must not leak into
 * the rule), tier validation, upsert-not-duplicate, idempotent unpin.
 */

import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signToken } from "../auth.js";

const emailFindFirst = vi.hoisted(() => vi.fn());
const ruleFindFirst = vi.hoisted(() => vi.fn());
const ruleCreate = vi.hoisted(() => vi.fn());
const ruleUpdate = vi.hoisted(() => vi.fn());
const ruleDelete = vi.hoisted(() => vi.fn());

vi.mock("../mail/email.js", () => ({
  sendVerificationEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}));
vi.mock("../mail/gmail.js", () => ({
  getAuthUrl: vi.fn(),
  getLoginAuthUrl: vi.fn(),
  getGoogleUserInfo: vi.fn(),
  getOAuth2Client: vi.fn(),
  getAuthedClient: vi.fn(async () => null),
  createEmailDraft: vi.fn(async () => ({ success: true, draftId: "draft-1" })),
  sendEmail: vi.fn(async () => ({ success: true })),
  toggleReadGmail: vi.fn(async () => {}),
  toggleStarGmail: vi.fn(async () => {}),
  trashEmail: vi.fn(async () => ({ success: true })),
  archiveEmail: vi.fn(async () => ({ success: true })),
  unarchiveEmail: vi.fn(async () => ({ success: true })),
  untrashEmail: vi.fn(async () => ({ success: true })),
}));
vi.mock("../mail/email-sync.js", () => ({
  syncEmails: vi.fn(async () => ({ synced: 0, newCount: 0, source: "gmail" })),
  syncEmailByGmailId: vi.fn(async () => ({ synced: 1, newCount: 1, emailId: "email-1" })),
  reconcileEmails: vi.fn(async () => ({ removed: 0, updated: 0 })),
  syncLinkedInboxesForUser: vi.fn(async () => ({ newCount: 0 })),
  summarizeUnsummarizedEmails: vi.fn(async () => 0),
  generateSmartReply: vi.fn(async () => "Reply"),
  classifyPriorityDetailed: vi.fn(() => ({ priority: "NORMAL", reason: "t", signals: [] })),
  checkAutoReplyRules: vi.fn(async () => null),
  getEmailThreads: vi.fn(async () => ({ threads: [], total: 0 })),
}));
vi.mock("../notify/push.js", () => ({ sendPushNotification: vi.fn() }));
vi.mock("../mail/meeting-context.js", () => ({ getMeetingContext: vi.fn(async () => null) }));
vi.mock("../user-timezone.js", () => ({ getUserTimeZone: vi.fn(async () => "Asia/Seoul") }));
vi.mock("../websocket.js", () => ({ pushNotification: vi.fn() }));
vi.mock("../sentry.js", () => ({ captureError: vi.fn() }));

vi.mock("../db.js", () => {
  const prisma = {
    userToken: { findFirst: vi.fn(async () => null) },
    emailMessage: {
      findMany: vi.fn(async () => []),
      findFirst: emailFindFirst,
      count: vi.fn(async () => 0),
      groupBy: vi.fn(async () => []),
      update: vi.fn(async () => ({})),
    },
    emailRule: {
      findFirst: ruleFindFirst,
      create: ruleCreate,
      update: ruleUpdate,
      delete: ruleDelete,
    },
    linkedInboxAccount: { findMany: vi.fn(async () => []) },
    user: { findUnique: vi.fn(async () => ({ id: "user-1", plan: "FREE", role: "USER" })) },
    device: {
      findUnique: vi.fn(async () => ({ id: "d1" })),
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 1),
      update: vi.fn(async () => ({})),
    },
  };
  return { prisma, db: prisma };
});

const TOKEN = signToken({ userId: "user-1", email: "t@e.com" });
const auth = () => ({ authorization: `Bearer ${TOKEN}` });

async function buildApp() {
  const { emailRoutes } = await import("../routes/email.js");
  const app = Fastify();
  await app.register(emailRoutes, { prefix: "/api/email" });
  return app;
}

beforeEach(() => {
  emailFindFirst.mockReset();
  ruleFindFirst.mockReset();
  ruleCreate.mockReset();
  ruleUpdate.mockReset();
  ruleDelete.mockReset();
  emailFindFirst.mockResolvedValue({ from: "Boss Person <Boss@Acme.com>" });
  ruleFindFirst.mockResolvedValue(null);
  ruleCreate.mockResolvedValue({ id: "r1" });
  ruleUpdate.mockResolvedValue({ id: "r1" });
  ruleDelete.mockResolvedValue({ id: "r1" });
});

describe("POST /api/email/:id/pin-tier", () => {
  it("creates a PIN_TIER rule keyed by the exact lowercased address", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/email/e1/pin-tier",
      headers: auth(),
      payload: { tier: "SILENT" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ pinned: true, sender: "boss@acme.com", tier: "SILENT" });
    // Ownership enforced in the email lookup itself.
    expect(emailFindFirst.mock.calls[0][0].where.userId).toBe("user-1");
    const { data } = ruleCreate.mock.calls[0][0];
    expect(data).toMatchObject({
      userId: "user-1",
      actionType: "PIN_TIER",
      actionValue: "SILENT",
      conditions: { from: ["boss@acme.com"] },
    });
    await app.close();
  });

  it("updates the existing rule for the sender instead of duplicating", async () => {
    ruleFindFirst.mockResolvedValue({ id: "r-old" });
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/email/e1/pin-tier",
      headers: auth(),
      payload: { tier: "PUSH" },
    });
    expect(res.statusCode).toBe(200);
    expect(ruleCreate).not.toHaveBeenCalled();
    expect(ruleUpdate.mock.calls[0][0]).toMatchObject({
      where: { id: "r-old" },
      data: { actionValue: "PUSH", isActive: true },
    });
    await app.close();
  });

  it("rejects unknown tiers and unowned emails", async () => {
    const app = await buildApp();
    const bad = await app.inject({
      method: "POST",
      url: "/api/email/e1/pin-tier",
      headers: auth(),
      payload: { tier: "VIP" },
    });
    expect(bad.statusCode).toBe(400);

    emailFindFirst.mockResolvedValue(null);
    const missing = await app.inject({
      method: "POST",
      url: "/api/email/e1/pin-tier",
      headers: auth(),
      payload: { tier: "PUSH" },
    });
    expect(missing.statusCode).toBe(404);
    expect(ruleCreate).not.toHaveBeenCalled();
    await app.close();
  });
});

describe("DELETE /api/email/:id/pin-tier", () => {
  it("deletes the sender's rule when present, no-ops when absent", async () => {
    ruleFindFirst.mockResolvedValue({ id: "r1" });
    const app = await buildApp();
    const res = await app.inject({
      method: "DELETE",
      url: "/api/email/e1/pin-tier",
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ pinned: false, sender: "boss@acme.com" });
    expect(ruleDelete.mock.calls[0][0]).toEqual({ where: { id: "r1" } });

    ruleFindFirst.mockResolvedValue(null);
    ruleDelete.mockClear();
    const again = await app.inject({
      method: "DELETE",
      url: "/api/email/e1/pin-tier",
      headers: auth(),
    });
    expect(again.statusCode).toBe(200);
    expect(ruleDelete).not.toHaveBeenCalled();
    await app.close();
  });
});
