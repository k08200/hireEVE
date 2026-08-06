/**
 * The app-wide "refetch your mail surfaces" wake: leading emit immediately
 * (latency is the point), repeats inside the window coalesce into ONE
 * trailing emit, users are throttled independently, and the envelope is the
 * exact shape the web NotificationBell and desktop RealtimeClient key on.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pushNotification = vi.hoisted(() => vi.fn());
vi.mock("../websocket.js", () => ({ pushNotification }));

import { notifyConversationsUpdated } from "../notify/conversations-updated.js";

beforeEach(() => {
  vi.useFakeTimers();
  pushNotification.mockClear();
});

afterEach(() => {
  // Drain any open throttle window so state never leaks across tests.
  vi.runAllTimers();
  vi.useRealTimers();
  pushNotification.mockClear();
});

describe("notifyConversationsUpdated", () => {
  it("emits immediately with the canonical envelope", () => {
    notifyConversationsUpdated("u1");
    expect(pushNotification).toHaveBeenCalledTimes(1);
    const [userId, payload] = pushNotification.mock.calls[0];
    expect(userId).toBe("u1");
    expect(payload).toMatchObject({
      id: "mail-sync", // fixed id — the web bell dedups instead of stacking
      type: "system",
      title: "conversations-updated",
      message: "",
    });
  });

  it("coalesces a burst into the leading emit plus one trailing emit", () => {
    for (let i = 0; i < 30; i++) notifyConversationsUpdated("u1");
    expect(pushNotification).toHaveBeenCalledTimes(1); // leading only
    vi.advanceTimersByTime(2_000);
    expect(pushNotification).toHaveBeenCalledTimes(2); // one trailing for the 29
    vi.advanceTimersByTime(10_000);
    expect(pushNotification).toHaveBeenCalledTimes(2); // and nothing further
  });

  it("does not fire a trailing emit when nothing arrived during the window", () => {
    notifyConversationsUpdated("u1");
    vi.advanceTimersByTime(10_000);
    expect(pushNotification).toHaveBeenCalledTimes(1);
  });

  it("emits again once the window has passed", () => {
    notifyConversationsUpdated("u1");
    vi.advanceTimersByTime(2_100);
    notifyConversationsUpdated("u1");
    expect(pushNotification).toHaveBeenCalledTimes(2);
  });

  it("throttles users independently", () => {
    notifyConversationsUpdated("u1");
    notifyConversationsUpdated("u2");
    notifyConversationsUpdated("u1");
    expect(pushNotification).toHaveBeenCalledTimes(2);
    expect(pushNotification.mock.calls.map((c) => c[0])).toEqual(["u1", "u2"]);
  });
});
