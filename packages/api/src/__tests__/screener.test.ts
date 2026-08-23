/**
 * Screener (first-contact gate) unit tests.
 *
 * The screener does NOT add a sixth lane and does not hold mail. It notices
 * senders you have never heard from, lets you make one permanent call, and
 * writes a BLOCK into the pin ladder the judge already honours at rank 0.
 *
 * Prisma is mocked at the db.js boundary (repo convention); no real DB.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const emailCount = vi.hoisted(() => vi.fn());
const emailGroupBy = vi.hoisted(() => vi.fn());
const decisionFindUnique = vi.hoisted(() => vi.fn());
const decisionFindMany = vi.hoisted(() => vi.fn());
const decisionUpsert = vi.hoisted(() => vi.fn());
const ruleCreate = vi.hoisted(() => vi.fn());
const ruleDeleteMany = vi.hoisted(() => vi.fn());

vi.mock("../db.js", () => ({
  db: {
    emailMessage: { count: emailCount, groupBy: emailGroupBy },
    screenerDecision: {
      findUnique: decisionFindUnique,
      findMany: decisionFindMany,
      upsert: decisionUpsert,
    },
    emailRule: { create: ruleCreate, deleteMany: ruleDeleteMany },
  },
  prisma: {},
}));

vi.mock("../sentry.js", () => ({ captureError: vi.fn() }));

import {
  isFirstContact,
  isScreenerEnabled,
  listPendingScreener,
  recordScreenerDecision,
  screenerVerdictFor,
} from "../judge/screener.js";

const USER = "user-1";

beforeEach(() => {
  vi.clearAllMocks();
  emailCount.mockResolvedValue(0);
  emailGroupBy.mockResolvedValue([]);
  decisionFindUnique.mockResolvedValue(null);
  decisionFindMany.mockResolvedValue([]);
  decisionUpsert.mockResolvedValue({});
  ruleCreate.mockResolvedValue({});
  ruleDeleteMany.mockResolvedValue({ count: 0 });
  process.env.SCREENER_ENABLED = "true";
});

describe("isScreenerEnabled", () => {
  it("is off unless the flag is exactly 'true'", () => {
    process.env.SCREENER_ENABLED = undefined as unknown as string;
    delete process.env.SCREENER_ENABLED;
    expect(isScreenerEnabled()).toBe(false);

    process.env.SCREENER_ENABLED = "1";
    expect(isScreenerEnabled()).toBe(false);

    process.env.SCREENER_ENABLED = "true";
    expect(isScreenerEnabled()).toBe(true);
  });
});

describe("isFirstContact", () => {
  it("is true when the sender has no earlier message", async () => {
    emailCount.mockResolvedValue(0);
    await expect(isFirstContact(USER, "New.Person@Example.com")).resolves.toBe(true);
  });

  it("is false once any earlier message exists", async () => {
    emailCount.mockResolvedValue(3);
    await expect(isFirstContact(USER, "known@example.com")).resolves.toBe(false);
  });

  it("normalises the address before querying, so casing cannot split a sender", async () => {
    await isFirstContact(USER, "  New.Person@EXAMPLE.com ");
    expect(emailCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: USER, fromAddress: "new.person@example.com" }),
      }),
    );
  });

  it("treats a blank address as known, never as a new contact to screen", async () => {
    await expect(isFirstContact(USER, "")).resolves.toBe(false);
    expect(emailCount).not.toHaveBeenCalled();
  });

  it("fails open — a DB error must not turn every sender into a first contact", async () => {
    emailCount.mockRejectedValue(new Error("db down"));
    await expect(isFirstContact(USER, "someone@example.com")).resolves.toBe(false);
  });
});

describe("screenerVerdictFor", () => {
  it("returns the stored verdict", async () => {
    decisionFindUnique.mockResolvedValue({ verdict: "BLOCK" });
    await expect(screenerVerdictFor(USER, "spam@example.com")).resolves.toBe("BLOCK");
  });

  it("returns null when the sender has never been screened", async () => {
    await expect(screenerVerdictFor(USER, "nobody@example.com")).resolves.toBeNull();
  });

  it("fails open to null on a DB error", async () => {
    decisionFindUnique.mockRejectedValue(new Error("db down"));
    await expect(screenerVerdictFor(USER, "x@example.com")).resolves.toBeNull();
  });
});

describe("recordScreenerDecision", () => {
  it("BLOCK writes a PIN_TIER -> SILENT rule, so the existing rank-0 ladder enforces it", async () => {
    await recordScreenerDecision(USER, "Spam@Example.com", "BLOCK");

    expect(ruleCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: USER,
          actionType: "PIN_TIER",
          actionValue: "SILENT",
          isActive: true,
          conditions: { from: ["spam@example.com"] },
        }),
      }),
    );
  });

  it("BLOCK records the decision under the normalised address", async () => {
    await recordScreenerDecision(USER, "Spam@Example.com", "BLOCK");
    expect(decisionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_sender: { userId: USER, sender: "spam@example.com" } },
        create: expect.objectContaining({ sender: "spam@example.com", verdict: "BLOCK" }),
        update: expect.objectContaining({ verdict: "BLOCK" }),
      }),
    );
  });

  it("ALLOW records the decision but pins nothing — the classifier still decides the lane", async () => {
    await recordScreenerDecision(USER, "friend@example.com", "ALLOW");
    expect(decisionUpsert).toHaveBeenCalledTimes(1);
    expect(ruleCreate).not.toHaveBeenCalled();
  });

  it("re-deciding ALLOW after a BLOCK removes the pin it created", async () => {
    await recordScreenerDecision(USER, "friend@example.com", "ALLOW");
    expect(ruleDeleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: USER, actionType: "PIN_TIER" }),
      }),
    );
  });

  it("rejects a blank sender rather than writing a rule that matches nothing", async () => {
    await expect(recordScreenerDecision(USER, "   ", "BLOCK")).rejects.toThrow(/sender/i);
    expect(ruleCreate).not.toHaveBeenCalled();
    expect(decisionUpsert).not.toHaveBeenCalled();
  });
});

describe("listPendingScreener", () => {
  const recent = new Date("2026-08-20T00:00:00Z");

  it("returns undecided first-contact senders newest first", async () => {
    emailGroupBy.mockResolvedValue([
      { fromAddress: "a@example.com", _count: { _all: 1 }, _max: { receivedAt: recent } },
      {
        fromAddress: "b@example.com",
        _count: { _all: 2 },
        _max: { receivedAt: new Date("2026-08-22T00:00:00Z") },
      },
    ]);

    const pending = await listPendingScreener(USER);
    expect(pending.map((p) => p.sender)).toEqual(["b@example.com", "a@example.com"]);
    expect(pending[0]).toMatchObject({ sender: "b@example.com", messageCount: 2 });
  });

  it("drops senders that already have a decision", async () => {
    emailGroupBy.mockResolvedValue([
      { fromAddress: "decided@example.com", _count: { _all: 1 }, _max: { receivedAt: recent } },
      { fromAddress: "fresh@example.com", _count: { _all: 1 }, _max: { receivedAt: recent } },
    ]);
    decisionFindMany.mockResolvedValue([{ sender: "decided@example.com" }]);

    const pending = await listPendingScreener(USER);
    expect(pending.map((p) => p.sender)).toEqual(["fresh@example.com"]);
  });

  it("scopes the query by recency, so linking an inbox does not screen the whole backfill", async () => {
    await listPendingScreener(USER);
    const where = emailGroupBy.mock.calls[0][0].where;
    expect(where.receivedAt.gte).toBeInstanceOf(Date);
  });

  it("fails open to an empty list on a DB error", async () => {
    emailGroupBy.mockRejectedValue(new Error("db down"));
    await expect(listPendingScreener(USER)).resolves.toEqual([]);
  });
});
