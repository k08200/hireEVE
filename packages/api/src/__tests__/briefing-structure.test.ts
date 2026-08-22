/**
 * Briefing v2 structure — localized labels/headline templates, timezone-true
 * segmentation, measured-only summaries, attention capped at 3.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  timezone: "Asia/Seoul",
  language: "ko" as string | null,
  events: [] as Array<{ title: string; startTime: Date; endTime: Date }>,
}));

vi.mock("../db.js", () => {
  const prisma = {
    automationConfig: {
      findUnique: vi.fn(async () => ({ notificationLanguage: state.language })),
    },
    calendarEvent: { findMany: vi.fn(async () => state.events) },
  };
  return { prisma, db: prisma };
});
vi.mock("../user-timezone.js", () => ({
  getUserTimeZone: vi.fn(async () => state.timezone),
}));

import type { BriefingTopAction } from "../pim/briefing-signals.js";
import { buildBriefingStructure } from "../pim/briefing-structure.js";

// Saturday 2026-08-22, 07:00 KST.
const NOW = new Date("2026-08-21T22:00:00Z");

function kstEvent(title: string, hour: number, endHour: number) {
  // hour is KST; KST = UTC+9.
  return {
    title,
    startTime: new Date(Date.UTC(2026, 7, 22, hour - 9, 0)),
    endTime: new Date(Date.UTC(2026, 7, 22, endHour - 9, 0)),
  };
}

const ACTION = (rank: number): BriefingTopAction => ({
  id: `a${rank}`,
  rank,
  score: 10 - rank,
  action: `Action ${rank}`,
  reason: `Reason ${rank}`,
  refs: [],
});

beforeEach(() => {
  state.timezone = "Asia/Seoul";
  state.language = "ko";
  state.events = [];
});

describe("buildBriefingStructure", () => {
  it("renders the screenshot shape in Korean: front-loaded morning, open rest", async () => {
    state.events = [
      kstEvent("싱크", 9, 10),
      kstEvent("주간 회의", 9, 10),
      kstEvent("벤더 체크인", 9, 10),
    ];
    const s = await buildBriefingStructure("u1", [ACTION(1), ACTION(2)], NOW);

    expect(s.dateLabel).toBe("2026년 8월 22일 토요일");
    expect(s.headline).toBe("오전 10시 전에 3건. 나머지는 비어 있습니다.");
    expect(s.segments).toHaveLength(2);
    expect(s.segments[0]).toMatchObject({ label: "오전 10시 이전", kind: "busy" });
    expect(s.segments[0].summary).toContain("3건");
    expect(s.segments[1]).toMatchObject({ label: "오전 10시 이후", kind: "free" });
    expect(s.segments[1].summary).toBe("10시간 비어 있습니다.");
    expect(s.curve[1]).toBe(3); // 09:00 local
    expect(s.attention).toEqual([
      { rank: 1, action: "Action 1", reason: "Reason 1" },
      { rank: 2, action: "Action 2", reason: "Reason 2" },
    ]);
  });

  it("marks an empty weekend as a day off, localized in English", async () => {
    state.language = "en";
    const s = await buildBriefingStructure("u1", [], NOW);
    expect(s.headline).toBe("Nothing on the calendar. It's a day off.");
    expect(s.segments).toEqual([
      { label: "Today", summary: "Nothing scheduled. It's a day off.", kind: "off" },
    ]);
  });

  it("segments hours in the user's timezone, not UTC", async () => {
    state.timezone = "America/New_York";
    state.language = "en";
    // 14:00Z on Aug 22 = 10:00 EDT.
    state.events = [
      {
        title: "Standup",
        startTime: new Date("2026-08-22T14:00:00Z"),
        endTime: new Date("2026-08-22T15:00:00Z"),
      },
    ];
    // 08:00 EDT
    const s = await buildBriefingStructure("u1", [], new Date("2026-08-22T12:00:00Z"));
    const busy = s.segments.find((seg) => seg.kind === "busy");
    expect(busy?.label).toBe("10 AM – 11 AM");
    expect(s.curve[2]).toBe(1); // index 2 = 10:00 local
  });

  it("caps attention at three entries", async () => {
    const s = await buildBriefingStructure("u1", [1, 2, 3, 4].map(ACTION), NOW);
    expect(s.attention).toHaveLength(3);
  });
});
