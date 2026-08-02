/**
 * The explicit reply-tone setting. Founder decision (2026-07-28): the
 * /reply-options keys stay accept/decline/info — the register the user picked
 * up front is what changes, and it applies to all three drafts.
 *
 * The invariant worth pinning is precedence: an inferred voice profile must
 * never outrank a register the user chose by hand.
 */

import { describe, expect, it } from "vitest";
import {
  buildReplyTonePromptHint,
  listReplyTonePolicies,
  normalizeReplyTone,
  REPLY_TONES,
} from "../learning/reply-tone.js";

describe("normalizeReplyTone", () => {
  it("keeps every supported tone", () => {
    for (const tone of REPLY_TONES) {
      expect(normalizeReplyTone(tone)).toBe(tone);
    }
  });

  it("falls back to MATCH_ME for unknown, legacy, or malformed values", () => {
    expect(normalizeReplyTone("POLITE")).toBe("MATCH_ME");
    expect(normalizeReplyTone("")).toBe("MATCH_ME");
    expect(normalizeReplyTone(null)).toBe("MATCH_ME");
    expect(normalizeReplyTone(undefined)).toBe("MATCH_ME");
    expect(normalizeReplyTone(7)).toBe("MATCH_ME");
    expect(normalizeReplyTone({ tone: "CASUAL" })).toBe("MATCH_ME");
  });
});

describe("buildReplyTonePromptHint", () => {
  it("emits nothing for MATCH_ME so the learned voice profile stands alone", () => {
    expect(buildReplyTonePromptHint("MATCH_ME")).toBe("");
    expect(buildReplyTonePromptHint(undefined)).toBe("");
  });

  it("states that an explicit choice overrides the inferred style", () => {
    expect(buildReplyTonePromptHint("FORMAL")).toMatch(/overrides any inferred writing style/i);
  });

  it("asks for the honorific register on FORMAL", () => {
    expect(buildReplyTonePromptHint("FORMAL")).toMatch(/honorific/i);
  });

  it("gives each explicit tone a distinct instruction", () => {
    const hints = ["FORMAL", "FRIENDLY", "CASUAL"].map(buildReplyTonePromptHint);
    expect(new Set(hints).size).toBe(3);
    for (const hint of hints) expect(hint.length).toBeGreaterThan(0);
  });
});

describe("listReplyTonePolicies", () => {
  it("describes every tone for the settings UI", () => {
    const policies = listReplyTonePolicies();
    expect(policies.map((p) => p.tone)).toEqual([...REPLY_TONES]);
    for (const policy of policies) {
      expect(policy.label.length).toBeGreaterThan(0);
      expect(policy.description.length).toBeGreaterThan(0);
    }
  });
});
