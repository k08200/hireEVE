import { describe, expect, it, vi } from "vitest";
import { withRetry } from "../with-retry.js";

describe("withRetry", () => {
  it("returns result on first success", async () => {
    const fn = vi.fn(async () => "ok");
    const result = await withRetry(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on retryable error and eventually succeeds", async () => {
    let attempt = 0;
    const fn = vi.fn(async () => {
      attempt++;
      if (attempt < 3) throw new Error("429 rate limit");
      return "ok";
    });

    const result = await withRetry(fn, {
      maxRetries: 3,
      initialDelayMs: 1,
      maxDelayMs: 5,
    });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws immediately for non-retryable errors", async () => {
    const fn = vi.fn(async () => {
      throw new Error("invalid api key");
    });

    await expect(withRetry(fn, { maxRetries: 3, initialDelayMs: 1 })).rejects.toThrow(
      "invalid api key",
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("throws after exhausting max retries", async () => {
    const fn = vi.fn(async () => {
      throw new Error("503 service unavailable");
    });

    await expect(
      withRetry(fn, { maxRetries: 2, initialDelayMs: 1, maxDelayMs: 5 }),
    ).rejects.toThrow("503");
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it("calls onRetry callback", async () => {
    let attempt = 0;
    const onRetry = vi.fn();
    const fn = vi.fn(async () => {
      attempt++;
      if (attempt < 2) throw new Error("timeout");
      return "ok";
    });

    await withRetry(fn, {
      maxRetries: 3,
      initialDelayMs: 1,
      onRetry,
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error), expect.any(Number));
  });

  it("retries on status code 429", async () => {
    let attempt = 0;
    const fn = vi.fn(async () => {
      attempt++;
      if (attempt < 2) throw { status: 429, message: "rate limited" };
      return "ok";
    });

    const result = await withRetry(fn, { maxRetries: 2, initialDelayMs: 1 });
    expect(result).toBe("ok");
  });

  it("retries on status code 500+", async () => {
    let attempt = 0;
    const fn = vi.fn(async () => {
      attempt++;
      if (attempt < 2) throw { status: 502, message: "bad gateway" };
      return "ok";
    });

    const result = await withRetry(fn, { maxRetries: 2, initialDelayMs: 1 });
    expect(result).toBe("ok");
  });

  it("supports custom isRetryable function", async () => {
    let attempt = 0;
    const fn = vi.fn(async () => {
      attempt++;
      if (attempt < 2) throw new Error("custom error");
      return "ok";
    });

    const result = await withRetry(fn, {
      maxRetries: 2,
      initialDelayMs: 1,
      isRetryable: (err) => err instanceof Error && err.message === "custom error",
    });
    expect(result).toBe("ok");
  });
});
