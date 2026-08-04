/**
 * Key-headroom tripwire (2026-08-02 incident).
 *
 * The judge ran on the keyword fallback for a week because the shared
 * OpenRouter key hit the spend cap configured ON THE KEY — the account still
 * had credit, so no billing alert fired, and every call came back
 * `403 Key limit exceeded (total limit)`. Nothing watched the one number that
 * would have predicted it: the key's own remaining allowance.
 *
 * These tests pin the classification, not the fetch: the alarm must fire while
 * headroom is still positive (lead time), and must never fire for an uncapped
 * key — hosted prod deliberately runs one key, so a false "exhausted" alarm
 * would be indistinguishable from the real outage.
 */

import { describe, expect, it } from "vitest";
import {
  classifyKeyHeadroom,
  KEY_HEADROOM_LOW_FRACTION,
  parseKeyHeadroom,
} from "../llm/openrouter-key-health.js";

describe("parseKeyHeadroom", () => {
  it("reads OpenRouter's /api/v1/key envelope", () => {
    const body = {
      data: { label: "prod", usage: 8.4, limit: 10, is_free_tier: false, limit_remaining: 1.6 },
    };
    expect(parseKeyHeadroom(body)).toEqual({ usage: 8.4, limit: 10, remaining: 1.6 });
  });

  it("treats a null limit as an uncapped key", () => {
    const body = { data: { usage: 41.2, limit: null, limit_remaining: null } };
    expect(parseKeyHeadroom(body)).toEqual({ usage: 41.2, limit: null, remaining: null });
  });

  it("derives the remaining allowance when the API omits it", () => {
    const body = { data: { usage: 7, limit: 10 } };
    expect(parseKeyHeadroom(body)?.remaining).toBe(3);
  });

  it("returns null for anything that is not the expected envelope", () => {
    expect(parseKeyHeadroom(null)).toBeNull();
    expect(parseKeyHeadroom({})).toBeNull();
    expect(parseKeyHeadroom({ data: "nope" })).toBeNull();
    expect(parseKeyHeadroom({ data: { usage: "eight", limit: 10 } })).toBeNull();
  });
});

describe("classifyKeyHeadroom", () => {
  it("reports an uncapped key as unlimited — never alarm on the intended setup", () => {
    expect(classifyKeyHeadroom({ usage: 120, limit: null, remaining: null })).toBe("unlimited");
  });

  it("reports healthy while most of the allowance is left", () => {
    expect(classifyKeyHeadroom({ usage: 2, limit: 10, remaining: 8 })).toBe("healthy");
  });

  it("warns while headroom still exists — the alarm must arrive before the outage", () => {
    // 10% of a $10 cap, below the 15% floor: still serving, already alarming.
    expect(classifyKeyHeadroom({ usage: 9, limit: 10, remaining: 1 })).toBe("low");
  });

  it("uses the fraction floor rather than an absolute, so large caps warn too", () => {
    const limit = 500;
    const remaining = limit * (KEY_HEADROOM_LOW_FRACTION - 0.01);
    expect(classifyKeyHeadroom({ usage: limit - remaining, limit, remaining })).toBe("low");
    const healthy = limit * (KEY_HEADROOM_LOW_FRACTION + 0.05);
    expect(classifyKeyHeadroom({ usage: limit - healthy, limit, remaining: healthy })).toBe(
      "healthy",
    );
  });

  it("reports exhausted at zero — this is the state that 403s every call", () => {
    expect(classifyKeyHeadroom({ usage: 10, limit: 10, remaining: 0 })).toBe("exhausted");
    expect(classifyKeyHeadroom({ usage: 11, limit: 10, remaining: -1 })).toBe("exhausted");
  });
});
