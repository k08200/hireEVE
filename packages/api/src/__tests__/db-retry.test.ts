import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isColdStartError, withDbRetry } from "../db-retry.js";

describe("isColdStartError", () => {
  it("recognizes Neon/Postgres reachability failures as cold-start", () => {
    expect(
      isColdStartError(new Error("Can't reach database server at ep-x.aws.neon.tech:5432")),
    ).toBe(true);
    expect(isColdStartError(new Error("Server has closed the connection."))).toBe(true);
    expect(isColdStartError(new Error("Connection terminated unexpectedly"))).toBe(true);
    expect(isColdStartError(new Error("timed out fetching a new connection from pool"))).toBe(true);
    expect(isColdStartError(new Error("Connection refused (os error 61)"))).toBe(true);
    expect(isColdStartError(new Error("ECONNRESET"))).toBe(true);
  });

  it("does NOT match application-level errors that should propagate immediately", () => {
    expect(isColdStartError(new Error("Unique constraint failed on the field: email"))).toBe(false);
    expect(isColdStartError(new Error("Record to update not found"))).toBe(false);
    expect(isColdStartError(new Error("Invalid input"))).toBe(false);
    expect(isColdStartError(undefined)).toBe(false);
    expect(isColdStartError(null)).toBe(false);
    expect(isColdStartError("just a string")).toBe(false);
  });
});

describe("withDbRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the value when the call succeeds on the first try (no waiting)", async () => {
    const fn = vi.fn(async () => 42);
    const result = await withDbRetry(fn);
    expect(result).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on cold-start errors and resolves once the DB wakes up", async () => {
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("Can't reach database server at neon..."))
      .mockRejectedValueOnce(new Error("Connection terminated unexpectedly"))
      .mockResolvedValueOnce("ok");

    const promise = withDbRetry(fn, { baseDelayMs: 10, maxAttempts: 4 });
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("re-throws non-cold-start errors immediately without retrying", async () => {
    const fn = vi
      .fn<() => Promise<never>>()
      .mockRejectedValue(new Error("Unique constraint failed on the field: email"));

    await expect(withDbRetry(fn)).rejects.toThrow(/Unique constraint/);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("gives up after maxAttempts and re-throws the last cold-start error", async () => {
    const fn = vi
      .fn<() => Promise<never>>()
      .mockRejectedValue(new Error("Can't reach database server"));

    const promise = withDbRetry(fn, { baseDelayMs: 5, maxAttempts: 3 });
    promise.catch(() => {}); // prevent unhandled rejection warning while we advance timers
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toThrow(/Can't reach database server/);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("uses exponential backoff between attempts so we do not hammer a waking DB", async () => {
    const sleeps: number[] = [];
    const sleep = (ms: number): Promise<void> => {
      sleeps.push(ms);
      return Promise.resolve();
    };
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("Can't reach database server"))
      .mockRejectedValueOnce(new Error("Can't reach database server"))
      .mockResolvedValueOnce("ok");

    const result = await withDbRetry(fn, { baseDelayMs: 100, maxAttempts: 4, sleep });
    expect(result).toBe("ok");
    expect(sleeps).toHaveLength(2);
    expect(sleeps[0]).toBeGreaterThanOrEqual(100);
    expect(sleeps[1]).toBeGreaterThanOrEqual(200);
    // Each delay should be larger than the previous (allowing for jitter).
    expect(sleeps[1]).toBeGreaterThan(sleeps[0]);
  });
});
