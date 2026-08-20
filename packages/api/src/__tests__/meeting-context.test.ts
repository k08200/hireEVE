import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../event-parse.js", () => ({
  parseEventText: vi.fn(),
}));
vi.mock("../pim/calendar.js", () => ({
  checkConflicts: vi.fn(),
}));
vi.mock("../user-timezone.js", () => ({
  getUserTimeZone: vi.fn(async () => "Asia/Seoul"),
}));
vi.mock("../db.js", () => {
  const calendarEvent = { findMany: vi.fn(async () => []) };
  const prisma = { calendarEvent };
  return { prisma, db: prisma };
});

import { parseEventText } from "../event-parse.js";
import {
  _resetMeetingContextCacheForTests,
  formatCalendarFacts,
  getMeetingContext,
} from "../mail/meeting-context.js";
import { checkConflicts } from "../pim/calendar.js";

const RECEIVED_AT = new Date("2026-08-12T19:58:00+09:00");

function meetingEmail(overrides: Record<string, unknown> = {}) {
  return {
    id: "email-1",
    category: "meeting",
    summary: "Terry Smith: confirms 4 PM meeting tomorrow",
    keyPoints: ["Tomorrow 4 PM proposed"],
    body: "Can we shift tomorrow to 4pm?",
    receivedAt: RECEIVED_AT,
    ...overrides,
  };
}

describe("getMeetingContext", () => {
  beforeEach(() => {
    _resetMeetingContextCacheForTests();
    vi.mocked(parseEventText).mockReset();
    vi.mocked(checkConflicts).mockReset();
  });

  it("returns null for non-meeting categories without spending an LLM call", async () => {
    const ctx = await getMeetingContext("user-1", meetingEmail({ category: "business" }));
    expect(ctx).toBeNull();
    expect(parseEventText).not.toHaveBeenCalled();
  });

  it("anchors the time parse at the email's receivedAt, not now", async () => {
    vi.mocked(parseEventText).mockResolvedValueOnce(null);
    await getMeetingContext("user-1", meetingEmail());
    const call = vi.mocked(parseEventText).mock.calls[0];
    expect(call?.[2]).toEqual(RECEIVED_AT);
  });

  it("returns proposed slot + conflict verdict + nearby events for a parsed meeting", async () => {
    vi.mocked(parseEventText).mockResolvedValueOnce({
      title: "Meeting with Terry",
      startTime: "2026-08-13T16:00:00+09:00",
      endTime: "2026-08-13T17:00:00+09:00",
    });
    vi.mocked(checkConflicts).mockResolvedValueOnce({
      hasConflicts: false,
      conflicts: [],
      message: "No conflicts — this time slot is free.",
    } as never);
    const { prisma } = await import("../db.js");
    vi.mocked(prisma.calendarEvent.findMany).mockResolvedValueOnce([
      {
        id: "ev-1",
        title: "Standup",
        startTime: new Date("2026-08-13T10:00:00+09:00"),
        endTime: new Date("2026-08-13T10:15:00+09:00"),
        allDay: false,
      },
    ] as never);

    const ctx = await getMeetingContext("user-1", meetingEmail());
    expect(ctx?.proposed?.startTime).toBe("2026-08-13T16:00:00+09:00");
    expect(ctx?.conflict?.hasConflicts).toBe(false);
    expect(ctx?.nearby).toHaveLength(1);
    expect(ctx?.nearby[0]?.title).toBe("Standup");
    expect(ctx?.timeZone).toBe("Asia/Seoul");
  });

  it("degrades to conflict:null when the calendar check errors (Google disconnected)", async () => {
    vi.mocked(parseEventText).mockResolvedValueOnce({
      title: "Meeting",
      startTime: "2026-08-13T16:00:00+09:00",
      endTime: "2026-08-13T17:00:00+09:00",
    });
    vi.mocked(checkConflicts).mockResolvedValueOnce({
      error: "Google Calendar not connected.",
    } as never);
    const ctx = await getMeetingContext("user-1", meetingEmail());
    expect(ctx?.proposed).not.toBeNull();
    expect(ctx?.conflict).toBeNull();
  });

  it("returns an empty context (not null) when no time can be parsed", async () => {
    vi.mocked(parseEventText).mockResolvedValueOnce(null);
    const ctx = await getMeetingContext("user-1", meetingEmail());
    expect(ctx).toEqual({
      proposed: null,
      conflict: null,
      nearby: [],
      attendeeBusy: [],
      timeZone: "Asia/Seoul",
    });
    expect(checkConflicts).not.toHaveBeenCalled();
  });

  it("caches per email id — the second view costs no second LLM call", async () => {
    vi.mocked(parseEventText).mockResolvedValue(null);
    await getMeetingContext("user-1", meetingEmail());
    await getMeetingContext("user-1", meetingEmail());
    expect(parseEventText).toHaveBeenCalledTimes(1);
  });

  it("fails open when the parse itself throws (LLM transport failure)", async () => {
    vi.mocked(parseEventText).mockRejectedValueOnce(new Error("upstream 502"));
    const ctx = await getMeetingContext("user-1", meetingEmail());
    expect(ctx?.proposed).toBeNull();
  });
});

describe("formatCalendarFacts", () => {
  it("renders proposed slot, verdict and nearby events in the user's zone", () => {
    const block = formatCalendarFacts({
      proposed: {
        title: "Meeting with Terry",
        startTime: "2026-08-13T16:00:00+09:00",
        endTime: "2026-08-13T17:00:00+09:00",
      },
      conflict: { hasConflicts: false, message: "No conflicts — this time slot is free." },
      nearby: [
        {
          id: "ev-1",
          title: "Standup",
          startTime: "2026-08-13T10:00:00+09:00",
          endTime: "2026-08-13T10:15:00+09:00",
          allDay: false,
        },
      ],
      timeZone: "Asia/Seoul",
    });
    expect(block).toContain("Calendar facts");
    expect(block).toContain("Meeting with Terry");
    expect(block).toContain("16:00");
    expect(block).toContain("No conflicts");
    expect(block).toContain("Standup");
    // Titles are attacker-reachable (parsed from mail / calendar invites sync
    // verbatim) — they must ride inside untrusted wrappers, times outside.
    expect(block).toContain(
      '<untrusted_content source="calendar:proposed-title">Meeting with Terry',
    );
    expect(block).toContain('<untrusted_content source="calendar:event-title">Standup');
    expect(block).not.toContain("never contradict");
  });

  it("returns null when there is nothing to say", () => {
    expect(
      formatCalendarFacts({
        proposed: null,
        conflict: null,
        nearby: [],
        attendeeBusy: [],
        timeZone: "Asia/Seoul",
      }),
    ).toBeNull();
  });
});
