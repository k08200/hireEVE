/**
 * syncNaverImap must go through the SHARED persist path (persistGmailEmail)
 * instead of its own raw upsert + inline judge (Phase 1 of the multi-provider
 * plan). That buys Naver mail everything the Gmail path already has: judge +
 * attention mirroring with PUSH interrupts, judge-health recording, commitment
 * mining, fromAddress normalization — and replaces the fragile "created in the
 * last 60s" is-new heuristic with the persist result's `isNew`.
 *
 * The IMAP roundtrip is faked (no public Naver sandbox); persistGmailEmail is
 * mocked at the module boundary and the test asserts the normalized
 * GmailRawEmail shape Naver hands it.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const imap = vi.hoisted(() => ({
  connect: vi.fn(),
  getMailboxLock: vi.fn(),
  logout: vi.fn(),
  status: vi.fn(),
  fetch: vi.fn(),
}));

class FakeImapFlow {
  connect = imap.connect;
  getMailboxLock = imap.getMailboxLock;
  logout = imap.logout;
  status = imap.status;
  fetch = imap.fetch;
}

vi.mock("imapflow", () => ({ ImapFlow: FakeImapFlow }));

const persistGmailEmail = vi.hoisted(() => vi.fn());
const judgeEmail = vi.hoisted(() => vi.fn());

vi.mock("../judge/email-firewall.js", () => ({ persistGmailEmail }));
vi.mock("../judge/poc-judge.js", () => ({ judgeEmail }));
vi.mock("../db.js", () => ({ prisma: {}, db: {} }));
vi.mock("../sentry.js", () => ({ captureError: vi.fn() }));

const { syncNaverImap } = await import("../mail/naver-imap.js");

const RECEIVED = new Date("2026-08-01T09:00:00Z");

function fakeMessages() {
  return [
    {
      uid: 101,
      envelope: {
        from: [{ name: "Kim", address: "kim@example.com" }],
        to: [{ name: "", address: "me@naver.com" }],
        cc: null,
        subject: "회의 일정",
        date: RECEIVED,
      },
      flags: new Set<string>(),
      bodyParts: new Map([["text", Buffer.from("Hello   world")]]),
    },
    {
      uid: 102,
      envelope: {
        from: [{ name: "", address: "news@letter.com" }],
        to: [{ name: "", address: "me@naver.com" }],
        cc: [{ name: "", address: "cc@x.com" }],
        subject: "Weekly digest",
        date: RECEIVED,
      },
      flags: new Set(["\\Seen", "\\Flagged"]),
      bodyParts: new Map(),
    },
  ];
}

function armImap() {
  imap.connect.mockResolvedValue(undefined);
  imap.getMailboxLock.mockResolvedValue({ release: () => {} });
  imap.logout.mockResolvedValue(undefined);
  imap.status.mockResolvedValue({ messages: 2 });
  imap.fetch.mockImplementation(async function* () {
    for (const m of fakeMessages()) yield m;
  });
}

describe("syncNaverImap → shared persist path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    armImap();
  });

  it("hands each message to persistGmailEmail as a normalized raw email", async () => {
    persistGmailEmail
      .mockResolvedValueOnce({ emailId: "e1", isNew: true })
      .mockResolvedValueOnce({ emailId: "e2", isNew: false });

    const result = await syncNaverImap({
      userId: "u1",
      email: "me@naver.com",
      password: "app-pw",
      host: "imap.naver.com:993",
      linkedInboxAccountId: "acc-naver",
    });

    expect(persistGmailEmail).toHaveBeenCalledTimes(2);

    expect(persistGmailEmail).toHaveBeenNthCalledWith(
      1,
      "u1",
      expect.objectContaining({
        gmailId: "naver-imap:me@naver.com:101",
        threadId: null,
        from: "Kim <kim@example.com>",
        to: "me@naver.com",
        subject: "회의 일정",
        snippet: "Hello world",
        body: "Hello   world",
        labels: ["INBOX", "UNREAD"],
        isRead: false,
        isStarred: false,
        receivedAt: RECEIVED,
        attachments: [],
      }),
      expect.objectContaining({ linkedInboxAccountId: "acc-naver" }),
    );

    expect(persistGmailEmail).toHaveBeenNthCalledWith(
      2,
      "u1",
      expect.objectContaining({
        gmailId: "naver-imap:me@naver.com:102",
        labels: ["INBOX", "IMPORTANT"],
        isRead: true,
        isStarred: true,
      }),
      expect.objectContaining({ linkedInboxAccountId: "acc-naver" }),
    );

    // isNew from the persist result replaces the 60s createdAt heuristic.
    expect(result).toEqual({ fetched: 2, inserted: 1, classified: 1, errors: 0 });

    // The inline judge is gone — classification happens inside the shared
    // persist path, exactly like Gmail ingestion.
    expect(judgeEmail).not.toHaveBeenCalled();
  });

  it("counts a persist failure as an error and keeps the loop going", async () => {
    persistGmailEmail
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValueOnce({ emailId: "e2", isNew: true });

    const result = await syncNaverImap({
      userId: "u1",
      email: "me@naver.com",
      password: "app-pw",
      host: "imap.naver.com:993",
    });

    expect(result).toEqual({ fetched: 2, inserted: 1, classified: 1, errors: 1 });
  });
});
