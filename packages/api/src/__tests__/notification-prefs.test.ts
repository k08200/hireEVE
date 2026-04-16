import { describe, expect, it } from "vitest";
import { isInQuietHours } from "../notification-prefs.js";

describe("isInQuietHours", () => {
  it("returns false when start or end is null", () => {
    expect(isInQuietHours(null, null)).toBe(false);
    expect(isInQuietHours("22:00", null)).toBe(false);
    expect(isInQuietHours(null, "08:00")).toBe(false);
  });

  it("returns false for same-start-and-end window", () => {
    const now = new Date(2026, 0, 1, 12, 0);
    expect(isInQuietHours("12:00", "12:00", now)).toBe(false);
  });

  it("handles same-day window correctly", () => {
    // Window 13:00–17:00
    expect(isInQuietHours("13:00", "17:00", new Date(2026, 0, 1, 14, 0))).toBe(true);
    expect(isInQuietHours("13:00", "17:00", new Date(2026, 0, 1, 10, 0))).toBe(false);
    expect(isInQuietHours("13:00", "17:00", new Date(2026, 0, 1, 17, 30))).toBe(false);
  });

  it("handles wrap-midnight window correctly", () => {
    // Window 22:00–08:00 (overnight)
    expect(isInQuietHours("22:00", "08:00", new Date(2026, 0, 1, 23, 30))).toBe(true);
    expect(isInQuietHours("22:00", "08:00", new Date(2026, 0, 1, 3, 0))).toBe(true);
    expect(isInQuietHours("22:00", "08:00", new Date(2026, 0, 1, 7, 59))).toBe(true);
    expect(isInQuietHours("22:00", "08:00", new Date(2026, 0, 1, 12, 0))).toBe(false);
    expect(isInQuietHours("22:00", "08:00", new Date(2026, 0, 1, 21, 59))).toBe(false);
    expect(isInQuietHours("22:00", "08:00", new Date(2026, 0, 1, 8, 0))).toBe(false);
  });

  it("includes start time and excludes end time", () => {
    // Boundary: at exactly start time → in quiet hours
    expect(isInQuietHours("22:00", "08:00", new Date(2026, 0, 1, 22, 0))).toBe(true);
    // At exactly end time → NOT in quiet hours
    expect(isInQuietHours("22:00", "08:00", new Date(2026, 0, 1, 8, 0))).toBe(false);
  });

  it("rejects malformed time strings", () => {
    expect(isInQuietHours("abc", "08:00", new Date())).toBe(false);
    expect(isInQuietHours("22:00", "xx:yy", new Date())).toBe(false);
  });
});
