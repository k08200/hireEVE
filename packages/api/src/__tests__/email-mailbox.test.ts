/**
 * Mailbox listing — the Sent / Drafts / Archived folders every mail client
 * has and Klorn didn't (desktop shell restructure, 2026-08-26). The local
 * mirror is INBOX-only by design, so these are LIVE Gmail queries. Focus:
 * the box→query mapping (archived is a negative-space query and easy to get
 * wrong), metadata-only listing (no bodies, no attachment bytes), and the
 * route's demo/no-token fallback.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildMailboxQuery, MAILBOXES } from "../mail/gmail-mailbox.js";

const state = vi.hoisted(() => ({
  listCalls: [] as Record<string, unknown>[],
  metaCalls: [] as Record<string, unknown>[],
  listIds: ["m1", "m2"],
  hasToken: true,
  draftRows: [
    { id: "draft-1", message: { id: "m-draft-1" } },
    { id: "draft-2", message: { id: "m-draft-2" } },
  ],
  draftDeletes: [] as string[],
}));

vi.mock("../mail/gmail.js", () => ({
  getAuthedClient: vi.fn(async () => (state.hasToken ? {} : null)),
}));

vi.mock("googleapis", () => ({
  google: {
    gmail: vi.fn(() => ({
      users: {
        messages: {
          list: vi.fn(async (params: Record<string, unknown>) => {
            state.listCalls.push(params);
            return { data: { messages: state.listIds.map((id) => ({ id })) } };
          }),
          get: vi.fn(async (params: Record<string, unknown>) => {
            state.metaCalls.push(params);
            return {
              data: {
                id: params.id,
                threadId: `t-${params.id}`,
                snippet: `snippet ${params.id}`,
                labelIds: ["SENT"],
                internalDate: "1756100000000",
                payload: {
                  headers: [
                    { name: "From", value: "me@klorn.ai" },
                    { name: "To", value: "you@example.com" },
                    { name: "Subject", value: `Subject ${params.id}` },
                    { name: "Date", value: "Tue, 26 Aug 2026 09:00:00 +0900" },
                  ],
                },
              },
            };
          }),
        },
        drafts: {
          list: vi.fn(async () => ({ data: { drafts: state.draftRows } })),
          delete: vi.fn(async (params: { id: string }) => {
            state.draftDeletes.push(params.id);
            return {};
          }),
        },
      },
    })),
    auth: { OAuth2: class {} },
  },
}));

describe("buildMailboxQuery", () => {
  it("maps each box to a Gmail search that cannot leak other folders", () => {
    expect(buildMailboxQuery("sent")).toBe("in:sent");
    expect(buildMailboxQuery("drafts")).toBe("in:draft");
    // Archived is negative space: everything that is in no folder at all.
    // Each exclusion matters — dropping -in:trash resurfaces deleted mail.
    expect(buildMailboxQuery("archived")).toBe(
      "-in:inbox -in:sent -in:draft -in:trash -in:spam -in:chats",
    );
  });

  it("MAILBOXES enumerates exactly the boxes the route accepts", () => {
    expect(MAILBOXES).toEqual(["sent", "drafts", "archived"]);
  });
});

describe("listGmailMailbox", () => {
  beforeEach(() => {
    state.listCalls.length = 0;
    state.metaCalls.length = 0;
    state.listIds = ["m1", "m2"];
    state.hasToken = true;
  });

  it("lists metadata-only — never bodies, never attachment bytes", async () => {
    const { listGmailMailbox } = await import("../mail/gmail-mailbox.js");
    const items = await listGmailMailbox("user-1", "sent");

    expect(state.listCalls).toHaveLength(1);
    expect(state.listCalls[0]).toMatchObject({ userId: "me", q: "in:sent" });
    // format=metadata is the contract: a 50-row folder list must not download
    // 50 full MIME trees. The metadata headers are the four the row renders.
    for (const call of state.metaCalls) {
      expect(call.format).toBe("metadata");
      expect(call.metadataHeaders).toEqual(["From", "To", "Subject", "Date"]);
    }
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      gmailId: "m1",
      threadId: "t-m1",
      subject: "Subject m1",
      from: "me@klorn.ai",
      to: "you@example.com",
      snippet: "snippet m1",
      isRead: true,
    });
    // internalDate (epoch ms) is the arrival authority, not the Date header.
    expect(items[0].receivedAt).toBe(new Date(1756100000000).toISOString());
  });

  it("returns null when Gmail is not connected (route falls back to demo)", async () => {
    state.hasToken = false;
    const { listGmailMailbox } = await import("../mail/gmail-mailbox.js");
    expect(await listGmailMailbox("user-1", "sent")).toBeNull();
  });
});

describe("deleteGmailDraftByMessageId", () => {
  beforeEach(() => {
    state.hasToken = true;
    state.draftDeletes.length = 0;
  });

  it("resolves the DRAFT id from the message id and deletes exactly that draft", async () => {
    const { deleteGmailDraftByMessageId } = await import("../mail/gmail-mailbox.js");
    // The folder listing hands out MESSAGE ids; drafts.delete wants the DRAFT
    // id — deleting with the message id silently 404s and the draft lingers.
    expect(await deleteGmailDraftByMessageId("user-1", "m-draft-2")).toBe(true);
    expect(state.draftDeletes).toEqual(["draft-2"]);
  });

  it("returns false and deletes nothing for an unknown message id", async () => {
    const { deleteGmailDraftByMessageId } = await import("../mail/gmail-mailbox.js");
    expect(await deleteGmailDraftByMessageId("user-1", "not-a-draft")).toBe(false);
    expect(state.draftDeletes).toEqual([]);
  });

  it("returns false when Gmail is not connected", async () => {
    state.hasToken = false;
    const { deleteGmailDraftByMessageId } = await import("../mail/gmail-mailbox.js");
    expect(await deleteGmailDraftByMessageId("user-1", "m-draft-1")).toBe(false);
  });
});
