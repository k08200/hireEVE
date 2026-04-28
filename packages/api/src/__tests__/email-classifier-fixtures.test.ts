import { describe, expect, it } from "vitest";
import { dogfoodEmailClassificationFixtures } from "../__fixtures__/email-classification/dogfood.js";

describe("email classification dogfood fixtures", () => {
  it("define expected labels for both sync heuristics and LLM batch classification", () => {
    expect(dogfoodEmailClassificationFixtures.length).toBeGreaterThanOrEqual(5);

    for (const fixture of dogfoodEmailClassificationFixtures) {
      expect(fixture.id).toMatch(/^[a-z0-9_]+$/);
      expect(["URGENT", "NORMAL", "LOW"]).toContain(fixture.expectedSyncPriority);
      expect(["high", "medium", "low"]).toContain(fixture.expectedBatchLabel.priority);
      expect(fixture.expectedBatchLabel.reason).toBeTruthy();
      expect(typeof fixture.expectedBatchLabel.needsReply).toBe("boolean");
    }
  });

  it("marks every current heuristic mismatch as an explicit known gap", () => {
    const knownGapIds = dogfoodEmailClassificationFixtures
      .filter((fixture) => fixture.knownHeuristicGap)
      .map((fixture) => fixture.id);

    expect(knownGapIds).toEqual([]);
  });
});
