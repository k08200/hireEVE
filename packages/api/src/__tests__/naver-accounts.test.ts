/**
 * Phase 0b: Naver lives in LinkedInboxAccount (provider NAVER), not on four
 * User columns — which makes it multi-account. These tests pin the
 * table-backed sync fan-out: every NAVER row syncs with its own decrypted
 * credentials and its own row id (provenance on EmailMessage), a bad host is
 * skipped by the SSRF allowlist re-check, one account's failure never blocks
 * the next, and success stamps lastSyncedAt like the Gmail path does.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  findMany: vi.fn(),
  updateMany: vi.fn(async () => ({ count: 1 })),
  syncNaverImap: vi.fn(async () => ({ fetched: 2, inserted: 1, classified: 1, errors: 0 })),
  isAllowedImapHost: vi.fn(() => true),
}));

vi.mock("../db.js", () => {
  const prisma = {
    linkedInboxAccount: { findMany: m.findMany, updateMany: m.updateMany },
  };
  return { prisma, db: prisma };
});
vi.mock("../crypto-tokens.js", () => ({
  decryptToken: vi.fn((cipher: string) => `plain:${cipher}`),
}));
vi.mock("../mail/is-allowed-imap-host.js", () => ({
  isAllowedImapHost: m.isAllowedImapHost,
}));
vi.mock("../mail/naver-imap.js", () => ({
  syncNaverImap: m.syncNaverImap,
}));

function naverRow(over: Record<string, unknown> = {}) {
  return {
    id: "row-1",
    userId: "u1",
    provider: "NAVER",
    email: "a@naver.com",
    imapHost: "imap.naver.com:993",
    imapPasswordCipher: "cipher-1",
    needsReconnect: false,
    ...over,
  };
}

describe("syncNaverAccountsForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.updateMany.mockResolvedValue({ count: 1 });
    m.syncNaverImap.mockResolvedValue({ fetched: 2, inserted: 1, classified: 1, errors: 0 });
    m.isAllowedImapHost.mockReturnValue(true);
  });

  it("returns null when the user has no NAVER rows", async () => {
    m.findMany.mockResolvedValue([]);
    const { syncNaverAccountsForUser } = await import("../mail/naver-accounts.js");
    expect(await syncNaverAccountsForUser("u1")).toBeNull();
    expect(m.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "u1", provider: "NAVER" }),
      }),
    );
  });

  it("syncs each NAVER row with its own decrypted password and row id", async () => {
    m.findMany.mockResolvedValue([
      naverRow(),
      naverRow({ id: "row-2", email: "b@naver.com", imapPasswordCipher: "cipher-2" }),
    ]);
    const { syncNaverAccountsForUser } = await import("../mail/naver-accounts.js");
    const result = await syncNaverAccountsForUser("u1");
    expect(m.syncNaverImap).toHaveBeenCalledTimes(2);
    expect(m.syncNaverImap).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        email: "a@naver.com",
        password: "plain:cipher-1",
        host: "imap.naver.com:993",
        linkedInboxAccountId: "row-1",
      }),
    );
    expect(m.syncNaverImap).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "b@naver.com",
        password: "plain:cipher-2",
        linkedInboxAccountId: "row-2",
      }),
    );
    expect(result).toEqual({ fetched: 4, inserted: 2, classified: 2, errors: 0 });
  });

  it("re-checks the SSRF allowlist per row and skips a disallowed host", async () => {
    m.isAllowedImapHost.mockImplementation((h: string) => h === "imap.naver.com:993");
    m.findMany.mockResolvedValue([
      naverRow({ id: "bad", imapHost: "evil.internal:993" }),
      naverRow({ id: "good" }),
    ]);
    const { syncNaverAccountsForUser } = await import("../mail/naver-accounts.js");
    await syncNaverAccountsForUser("u1");
    expect(m.syncNaverImap).toHaveBeenCalledTimes(1);
    expect(m.syncNaverImap).toHaveBeenCalledWith(
      expect.objectContaining({ linkedInboxAccountId: "good" }),
    );
  });

  it("a row with missing IMAP credentials is skipped, not thrown", async () => {
    m.findMany.mockResolvedValue([naverRow({ imapPasswordCipher: null }), naverRow({ id: "ok" })]);
    const { syncNaverAccountsForUser } = await import("../mail/naver-accounts.js");
    await syncNaverAccountsForUser("u1");
    expect(m.syncNaverImap).toHaveBeenCalledTimes(1);
  });

  it("one account failing does not block the next, and errors aggregate", async () => {
    m.findMany.mockResolvedValue([naverRow(), naverRow({ id: "row-2", email: "b@naver.com" })]);
    m.syncNaverImap
      .mockRejectedValueOnce(new Error("imap down"))
      .mockResolvedValueOnce({ fetched: 1, inserted: 1, classified: 1, errors: 0 });
    const { syncNaverAccountsForUser } = await import("../mail/naver-accounts.js");
    const result = await syncNaverAccountsForUser("u1");
    expect(m.syncNaverImap).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ fetched: 1, inserted: 1, classified: 1, errors: 1 });
  });

  it("stamps lastSyncedAt on the synced row, scoped by id AND userId", async () => {
    m.findMany.mockResolvedValue([naverRow()]);
    const { syncNaverAccountsForUser } = await import("../mail/naver-accounts.js");
    await syncNaverAccountsForUser("u1");
    expect(m.updateMany).toHaveBeenCalledWith({
      where: { id: "row-1", userId: "u1" },
      data: { lastSyncedAt: expect.any(Date) },
    });
  });
});
