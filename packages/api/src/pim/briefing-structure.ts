/**
 * Briefing v2 structure (2026-08-22): the glanceable layer above the prose —
 * a one-sentence day verdict, at most three time segments with a kind and a
 * measured summary, an hourly intensity curve for the client sparkline, and
 * the ranked attention list. Everything here is DETERMINISTIC and localized
 * server-side (notificationLanguage), so both clients render the same truth
 * with zero client-side translation. The LLM prose body is unchanged and
 * rides below this structure.
 */

import { prisma } from "../db.js";
import { resolveNotificationLanguage } from "../notify/notification-strings.js";
import { localDayUtcRange } from "../time-zone.js";
import { getUserTimeZone } from "../user-timezone.js";
import type { BriefingTopAction } from "./briefing-signals.js";
import {
  buildDayShape,
  DAY_END_HOUR,
  DAY_START_HOUR,
  type DaySegment,
  localHour,
} from "./day-shape.js";

export interface BriefingSegmentView {
  label: string;
  summary: string;
  kind: "busy" | "free" | "off";
}

export interface BriefingStructure {
  /** Localized long date, e.g. "2026년 8월 22일 토요일". */
  dateLabel: string;
  /** One-sentence day verdict, e.g. "열 시 전에 회의 세 건. 나머지는 비어 있습니다." */
  headline: string;
  segments: BriefingSegmentView[];
  /** Overlap count per hour, index 0 = 08:00 local. */
  curve: number[];
  dayStartHour: number;
  attention: Array<{ rank: number; action: string; reason: string }>;
}

type Lang = "en" | "ko";

/** "10 AM" / "오전 10시" — segment labels use whole hours only. */
function hourLabel(hour: number, lang: Lang): string {
  if (lang === "ko") {
    const meridiem = hour < 12 ? "오전" : "오후";
    const h = hour <= 12 ? hour : hour - 12;
    return `${meridiem} ${h}시`;
  }
  const meridiem = hour < 12 ? "AM" : "PM";
  const h = hour === 12 ? 12 : hour % 12;
  return `${h} ${meridiem}`;
}

function segmentLabel(seg: DaySegment, index: number, count: number, lang: Lang): string {
  if (count === 1) return lang === "ko" ? "오늘" : "Today";
  if (index === 0) {
    return lang === "ko"
      ? `${hourLabel(seg.endHour, lang)} 이전`
      : `Before ${hourLabel(seg.endHour, lang)}`;
  }
  if (index === count - 1) {
    return lang === "ko"
      ? `${hourLabel(seg.startHour, lang)} 이후`
      : `After ${hourLabel(seg.startHour, lang)}`;
  }
  return `${hourLabel(seg.startHour, lang)} – ${hourLabel(seg.endHour, lang)}`;
}

/** Measured, template-only summaries — no LLM, no invented numbers. */
function segmentSummary(seg: DaySegment, lang: Lang): string {
  if (seg.kind === "off") {
    return lang === "ko" ? "일정이 없습니다. 쉬는 날입니다." : "Nothing scheduled. It's a day off.";
  }
  if (seg.kind === "free") {
    const hours = seg.endHour - seg.startHour;
    return lang === "ko" ? `${hours}시간 비어 있습니다.` : `${hours} hours open.`;
  }
  const titles = seg.eventTitles.slice(0, 3).join(", ");
  const extra = seg.eventTitles.length - 3;
  const list = extra > 0 ? `${titles} +${extra}` : titles;
  return lang === "ko"
    ? `${seg.eventTitles.length}건: ${list}`
    : `${seg.eventTitles.length} scheduled: ${list}`;
}

function headline(segments: DaySegment[], meetingCount: number, lang: Lang): string {
  const only = segments.length === 1 ? segments[0] : null;
  if (only?.kind === "off") {
    return lang === "ko"
      ? "일정이 없습니다. 휴일입니다."
      : "Nothing on the calendar. It's a day off.";
  }
  if (only?.kind === "free" || meetingCount === 0) {
    return lang === "ko"
      ? "일정 없는 하루입니다. 긴 집중 블록을 쓸 수 있습니다."
      : "A clear day. Long focus blocks are yours.";
  }
  const firstBusy = segments.find((s) => s.kind === "busy");
  const lastFree = [...segments].reverse().find((s) => s.kind === "free");
  const n = meetingCount;
  if (firstBusy && segments[0] === firstBusy && lastFree === segments[segments.length - 1]) {
    // The screenshot shape: front-loaded, then open.
    const boundary = hourLabel(firstBusy.endHour, lang);
    return lang === "ko"
      ? `${boundary} 전에 ${n}건. 나머지는 비어 있습니다.`
      : `${n} before ${boundary}. The rest is open.`;
  }
  if (lastFree) {
    const free = lastFree.endHour - lastFree.startHour;
    return lang === "ko"
      ? `오늘 ${n}건, 비는 시간은 ${free}시간입니다.`
      : `${n} on the calendar, with ${free} open hours.`;
  }
  return lang === "ko" ? `오늘 ${n}건이 이어집니다.` : `${n} back to back today.`;
}

function dateLabel(now: Date, timeZone: string, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === "ko" ? "ko-KR" : "en-US", {
    timeZone,
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(now);
}

/** Sat/Sun in the user's timezone. */
function isWeekend(now: Date, timeZone: string): boolean {
  const day = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(now);
  return day === "Sat" || day === "Sun";
}

/**
 * Compute the structure for the user's current local day. Deterministic from
 * calendar + signals at read time — nothing to store or invalidate.
 */
export async function buildBriefingStructure(
  userId: string,
  topActions: BriefingTopAction[],
  now: Date = new Date(),
): Promise<BriefingStructure> {
  const [timeZone, config] = await Promise.all([
    getUserTimeZone(userId),
    prisma.automationConfig.findUnique({
      where: { userId },
      select: { notificationLanguage: true },
    }),
  ]);
  const lang = resolveNotificationLanguage(config?.notificationLanguage) as Lang;

  const { gte, lt } = localDayUtcRange(now, timeZone);
  const rows = await prisma.calendarEvent.findMany({
    where: { userId, allDay: false, startTime: { gte, lt } },
    orderBy: { startTime: "asc" },
    take: 50,
    select: { title: true, startTime: true, endTime: true },
  });
  const events = rows.map((row) => ({
    title: row.title,
    startHour: localHour(row.startTime, timeZone),
    endHour: localHour(row.endTime, timeZone),
  }));

  const shape = buildDayShape(events, isWeekend(now, timeZone) && events.length === 0);
  const count = shape.segments.length;
  return {
    dateLabel: dateLabel(now, timeZone, lang),
    headline: headline(shape.segments, shape.meetingCount, lang),
    segments: shape.segments.map((seg, i) => ({
      label: segmentLabel(seg, i, count, lang),
      summary: segmentSummary(seg, lang),
      kind: seg.kind,
    })),
    curve: shape.curve,
    dayStartHour: DAY_START_HOUR,
    attention: topActions
      .slice(0, 3)
      .map((a) => ({ rank: a.rank, action: a.action, reason: a.reason })),
  };
}

export const BRIEFING_DAY_END_HOUR = DAY_END_HOUR;
