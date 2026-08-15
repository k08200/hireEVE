import { describe, expect, it } from "vitest";
import { detectSchedulingIntent, detectTransactionalNotice } from "../judge/keyword-policy.js";
import { TIER_THRESHOLDS, tierFromFeaturesV2 } from "../judge/tier-policy.js";
import { normalizeTier, TIERS } from "../judge/tiers.js";

const base = { confidence: 0.9, senderTrust: 0.6, reversibility: 0.5, urgency: 0.3 };
const noSignals = { scheduling: false, transactional: false };

describe("tier vocabulary v2", () => {
  it("includes MEETING and INFO as storage-valid tiers", () => {
    expect(TIERS).toContain("MEETING");
    expect(TIERS).toContain("INFO");
    expect(normalizeTier("MEETING")).toBe("MEETING");
    expect(normalizeTier("INFO")).toBe("INFO");
    // Legacy behaviors are unchanged.
    expect(normalizeTier("CALL")).toBe("PUSH");
    expect(normalizeTier("garbage")).toBe("QUEUE");
    expect(normalizeTier(null)).toBe("QUEUE");
  });
});

describe("tierFromFeaturesV2", () => {
  it("routes scheduling mail to MEETING regardless of urgency", () => {
    const calm = tierFromFeaturesV2(base, { ...noSignals, scheduling: true });
    expect(calm.tier).toBe("MEETING");
    const urgent = tierFromFeaturesV2(
      { ...base, urgency: 0.9 },
      { ...noSignals, scheduling: true },
    );
    expect(urgent.tier).toBe("MEETING");
  });

  it("keeps the v1 branches for non-scheduling mail", () => {
    expect(tierFromFeaturesV2({ ...base, confidence: 0.3 }, noSignals).tier).toBe("QUEUE");
    expect(tierFromFeaturesV2({ ...base, urgency: 0.9 }, noSignals).tier).toBe("PUSH");
    expect(
      tierFromFeaturesV2(
        { confidence: 0.9, senderTrust: 0.1, reversibility: 0.95, urgency: 0.1 },
        noSignals,
      ).tier,
    ).toBe("SILENT");
    expect(tierFromFeaturesV2(base, noSignals).tier).toBe("QUEUE");
  });

  it("routes calm transactional notices to INFO, but never urgent ones", () => {
    const calm = tierFromFeaturesV2(
      { ...base, senderTrust: 0.3 },
      { ...noSignals, transactional: true },
    );
    expect(calm.tier).toBe("INFO");
    const urgent = tierFromFeaturesV2(
      { ...base, senderTrust: 0.3, urgency: 0.9 },
      { ...noSignals, transactional: true },
    );
    expect(urgent.tier).not.toBe("INFO");
  });

  it("never emits AUTO", () => {
    // The exact v1 AUTO profile now lands in QUEUE with the flag instead.
    const v1AutoProfile = {
      confidence: 0.95,
      senderTrust: 0.8,
      reversibility: 0.95,
      urgency: 0.1,
    };
    const result = tierFromFeaturesV2(v1AutoProfile, noSignals);
    expect(result.tier).toBe("QUEUE");
    expect(result.autoEligible).toBe(true);
  });

  it("computes autoEligible only on QUEUE and MEETING, with the v1 AUTO floors", () => {
    const eligible = { confidence: 0.9, senderTrust: 0.7, reversibility: 0.9, urgency: 0.2 };
    expect(tierFromFeaturesV2(eligible, noSignals).autoEligible).toBe(true);
    expect(tierFromFeaturesV2(eligible, { ...noSignals, scheduling: true }).autoEligible).toBe(
      true,
    );
    // Push/silent/info are never auto-answerable.
    expect(tierFromFeaturesV2({ ...eligible, urgency: 0.9 }, noSignals).autoEligible).toBe(false);
    expect(
      tierFromFeaturesV2(
        { confidence: 0.9, senderTrust: 0.1, reversibility: 0.95, urgency: 0.1 },
        noSignals,
      ).autoEligible,
    ).toBe(false);
    expect(
      tierFromFeaturesV2({ ...eligible, senderTrust: 0.3 }, { ...noSignals, transactional: true })
        .autoEligible,
    ).toBe(false);
    // Below any AUTO floor → not eligible.
    expect(tierFromFeaturesV2({ ...eligible, reversibility: 0.5 }, noSignals).autoEligible).toBe(
      false,
    );
    expect(tierFromFeaturesV2({ ...eligible, senderTrust: 0.3 }, noSignals).autoEligible).toBe(
      false,
    );
  });

  it("keeps thresholds shared with v1 (no fork)", () => {
    // v2 reads the same threshold object — ontology overrides keep applying.
    expect(TIER_THRESHOLDS.push.urgency).toBeGreaterThan(0);
  });
});

describe("scheduling / transactional detectors", () => {
  it("detects meeting invites by subject and meet links", () => {
    expect(
      detectSchedulingIntent({ subject: "Invitation: Board sync @ Tue", snippet: "", body: "" }),
    ).toBe(true);
    expect(detectSchedulingIntent({ subject: "미팅 일정 조율", snippet: "", body: "" })).toBe(true);
    expect(
      detectSchedulingIntent({
        subject: "Quick chat",
        snippet: "",
        body: "Join: https://meet.google.com/abc-defg-hij",
      }),
    ).toBe(true);
    expect(
      detectSchedulingIntent({ subject: "Invoice #123", snippet: "your receipt", body: "" }),
    ).toBe(false);
  });

  it("detects transactional notices from automated senders only", () => {
    expect(
      detectTransactionalNotice({ from: "noreply@github.com", hasListUnsubscribe: false }),
    ).toBe(true);
    expect(detectTransactionalNotice({ from: "jane@example.com", hasListUnsubscribe: false })).toBe(
      false,
    );
    // Bulk marketing (List-Unsubscribe) is SILENT's territory, not INFO's.
    expect(detectTransactionalNotice({ from: "noreply@shop.com", hasListUnsubscribe: true })).toBe(
      false,
    );
  });
});
