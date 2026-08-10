/**
 * Attention aging sweep (judge/attention-aging.ts) — pins the conservative
 * policy: resolve acted-elsewhere EMAIL items (email gone or out of INBOX),
 * age out SILENT (14d) and QUEUE/null-tier (30d), and NEVER touch PUSH/AUTO
 * or non-EMAIL sources through the age path.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  attentionFindMany: vi.fn(),
  attentionUpdateMany: vi.fn(async () => ({ count: 0 })),
  emailFindMany: vi.fn(async () => []),
}));

vi.mock("../db.js", () => {
  const prisma = {
    attentionItem: { findMany: m.attentionFindMany, updateMany: m.attentionUpdateMany },
    emailMessage: { findMany: m.emailFindMany },
  };
  return { prisma, db: prisma };
});

const { sweepAttentionAging, SILENT_MAX_AGE_DAYS, QUEUE_MAX_AGE_DAYS } = await import(
  "../judge/attention-aging.js"
);

const NOW = new Date("2026-08-10T12:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(() => {
  vi.clearAllMocks();
  m.attentionFindMany.mockResolvedValue([]);
  m.attentionUpdateMany.mockResolvedValue({ count: 0 });
  m.emailFindMany.mockResolvedValue([]);
});

describe("sweepAttentionAging — acted elsewhere", () => {
  it("resolves items whose email vanished or left the INBOX; keeps live INBOX mail", async () => {
    m.attentionFindMany.mockResolvedValue([
      { id: "att-gone", userId: "u1", sourceId: "em-gone" },
      { id: "att-archived", userId: "u1", sourceId: "em-archived" },
      { id: "att-live", userId: "u1", sourceId: "em-live" },
    ]);
    m.emailFindMany.mockResolvedValue([
      { id: "em-archived", labels: ["ARCHIVE"] },
      { id: "em-live", labels: ["INBOX", "UNREAD"] },
    ]);
    m.attentionUpdateMany.mockResolvedValueOnce({ count: 2 });

    const result = await sweepAttentionAging(NOW);

    expect(m.attentionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["att-gone", "att-archived"] }, status: "OPEN" },
        data: { status: "RESOLVED", resolvedAt: NOW },
      }),
    );
    expect(result.resolvedActed).toBe(2);
  });

  it("only ever scans OPEN EMAIL items for the acted path", async () => {
    await sweepAttentionAging(NOW);
    expect(m.attentionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "OPEN", source: "EMAIL" } }),
    );
  });
});

describe("sweepAttentionAging — age-out", () => {
  it("ages SILENT after 14d and QUEUE + legacy null tier after 30d — nothing else", async () => {
    await sweepAttentionAging(NOW);

    const ageCalls = m.attentionUpdateMany.mock.calls.map((c) => c[0].where);
    expect(ageCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "OPEN",
          source: "EMAIL",
          tier: "SILENT",
          surfacedAt: { lt: new Date(NOW.getTime() - SILENT_MAX_AGE_DAYS * DAY_MS) },
        }),
        expect.objectContaining({
          status: "OPEN",
          source: "EMAIL",
          tier: { in: ["QUEUE"] },
          surfacedAt: { lt: new Date(NOW.getTime() - QUEUE_MAX_AGE_DAYS * DAY_MS) },
        }),
        expect.objectContaining({
          status: "OPEN",
          source: "EMAIL",
          tier: null,
          surfacedAt: { lt: new Date(NOW.getTime() - QUEUE_MAX_AGE_DAYS * DAY_MS) },
        }),
      ]),
    );
    // PUSH/AUTO must never appear in any age-out where clause.
    for (const where of ageCalls) {
      expect(where.tier === "PUSH" || where.tier === "AUTO").toBe(false);
    }
  });

  it("aggregates aged counts across the three lanes", async () => {
    m.attentionUpdateMany
      .mockResolvedValueOnce({ count: 5 }) // silent
      .mockResolvedValueOnce({ count: 3 }) // queue
      .mockResolvedValueOnce({ count: 2 }); // null tier
    const result = await sweepAttentionAging(NOW);
    expect(result.resolvedAged).toBe(10);
    expect(result.resolvedActed).toBe(0);
  });
});
