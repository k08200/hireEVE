import { describe, expect, it } from "vitest";
import { getEffectivePlan, PLANS } from "../stripe.js";

describe("plan device limits", () => {
  it("allows free users to stay signed in on phone and desktop at the same time", () => {
    expect(PLANS.FREE.deviceLimit).toBeGreaterThanOrEqual(2);
  });

  it("keeps higher plans at or above the free device allowance", () => {
    expect(PLANS.PRO.deviceLimit).toBeGreaterThanOrEqual(PLANS.FREE.deviceLimit);
    expect(PLANS.TEAM.deviceLimit).toBeGreaterThanOrEqual(PLANS.PRO.deviceLimit);
  });

  it("gives admins unlimited device sessions", () => {
    expect(getEffectivePlan("FREE", "ADMIN").deviceLimit).toBe(Infinity);
  });
});
