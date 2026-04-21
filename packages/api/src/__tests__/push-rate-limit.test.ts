import { beforeEach, describe, expect, it } from "vitest";
import {
  PUSH_CAP_10MIN,
  PUSH_CAP_60MIN,
  PUSH_WINDOW_10MIN_MS,
  PUSH_WINDOW_60MIN_MS,
  recordPushAttempt,
  resetPushRateLimit,
} from "../push-rate-limit.js";

describe("push-rate-limit", () => {
  beforeEach(() => {
    resetPushRateLimit();
  });

  it("allows the first push for a fresh user", () => {
    const result = recordPushAttempt("user-a", Date.now());
    expect(result.allowed).toBe(true);
  });

  it("allows up to the 10-minute cap", () => {
    const now = Date.now();
    for (let i = 0; i < PUSH_CAP_10MIN; i++) {
      expect(recordPushAttempt("user-a", now + i * 1000).allowed).toBe(true);
    }
  });

  it("blocks when the 10-minute cap is exceeded", () => {
    const now = Date.now();
    for (let i = 0; i < PUSH_CAP_10MIN; i++) {
      recordPushAttempt("user-a", now + i);
    }
    const blocked = recordPushAttempt("user-a", now + PUSH_CAP_10MIN);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toContain("10min");
  });

  it("releases the 10-minute window after the cutoff", () => {
    const now = Date.now();
    for (let i = 0; i < PUSH_CAP_10MIN; i++) {
      recordPushAttempt("user-a", now + i);
    }
    const later = now + PUSH_WINDOW_10MIN_MS + 1;
    expect(recordPushAttempt("user-a", later).allowed).toBe(true);
  });

  it("blocks when the 60-minute cap is exceeded even if spaced out", () => {
    const now = Date.now();
    // Spread PUSH_CAP_60MIN sends across ~50 minutes so the 10-min window
    // never fills. We expect the 60-min cap to catch the next one.
    const spacingMs = (PUSH_WINDOW_60MIN_MS - 60_000) / PUSH_CAP_60MIN;
    for (let i = 0; i < PUSH_CAP_60MIN; i++) {
      const ts = now + Math.floor(i * spacingMs);
      expect(recordPushAttempt("user-a", ts).allowed).toBe(true);
    }
    const blocked = recordPushAttempt("user-a", now + PUSH_WINDOW_60MIN_MS - 1000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toContain("60min");
  });

  it("tracks each user independently", () => {
    const now = Date.now();
    for (let i = 0; i < PUSH_CAP_10MIN; i++) {
      recordPushAttempt("user-a", now + i);
    }
    // user-a is capped, user-b is fresh
    expect(recordPushAttempt("user-a", now + PUSH_CAP_10MIN).allowed).toBe(false);
    expect(recordPushAttempt("user-b", now + PUSH_CAP_10MIN).allowed).toBe(true);
  });

  it("does not count blocked attempts toward the window", () => {
    const now = Date.now();
    for (let i = 0; i < PUSH_CAP_10MIN; i++) {
      recordPushAttempt("user-a", now + i);
    }
    // Blocked attempts should not extend the window — once the earliest
    // allowed attempt ages out, capacity returns.
    recordPushAttempt("user-a", now + PUSH_CAP_10MIN);
    recordPushAttempt("user-a", now + PUSH_CAP_10MIN + 1);
    const later = now + PUSH_WINDOW_10MIN_MS + 10;
    expect(recordPushAttempt("user-a", later).allowed).toBe(true);
  });
});
