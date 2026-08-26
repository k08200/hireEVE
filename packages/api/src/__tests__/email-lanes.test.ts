/**
 * listLaneTiersByEmail — the batched AttentionItem→tier join behind the mail
 * list's lane chips. Chips are observability, not control flow: retired v1
 * vocabulary must never reach the wire (AUTO folds to QUEUE, CALL to PUSH via
 * normalizeTier), and a lookup failure degrades to "no chips", never a 500.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.hoisted(() => vi.fn(async () => [] as unknown[]));
const captureError = vi.hoisted(() => vi.fn());

vi.mock("../db.js", () => {
  const prisma = { attentionItem: { findMany } };
  return { prisma, db: prisma };
});
vi.mock("../sentry.js", () => ({ captureError }));

import { listLaneTiersByEmail } from "../judge/email-lanes.js";

beforeEach(() => {
  findMany.mockReset();
  findMany.mockResolvedValue([]);
  captureError.mockClear();
});

describe("listLaneTiersByEmail", () => {
  it("maps email ids to their normalized lane", async () => {
    findMany.mockResolvedValue([
      { sourceId: "e1", tier: "PUSH" },
      { sourceId: "e2", tier: "SILENT" },
    ]);
    const map = await listLaneTiersByEmail("u1", ["e1", "e2", "e3"]);
    expect(map.get("e1")).toBe("PUSH");
    expect(map.get("e2")).toBe("SILENT");
    expect(map.has("e3")).toBe(false);
  });

  it("scopes the query to the user and EMAIL source", async () => {
    await listLaneTiersByEmail("u1", ["e1"]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "u1",
          source: "EMAIL",
          sourceId: { in: ["e1"] },
        }),
      }),
    );
  });

  it("folds the retired AUTO lane to QUEUE — never on the wire", async () => {
    findMany.mockResolvedValue([{ sourceId: "e1", tier: "AUTO" }]);
    const map = await listLaneTiersByEmail("u1", ["e1"]);
    expect(map.get("e1")).toBe("QUEUE");
  });

  it("folds the retired CALL lane to PUSH (normalizeTier)", async () => {
    findMany.mockResolvedValue([{ sourceId: "e1", tier: "CALL" }]);
    const map = await listLaneTiersByEmail("u1", ["e1"]);
    expect(map.get("e1")).toBe("PUSH");
  });

  it("skips the query entirely for an empty page", async () => {
    const map = await listLaneTiersByEmail("u1", []);
    expect(map.size).toBe(0);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("fails open: a lookup error yields no chips, not a thrown list", async () => {
    findMany.mockRejectedValue(new Error("db down"));
    const map = await listLaneTiersByEmail("u1", ["e1"]);
    expect(map.size).toBe(0);
    expect(captureError).toHaveBeenCalledTimes(1);
  });
});
