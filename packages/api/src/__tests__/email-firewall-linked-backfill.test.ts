/**
 * persistGmailEmail's update path must (re)stamp linkedInboxAccountId when the
 * caller provides one — the Naver poll re-touches its recent window every
 * cycle, and rows ingested before Phase 0b's table move rely on this to adopt
 * their account id without a data migration. When the caller passes nothing
 * (primary Gmail sync), the column must be left untouched so a re-sync can
 * never null out a linked row's provenance.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.hoisted(() => vi.fn());
const create = vi.hoisted(() => vi.fn());
const update = vi.hoisted(() => vi.fn());

vi.mock("../db.js", () => ({
  prisma: { emailMessage: { findUnique, create, update } },
  db: {},
}));

vi.mock("../judge/attention-mirror.js", () => ({ upsertAttentionForEmailJudgement: vi.fn() }));
vi.mock("../pim/commitment-ingestion.js", () => ({
  extractAndUpsertCommitmentsFromText: vi.fn(() => Promise.resolve()),
}));
vi.mock("../agentcore/email-action-trigger.js", () => ({
  scheduleAgentForActionableEmail: vi.fn(() => Promise.resolve()),
}));
vi.mock("../mail/email-attachments.js", () => ({
  analyzePendingEmailAttachments: vi.fn(() => Promise.resolve()),
  upsertEmailAttachments: vi.fn(() => Promise.resolve()),
}));
vi.mock("../mail/email-priority.js", () => ({
  classifyNeedsReplyFromSignals: vi.fn(() => ({ needsReply: false, reason: null, confidence: 0 })),
  classifyPriority: vi.fn(() => "NORMAL"),
}));
vi.mock("../mail/providers/dispatch.js", () => ({
  mailActionsFor: vi.fn(async () => ({ markAsRead: vi.fn(async () => ({ success: true })) })),
}));
vi.mock("../judge/judge-context.js", () => ({
  buildJudgeContext: vi.fn(() => Promise.resolve({})),
}));
vi.mock("../judge/judge-health.js", () => ({ recordJudgeSource: vi.fn() }));
vi.mock("../judge/keyword-policy.js", () => ({ isClearMarketing: vi.fn(() => false) }));
vi.mock("../llm/llm-credentials.js", () => ({
  getUserLlmCredentials: vi.fn(() => Promise.resolve(null)),
}));
vi.mock("../judge/poc-judge.js", () => ({ judgeEmail: vi.fn(() => Promise.resolve("QUEUE")) }));
vi.mock("../resolve-user-email.js", () => ({
  resolveUserEmail: vi.fn(() => Promise.resolve("me@example.com")),
}));
vi.mock("../sentry.js", () => ({ captureError: vi.fn() }));

import { persistGmailEmail } from "../judge/email-firewall.js";

function rawEmail() {
  return {
    gmailId: "naver-imap:me@naver.com:7",
    threadId: null,
    from: "Kim <kim@example.com>",
    to: "me@naver.com",
    cc: "",
    subject: "hello",
    snippet: "hi",
    body: "",
    htmlBody: "",
    labels: ["INBOX"],
    isRead: true,
    isStarred: false,
    receivedAt: new Date("2026-08-01T00:00:00Z"),
    attachments: [],
    // biome-ignore lint/suspicious/noExplicitAny: test fixture
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  findUnique.mockResolvedValue({ id: "e-existing" });
  update.mockResolvedValue({ id: "e-existing" });
});

describe("persistGmailEmail update path × linkedInboxAccountId", () => {
  it("stamps the account id on update when the caller provides one (Naver backfill)", async () => {
    await persistGmailEmail("u1", rawEmail(), { linkedInboxAccountId: "acc-naver" });

    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0].data).toMatchObject({ linkedInboxAccountId: "acc-naver" });
  });

  it("never stamps null on update — the real primary-sync caller shape passes an explicit null", async () => {
    // This is the shape every production caller uses (email-sync passes
    // `linked?.id ?? null`): an update from the primary sync must not be able
    // to null out a linked row's provenance.
    await persistGmailEmail("u1", rawEmail(), {
      userEmail: "me@example.com",
      linkedInboxAccountId: null,
    });

    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0].data).not.toHaveProperty("linkedInboxAccountId");
  });
});
