import { describe, expect, it } from "vitest";
import { isBriefingDue } from "../automation-scheduler.js";

describe("daily briefing schedule timezone", () => {
  it("fires at 09:00 in the user's timezone rather than server UTC", () => {
    expect(isBriefingDue("09:00", "Asia/Seoul", new Date("2026-05-04T00:00:00.000Z"))).toBe(true);
    expect(isBriefingDue("09:00", "Asia/Seoul", new Date("2026-05-03T23:59:00.000Z"))).toBe(false);
  });

  it("keeps the one-hour grace window in the user's timezone", () => {
    expect(isBriefingDue("09:00", "Asia/Seoul", new Date("2026-05-04T01:00:00.000Z"))).toBe(true);
    expect(isBriefingDue("09:00", "Asia/Seoul", new Date("2026-05-04T01:01:00.000Z"))).toBe(false);
  });
});
