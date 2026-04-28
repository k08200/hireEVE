import { beforeEach, describe, expect, it, vi } from "vitest";

const upsertSpy = vi.fn(async () => ({}));
const updateManySpy = vi.fn(async () => ({ count: 0 }));
const deleteManySpy = vi.fn(async () => ({ count: 0 }));

vi.mock("../db.js", () => {
  const prisma = {
    attentionItem: {
      upsert: upsertSpy,
      updateMany: updateManySpy,
      deleteMany: deleteManySpy,
    },
  };
  return { prisma, db: prisma };
});

const {
  upsertAttentionForPendingAction,
  bulkResolveAttentionForPendingActions,
  deleteAttentionForPendingActions,
} = await import("../attention-mirror.js");

beforeEach(() => {
  upsertSpy.mockClear();
  updateManySpy.mockClear();
  deleteManySpy.mockClear();
});

describe("upsertAttentionForPendingAction", () => {
  it("creates an OPEN AttentionItem for a freshly PENDING action", async () => {
    await upsertAttentionForPendingAction({
      id: "pa-1",
      userId: "user-1",
      toolName: "send_email",
      status: "PENDING",
      reasoning: "Reply needed for Sarah",
    });

    expect(upsertSpy).toHaveBeenCalledOnce();
    const call = upsertSpy.mock.calls[0]?.[0] as {
      where: { source_sourceId: { source: string; sourceId: string } };
      create: { status: string; resolvedAt: Date | null; title: string };
      update: { status: string; resolvedAt: Date | null };
    };
    expect(call.where.source_sourceId).toEqual({ source: "PENDING_ACTION", sourceId: "pa-1" });
    expect(call.create.status).toBe("OPEN");
    expect(call.create.resolvedAt).toBeNull();
    expect(call.create.title).toBe("Reply needed for Sarah");
  });

  it("marks the AttentionItem RESOLVED when the PA reaches EXECUTED", async () => {
    await upsertAttentionForPendingAction({
      id: "pa-2",
      userId: "user-1",
      toolName: "send_email",
      status: "EXECUTED",
      reasoning: null,
    });

    const call = upsertSpy.mock.calls[0]?.[0] as {
      update: { status: string; resolvedAt: Date | null };
    };
    expect(call.update.status).toBe("RESOLVED");
    expect(call.update.resolvedAt).toBeInstanceOf(Date);
  });

  it("marks the AttentionItem DISMISSED when the PA is REJECTED", async () => {
    await upsertAttentionForPendingAction({
      id: "pa-3",
      userId: "user-1",
      toolName: "send_email",
      status: "REJECTED",
      reasoning: "User declined",
    });

    const call = upsertSpy.mock.calls[0]?.[0] as { update: { status: string } };
    expect(call.update.status).toBe("DISMISSED");
  });

  it("falls back to a humanised tool name when reasoning is missing", async () => {
    await upsertAttentionForPendingAction({
      id: "pa-4",
      userId: "user-1",
      toolName: "create_task",
      status: "PENDING",
      reasoning: null,
    });

    const call = upsertSpy.mock.calls[0]?.[0] as { create: { title: string } };
    expect(call.create.title).toBe("create task");
  });

  it("truncates very long reasoning into a usable title", async () => {
    const longReason = "x".repeat(500);
    await upsertAttentionForPendingAction({
      id: "pa-5",
      userId: "user-1",
      toolName: "send_email",
      status: "PENDING",
      reasoning: longReason,
    });

    const call = upsertSpy.mock.calls[0]?.[0] as { create: { title: string } };
    expect(call.create.title.length).toBeLessThanOrEqual(120);
    expect(call.create.title.endsWith("…")).toBe(true);
  });

  it("never throws even when prisma rejects", async () => {
    upsertSpy.mockRejectedValueOnce(new Error("db down"));
    await expect(
      upsertAttentionForPendingAction({
        id: "pa-6",
        userId: "user-1",
        toolName: "send_email",
        status: "PENDING",
        reasoning: null,
      }),
    ).resolves.toBeUndefined();
  });
});

describe("bulkResolveAttentionForPendingActions", () => {
  it("noops on an empty id list", async () => {
    await bulkResolveAttentionForPendingActions([], "REJECTED");
    expect(updateManySpy).not.toHaveBeenCalled();
  });

  it("maps the final PA status onto the AttentionItem status enum", async () => {
    await bulkResolveAttentionForPendingActions(["a", "b"], "EXECUTED");
    const call = updateManySpy.mock.calls[0]?.[0] as {
      where: { sourceId: { in: string[] } };
      data: { status: string };
    };
    expect(call.where.sourceId.in).toEqual(["a", "b"]);
    expect(call.data.status).toBe("RESOLVED");
  });
});

describe("deleteAttentionForPendingActions", () => {
  it("noops on an empty id list", async () => {
    await deleteAttentionForPendingActions([]);
    expect(deleteManySpy).not.toHaveBeenCalled();
  });

  it("deletes by (source, sourceId) for the given pending action ids", async () => {
    await deleteAttentionForPendingActions(["a", "b", "c"]);
    const call = deleteManySpy.mock.calls[0]?.[0] as {
      where: { source: string; sourceId: { in: string[] } };
    };
    expect(call.where.source).toBe("PENDING_ACTION");
    expect(call.where.sourceId.in).toEqual(["a", "b", "c"]);
  });
});
