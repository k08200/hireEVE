/**
 * Phase 3B: Graph delta ingestion → shared persist path. fetch is mocked
 * (no Graph sandbox); these pin the delta paging/cursor model, the
 * `outlook:` dedup prefix, the two load-bearing Prefer headers, label
 * mapping, @removed skipping, the cursor SSRF guard, and the auth/throttle
 * stop conditions.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const persistGmailEmail = vi.hoisted(() => vi.fn());
vi.mock("../judge/email-firewall.js", () => ({ persistGmailEmail }));
vi.mock("../sentry.js", () => ({ captureError: vi.fn() }));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const { syncOutlookInbox } = await import("../mail/outlook-sync.js");

const GRAPH = "https://graph.microsoft.com";

function graphMessage(over: Record<string, unknown> = {}) {
  return {
    id: "AAMkAGI2-immutable-1",
    subject: "회의 일정",
    from: { emailAddress: { name: "Kim", address: "kim@example.com" } },
    toRecipients: [{ emailAddress: { name: "", address: "me@outlook.com" } }],
    ccRecipients: [],
    receivedDateTime: "2026-08-01T09:00:00Z",
    bodyPreview: "Hello world",
    isRead: false,
    flag: { flagStatus: "notFlagged" },
    body: { content: "Hello world, full body" },
    ...over,
  };
}

function pageResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}

function baseArgs(over: Record<string, unknown> = {}) {
  return {
    userId: "u1",
    email: "me@outlook.com",
    accessToken: "bearer-at",
    linkedInboxAccountId: "acc-outlook",
    cursor: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  persistGmailEmail.mockResolvedValue({ emailId: "e", isNew: true });
});

describe("syncOutlookInbox", () => {
  it("persists each message with the outlook: prefix and mapped labels", async () => {
    fetchMock.mockResolvedValueOnce(
      pageResponse({
        value: [
          graphMessage(),
          graphMessage({
            id: "imm-2",
            isRead: true,
            flag: { flagStatus: "flagged" },
            subject: null,
          }),
        ],
        "@odata.deltaLink": `${GRAPH}/v1.0/me/delta?token=abc`,
      }),
    );

    const result = await syncOutlookInbox(baseArgs());

    expect(persistGmailEmail).toHaveBeenNthCalledWith(
      1,
      "u1",
      expect.objectContaining({
        gmailId: "outlook:me@outlook.com:AAMkAGI2-immutable-1",
        from: "Kim <kim@example.com>",
        to: "me@outlook.com",
        subject: "회의 일정",
        snippet: "Hello world",
        body: "Hello world, full body",
        labels: ["INBOX", "UNREAD"],
        isRead: false,
        isStarred: false,
        receivedAt: new Date("2026-08-01T09:00:00Z"),
      }),
      expect.objectContaining({ linkedInboxAccountId: "acc-outlook", userEmail: "me@outlook.com" }),
    );
    expect(persistGmailEmail).toHaveBeenNthCalledWith(
      2,
      "u1",
      expect.objectContaining({
        gmailId: "outlook:me@outlook.com:imm-2",
        subject: "(no subject)",
        labels: ["INBOX", "IMPORTANT"],
        isRead: true,
        isStarred: true,
      }),
      expect.anything(),
    );
    expect(result).toMatchObject({
      fetched: 2,
      inserted: 2,
      errors: 0,
      authFailed: false,
      cursor: `${GRAPH}/v1.0/me/delta?token=abc`,
    });
  });

  it("sends both load-bearing Prefer headers (ImmutableId + text bodies)", async () => {
    fetchMock.mockResolvedValueOnce(pageResponse({ value: [] }));
    await syncOutlookInbox(baseArgs());
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Prefer).toBe('IdType="ImmutableId", outlook.body-content-type="text"');
    expect(init.headers.authorization).toBe("Bearer bearer-at");
  });

  it("follows nextLink pages and returns the deltaLink as the cursor", async () => {
    fetchMock
      .mockResolvedValueOnce(
        pageResponse({
          value: [graphMessage()],
          "@odata.nextLink": `${GRAPH}/v1.0/me/delta?skip=1`,
        }),
      )
      .mockResolvedValueOnce(
        pageResponse({
          value: [graphMessage({ id: "imm-2" })],
          "@odata.deltaLink": `${GRAPH}/v1.0/me/delta?token=final`,
        }),
      );
    const result = await syncOutlookInbox(baseArgs());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(`${GRAPH}/v1.0/me/delta?skip=1`);
    expect(result.cursor).toBe(`${GRAPH}/v1.0/me/delta?token=final`);
    expect(result.fetched).toBe(2);
  });

  it("stops at the page cap and hands back the pending nextLink for resumption", async () => {
    fetchMock.mockResolvedValue(
      pageResponse({
        value: [graphMessage()],
        "@odata.nextLink": `${GRAPH}/v1.0/me/delta?more`,
      }),
    );
    const result = await syncOutlookInbox(baseArgs({ maxPages: 2 }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.cursor).toBe(`${GRAPH}/v1.0/me/delta?more`);
  });

  it("resumes from a stored graph.microsoft.com cursor, but never a foreign URL", async () => {
    fetchMock.mockResolvedValue(pageResponse({ value: [] }));
    await syncOutlookInbox(baseArgs({ cursor: `${GRAPH}/v1.0/me/delta?token=stored` }));
    expect(fetchMock.mock.calls[0][0]).toBe(`${GRAPH}/v1.0/me/delta?token=stored`);

    fetchMock.mockClear();
    fetchMock.mockResolvedValue(pageResponse({ value: [] }));
    // A tampered row must not point the bearer token at an attacker host.
    await syncOutlookInbox(baseArgs({ cursor: "https://evil.example.com/steal" }));
    expect(String(fetchMock.mock.calls[0][0]).startsWith(`${GRAPH}/v1.0/me/mailFolders`)).toBe(
      true,
    );
  });

  it("skips @removed entries without persisting", async () => {
    fetchMock.mockResolvedValueOnce(
      pageResponse({
        value: [{ id: "gone-1", "@removed": { reason: "deleted" } }, graphMessage()],
        "@odata.deltaLink": `${GRAPH}/v1.0/me/delta?token=x`,
      }),
    );
    const result = await syncOutlookInbox(baseArgs());
    expect(persistGmailEmail).toHaveBeenCalledTimes(1);
    expect(result.fetched).toBe(1);
  });

  it("flags authFailed on 401 without advancing the cursor", async () => {
    fetchMock.mockResolvedValueOnce(pageResponse({}, 401));
    const result = await syncOutlookInbox(baseArgs());
    expect(result.authFailed).toBe(true);
    expect(result.cursor).toBeNull();
    expect(persistGmailEmail).not.toHaveBeenCalled();
  });

  it("stops on 429 throttling, keeping the cursor for a same-place retry", async () => {
    fetchMock.mockResolvedValueOnce(pageResponse({}, 429));
    const result = await syncOutlookInbox(baseArgs());
    expect(result.errors).toBe(1);
    expect(result.cursor).toBeNull();
  });

  it("falls back to now() on a malformed receivedDateTime instead of dropping the email", async () => {
    fetchMock.mockResolvedValueOnce(
      pageResponse({
        value: [graphMessage({ receivedDateTime: "not-a-date" })],
        "@odata.deltaLink": `${GRAPH}/v1.0/me/delta?token=x`,
      }),
    );
    await syncOutlookInbox(baseArgs());
    const [, raw] = persistGmailEmail.mock.calls[0];
    expect(Number.isNaN(raw.receivedAt.getTime())).toBe(false);
  });

  it("counts a persist failure and keeps the loop going", async () => {
    persistGmailEmail
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValueOnce({ emailId: "e2", isNew: true });
    fetchMock.mockResolvedValueOnce(
      pageResponse({
        value: [graphMessage(), graphMessage({ id: "imm-2" })],
        "@odata.deltaLink": `${GRAPH}/v1.0/me/delta?token=x`,
      }),
    );
    const result = await syncOutlookInbox(baseArgs());
    expect(result).toMatchObject({ fetched: 2, inserted: 1, errors: 1 });
  });
});
