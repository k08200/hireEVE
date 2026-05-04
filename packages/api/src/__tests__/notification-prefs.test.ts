import { describe, expect, it } from "vitest";
import { isInQuietHours } from "../notification-prefs.js";

describe("isInQuietHours", () => {
  it("returns false when start or end is null", () => {
    expect(isInQuietHours(null, null)).toBe(false);
    expect(isInQuietHours("22:00", null)).toBe(false);
    expect(isInQuietHours(null, "08:00")).toBe(false);
  });

  it("returns false for same-start-and-end window", () => {
    const now = new Date("2026-01-01T12:00:00.000Z");
    expect(isInQuietHours("12:00", "12:00", now, "UTC")).toBe(false);
  });

  it("handles same-day window correctly", () => {
    // Window 13:00–17:00
    expect(isInQuietHours("13:00", "17:00", new Date("2026-01-01T14:00:00Z"), "UTC")).toBe(true);
    expect(isInQuietHours("13:00", "17:00", new Date("2026-01-01T10:00:00Z"), "UTC")).toBe(false);
    expect(isInQuietHours("13:00", "17:00", new Date("2026-01-01T17:30:00Z"), "UTC")).toBe(false);
  });

  it("handles wrap-midnight window correctly", () => {
    // Window 22:00–08:00 (overnight)
    expect(isInQuietHours("22:00", "08:00", new Date("2026-01-01T23:30:00Z"), "UTC")).toBe(true);
    expect(isInQuietHours("22:00", "08:00", new Date("2026-01-01T03:00:00Z"), "UTC")).toBe(true);
    expect(isInQuietHours("22:00", "08:00", new Date("2026-01-01T07:59:00Z"), "UTC")).toBe(true);
    expect(isInQuietHours("22:00", "08:00", new Date("2026-01-01T12:00:00Z"), "UTC")).toBe(false);
    expect(isInQuietHours("22:00", "08:00", new Date("2026-01-01T21:59:00Z"), "UTC")).toBe(false);
    expect(isInQuietHours("22:00", "08:00", new Date("2026-01-01T08:00:00Z"), "UTC")).toBe(false);
  });

  it("includes start time and excludes end time", () => {
    // Boundary: at exactly start time → in quiet hours
    expect(isInQuietHours("22:00", "08:00", new Date("2026-01-01T22:00:00Z"), "UTC")).toBe(true);
    // At exactly end time → NOT in quiet hours
    expect(isInQuietHours("22:00", "08:00", new Date("2026-01-01T08:00:00Z"), "UTC")).toBe(false);
  });

  it("evaluates quiet hours in the user's timezone", () => {
    // 2026-01-01T00:30Z is 09:30 in Asia/Seoul.
    expect(isInQuietHours("09:00", "10:00", new Date("2026-01-01T00:30:00Z"), "Asia/Seoul")).toBe(
      true,
    );
  });

  it("rejects malformed time strings", () => {
    expect(isInQuietHours("abc", "08:00", new Date())).toBe(false);
    expect(isInQuietHours("22:00", "xx:yy", new Date())).toBe(false);
  });
});
