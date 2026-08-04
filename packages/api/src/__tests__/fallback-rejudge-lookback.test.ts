/**
 * Repair window for provider-outage residue.
 *
 * The self-heal sweep only looks back 14 days. That was sized for a short RPM
 * starvation (2026-07-16, hours). The 2026-07-16 → 08-04 key-cap outage lasted
 * ~19 days, so by the time it was diagnosed the oldest residue had already
 * aged out of the window — and every further day drops more of it, permanently
 * (nothing else re-judges a row that already has an AttentionItem).
 *
 * The window is now env-tunable so an operator can widen it to cover the actual
 * outage without shell access to the production database. Default is unchanged.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL = process.env.FALLBACK_REJUDGE_LOOKBACK_DAYS;

async function loadConfig() {
  vi.resetModules();
  return await import("../config.js");
}

beforeEach(() => {
  delete process.env.FALLBACK_REJUDGE_LOOKBACK_DAYS;
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.FALLBACK_REJUDGE_LOOKBACK_DAYS;
  else process.env.FALLBACK_REJUDGE_LOOKBACK_DAYS = ORIGINAL;
  vi.resetModules();
});

describe("FALLBACK_REJUDGE_LOOKBACK_DAYS", () => {
  it("defaults to 14 days — unchanged behaviour when the env is absent", async () => {
    const { FALLBACK_REJUDGE_LOOKBACK_DAYS } = await loadConfig();
    expect(FALLBACK_REJUDGE_LOOKBACK_DAYS).toBe(14);
  });

  it("accepts a widened window for a long outage", async () => {
    process.env.FALLBACK_REJUDGE_LOOKBACK_DAYS = "30";
    const { FALLBACK_REJUDGE_LOOKBACK_DAYS } = await loadConfig();
    expect(FALLBACK_REJUDGE_LOOKBACK_DAYS).toBe(30);
  });

  it("falls back to the default on garbage rather than widening to infinity", async () => {
    for (const value of ["", "soon", "-5", "0"]) {
      process.env.FALLBACK_REJUDGE_LOOKBACK_DAYS = value;
      const { FALLBACK_REJUDGE_LOOKBACK_DAYS } = await loadConfig();
      expect(FALLBACK_REJUDGE_LOOKBACK_DAYS, `value ${JSON.stringify(value)}`).toBe(14);
    }
  });

  it("caps the window so a typo cannot re-judge the entire ledger", async () => {
    process.env.FALLBACK_REJUDGE_LOOKBACK_DAYS = "3650";
    const { FALLBACK_REJUDGE_LOOKBACK_DAYS, FALLBACK_REJUDGE_LOOKBACK_MAX_DAYS } =
      await loadConfig();
    expect(FALLBACK_REJUDGE_LOOKBACK_DAYS).toBe(FALLBACK_REJUDGE_LOOKBACK_MAX_DAYS);
    expect(FALLBACK_REJUDGE_LOOKBACK_MAX_DAYS).toBe(90);
  });
});

describe("sweep options — what the scheduler actually asks the repair core for", () => {
  it("carries the configured window, stays bounded, and always applies", async () => {
    process.env.FALLBACK_REJUDGE_LOOKBACK_DAYS = "30";
    vi.resetModules();
    const { buildSweepOptions } = await import("../judge/fallback-rejudge.js");
    expect(buildSweepOptions()).toEqual({
      apply: true,
      limit: 5,
      delayMs: 1000,
      lookbackDays: 30,
    });
  });

  it("uses the 14-day default when the env is absent", async () => {
    vi.resetModules();
    const { buildSweepOptions } = await import("../judge/fallback-rejudge.js");
    expect(buildSweepOptions().lookbackDays).toBe(14);
  });
});
