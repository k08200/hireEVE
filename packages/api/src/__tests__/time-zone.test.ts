import { describe, expect, it } from "vitest";
import {
  localDateKey,
  localDayUtcRange,
  localMinuteOfDay,
  normalizeTimeZone,
} from "../time-zone.js";

describe("timezone helpers", () => {
  it("normalizes invalid timezones to the product default", () => {
    expect(normalizeTimeZone("not/a-zone")).toBe("Asia/Seoul");
    expect(normalizeTimeZone(null)).toBe("Asia/Seoul");
  });

  it("computes local date and minute in the selected timezone", () => {
    const now = new Date("2026-05-04T00:30:00.000Z");
    expect(localDateKey(now, "Asia/Seoul")).toBe("2026-05-04");
    expect(localMinuteOfDay(now, "Asia/Seoul")).toBe(9 * 60 + 30);
    expect(localDateKey(now, "America/Los_Angeles")).toBe("2026-05-03");
  });

  it("returns the UTC range for the user's local day", () => {
    const range = localDayUtcRange(new Date("2026-05-04T00:30:00.000Z"), "Asia/Seoul");
    expect(range.dateKey).toBe("2026-05-04");
    expect(range.gte.toISOString()).toBe("2026-05-03T15:00:00.000Z");
    expect(range.lt.toISOString()).toBe("2026-05-04T15:00:00.000Z");
  });
});
