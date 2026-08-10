/**
 * ensureRecentMailSync — activity-driven mail pull. The scheduler's per-user
 * sync sits behind gates a user can silently fall out of (no AutomationConfig
 * row, flag off, token dropped from the connected set); with Gmail push
 * unconfigured there is then NO path at all and mail just stops with no
 * in-app signal (observed 2026-08-04 → 08-10). The firewall GET — which every
 * client polls — now pulls on activity instead.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const captureError = vi.hoisted(() => vi.fn());
const configFindUnique = vi.hoisted(() => vi.fn(async () => null));
vi.mock("../sentry.js", () => ({ captureError }));
vi.mock("../db.js", () => ({
  prisma: { automationConfig: { findUnique: configFindUnique } },
  db: {},
}));

const { ensureRecentMailSync } = await import("../mail/activity-sync.js");

let seq = 0;
/** Unique user per test — the debounce map is module-level state. */
const freshUser = () => `sync-user-${seq++}`;

beforeEach(() => {
  captureError.mockClear();
  configFindUnique.mockClear();
  configFindUnique.mockResolvedValue(null);
  delete process.env.ACTIVITY_MAIL_SYNC_DISABLED;
});

describe("ensureRecentMailSync", () => {
  it("pulls recent mail on first call", async () => {
    const sync = vi.fn(async () => ({ synced: 3 }));
    await ensureRecentMailSync(freshUser(), sync);
    expect(sync).toHaveBeenCalledTimes(1);
    expect(sync.mock.calls[0][1]).toBe(30);
  });

  it("debounces per user — a second call within the window is a no-op", async () => {
    const userId = freshUser();
    const sync = vi.fn(async () => ({}));
    await ensureRecentMailSync(userId, sync);
    await ensureRecentMailSync(userId, sync);
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it("debounces per USER, not globally", async () => {
    const sync = vi.fn(async () => ({}));
    await ensureRecentMailSync(freshUser(), sync);
    await ensureRecentMailSync(freshUser(), sync);
    expect(sync).toHaveBeenCalledTimes(2);
  });

  it("stays silent on the expected dead-token shape (the reconnect prompt owns that)", async () => {
    const sync = vi.fn(async () => {
      throw new Error("Gmail not connected");
    });
    await expect(ensureRecentMailSync(freshUser(), sync)).resolves.toBeUndefined();
    expect(captureError).not.toHaveBeenCalled();
  });

  it("syncs when the user has NO automation config — the gate-fallout case", async () => {
    configFindUnique.mockResolvedValue(null);
    const sync = vi.fn(async () => ({}));
    await ensureRecentMailSync(freshUser(), sync);
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it("respects an explicit emailAutoClassify=false", async () => {
    configFindUnique.mockResolvedValue({ emailAutoClassify: false } as never);
    const sync = vi.fn(async () => ({}));
    await ensureRecentMailSync(freshUser(), sync);
    expect(sync).not.toHaveBeenCalled();
  });

  it("stops entirely when the operator kill switch is set", async () => {
    process.env.ACTIVITY_MAIL_SYNC_DISABLED = "true";
    const sync = vi.fn(async () => ({}));
    await ensureRecentMailSync(freshUser(), sync);
    expect(sync).not.toHaveBeenCalled();
    expect(configFindUnique).not.toHaveBeenCalled();
  });

  it("reports real faults without throwing (fire-and-forget contract)", async () => {
    const sync = vi.fn(async () => {
      throw new Error("gmail api 500");
    });
    await expect(ensureRecentMailSync(freshUser(), sync)).resolves.toBeUndefined();
    expect(captureError).toHaveBeenCalledTimes(1);
  });
});
