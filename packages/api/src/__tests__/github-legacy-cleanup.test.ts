/**
 * The GitHub integration is gone, but its AttentionItems are not — nothing
 * auto-resolves them, so they would hold the firewall board's recency window
 * against real mail forever. This one-shot boot pass retires them.
 */

import { describe, expect, it, vi } from "vitest";

const updateMany = vi.hoisted(() => vi.fn());
vi.mock("../db.js", () => ({
  prisma: { attentionItem: { updateMany } },
  db: {},
}));
vi.mock("../sentry.js", () => ({ captureError: vi.fn() }));

const { purgeLegacyGitHubAttention } = await import("../judge/github-legacy-cleanup.js");

describe("purgeLegacyGitHubAttention", () => {
  it("resolves OPEN and SNOOZED GitHub items only", async () => {
    updateMany.mockResolvedValueOnce({ count: 141 });
    expect(await purgeLegacyGitHubAttention()).toBe(141);
    expect(updateMany).toHaveBeenCalledWith({
      // SNOOZED matters: the resurrect sweep would flip a snoozed item back
      // to OPEN long after the integration was removed.
      where: { source: "GITHUB", status: { in: ["OPEN", "SNOOZED"] } },
      data: { status: "RESOLVED", resolvedAt: expect.any(Date) },
    });
  });

  it("is a no-op on later boots (idempotent)", async () => {
    updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await purgeLegacyGitHubAttention()).toBe(0);
  });

  it("never throws — a failed pass just retries next restart", async () => {
    updateMany.mockRejectedValueOnce(new Error("db down"));
    await expect(purgeLegacyGitHubAttention()).resolves.toBe(0);
  });
});
