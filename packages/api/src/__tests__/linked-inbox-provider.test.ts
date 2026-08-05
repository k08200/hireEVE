/**
 * Guard for the single-item delete/archive routes (Phase 0b review finding):
 * a NAVER-sourced EmailMessage now carries its LinkedInboxAccount id, and the
 * Gmail action path resolves that id provider-scoped → null → the routes'
 * "Gmail not connected, remove locally" fallback fired — a false 200 whose
 * local delete the next poll resurrects. The routes must refuse instead:
 * this helper answers "does this id belong to a non-Google (IMAP) inbox?".
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ findFirst: vi.fn() }));

vi.mock("../db.js", () => {
  const prisma = { linkedInboxAccount: { findFirst: m.findFirst } };
  return { prisma, db: prisma };
});

describe("isNonGoogleLinkedInbox", () => {
  beforeEach(() => vi.clearAllMocks());

  it("false for a null id — primary-account mail is always actionable", async () => {
    const { isNonGoogleLinkedInbox } = await import("../mail/linked-inbox-provider.js");
    expect(await isNonGoogleLinkedInbox("u1", null)).toBe(false);
    expect(m.findFirst).not.toHaveBeenCalled();
  });

  it("false for a GOOGLE row", async () => {
    m.findFirst.mockResolvedValue({ provider: "GOOGLE" });
    const { isNonGoogleLinkedInbox } = await import("../mail/linked-inbox-provider.js");
    expect(await isNonGoogleLinkedInbox("u1", "row-1")).toBe(false);
    expect(m.findFirst).toHaveBeenCalledWith({
      where: { id: "row-1", userId: "u1" },
      select: { provider: true },
    });
  });

  it("true for a NAVER row", async () => {
    m.findFirst.mockResolvedValue({ provider: "NAVER" });
    const { isNonGoogleLinkedInbox } = await import("../mail/linked-inbox-provider.js");
    expect(await isNonGoogleLinkedInbox("u1", "row-1")).toBe(true);
  });

  it("false when the row is gone — the caller's normal not-connected path handles it", async () => {
    m.findFirst.mockResolvedValue(null);
    const { isNonGoogleLinkedInbox } = await import("../mail/linked-inbox-provider.js");
    expect(await isNonGoogleLinkedInbox("u1", "row-x")).toBe(false);
  });
});
