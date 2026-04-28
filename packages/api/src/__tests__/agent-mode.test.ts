import { describe, expect, it } from "vitest";
import { normalizeAgentMode } from "../agent-mode.js";

describe("normalizeAgentMode", () => {
  it("accepts the supported agent modes", () => {
    expect(normalizeAgentMode("SHADOW")).toBe("SHADOW");
    expect(normalizeAgentMode("SUGGEST")).toBe("SUGGEST");
    expect(normalizeAgentMode("AUTO")).toBe("AUTO");
  });

  it("falls back to SUGGEST for unknown values", () => {
    expect(normalizeAgentMode("LOUD")).toBe("SUGGEST");
    expect(normalizeAgentMode(null)).toBe("SUGGEST");
  });
});
