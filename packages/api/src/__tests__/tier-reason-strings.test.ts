/**
 * The tier reason answers "why did this interrupt me". The judge's reason is
 * LLM-authored and now written in the user's language (#1000), but the
 * deterministic reasons — task overdue, meeting starting, commitment due —
 * were English literals baked into the row at write time.
 *
 * Baking a translated string at write time would freeze a row in whatever
 * language was active that day. These are stored as keys instead and resolved
 * where they're displayed, so switching language re-reads every existing row.
 */

import { describe, expect, it } from "vitest";
import {
  isStaticTierReasonKey,
  resolveTierReason,
  STATIC_TIER_REASONS,
} from "../judge/tier-reason-strings.js";

describe("static tier reasons", () => {
  it("resolves a key to English by default", () => {
    expect(resolveTierReason("task.overdueUrgent")).toMatch(/overdue/i);
  });

  it("resolves the same key to Korean", () => {
    const ko = resolveTierReason("task.overdueUrgent", "ko");
    expect(ko).not.toMatch(/overdue/i);
    expect(ko.length).toBeGreaterThan(0);
  });

  it("ships every key in both languages", () => {
    for (const key of Object.keys(STATIC_TIER_REASONS)) {
      expect(resolveTierReason(key, "en"), `en missing for ${key}`).toBeTruthy();
      expect(resolveTierReason(key, "ko"), `ko missing for ${key}`).toBeTruthy();
    }
  });

  it("passes through free text unchanged — LLM reasons are not keys", () => {
    const llmAuthored = "Investor asking about the round";
    expect(resolveTierReason(llmAuthored, "ko")).toBe(llmAuthored);
    expect(isStaticTierReasonKey(llmAuthored)).toBe(false);
  });

  it("passes through an English reason stored before this change", () => {
    // Rows written previously hold prose, not keys. They must survive intact
    // rather than being blanked by a failed lookup.
    const legacy = "Meeting starts in minutes — interrupt now";
    expect(resolveTierReason(legacy, "ko")).toBe(legacy);
  });

  it("treats null/empty as no reason rather than throwing", () => {
    expect(resolveTierReason(null)).toBeNull();
    expect(resolveTierReason(undefined)).toBeNull();
    expect(resolveTierReason("")).toBeNull();
  });

  it("falls back to English for a language it does not ship", () => {
    expect(resolveTierReason("task.overdueUrgent", "fr")).toBe(
      resolveTierReason("task.overdueUrgent", "en"),
    );
  });

  it("recognises its own keys and nothing else", () => {
    expect(isStaticTierReasonKey("meeting.startingNow")).toBe(true);
    expect(isStaticTierReasonKey("not.a.real.key")).toBe(false);
  });
});
