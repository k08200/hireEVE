/**
 * Deterministic tier reasons, stored as keys and resolved for display.
 *
 * `AttentionItem.tierReason` is free text that may be LLM-authored, so the
 * rule-based reasons live alongside prose in the same column. Baking a
 * translated string in at write time would freeze each row in whatever
 * language was active the day it was written; storing the key and resolving it
 * where the row is displayed means switching language re-reads every existing
 * row, including old ones.
 *
 * Anything that is not a known key passes through untouched — that is how
 * LLM-authored reasons (already written in the user's language, see
 * poc-judge.ts) and rows written before this change keep working.
 */

import {
  type NotificationLanguage,
  resolveNotificationLanguage,
} from "../notify/notification-strings.js";

/** Keys are dotted and namespaced so free prose can never collide with one. */
export const STATIC_TIER_REASONS = {
  "action.lowRiskAuto": {
    en: "Low-risk action — eligible for auto-execution",
    ko: "위험이 낮은 작업 — 자동 실행 대상",
  },
  "action.awaitingApproval": {
    en: "Awaiting your approval",
    ko: "승인을 기다리는 중",
  },
  "task.overdueUrgent": {
    en: "Overdue URGENT task — last-chance interrupt before damage compounds",
    ko: "기한 지난 긴급 할 일 — 더 늦기 전 마지막 알림",
  },
  "task.overdueHigh": {
    en: "Overdue high-priority task needs immediate attention",
    ko: "기한 지난 높은 우선순위 할 일 — 즉시 확인 필요",
  },
  "task.urgentDueToday": {
    en: "Urgent task is due today",
    ko: "긴급 할 일이 오늘 마감",
  },
  "task.dueToday": {
    en: "Due today — added to review queue",
    ko: "오늘 마감 — 검토 큐에 추가함",
  },
  "meeting.startingNow": {
    en: "Meeting starts in minutes — interrupt now",
    ko: "곧 회의 시작 — 지금 알림",
  },
  "meeting.startingWithinHour": {
    en: "Meeting starts within the hour — prep now",
    ko: "한 시간 안에 회의 — 지금 준비",
  },
  "meeting.today": {
    en: "Today's meeting — prep recommended",
    ko: "오늘 회의 — 미리 준비 권장",
  },
  "commitment.overdueHighPriority": {
    en: "High-priority commitment is overdue — counterparty actively blocked",
    ko: "중요한 약속이 기한 초과 — 상대가 기다리는 중",
  },
  "commitment.overdue": {
    en: "Overdue commitment — may be blocking counterparty",
    ko: "기한 지난 약속 — 상대를 막고 있을 수 있음",
  },
  "commitment.needsDate": {
    en: "Needs date confirmation before surfacing",
    ko: "날짜 확인 후 표시 예정",
  },
  "commitment.dueSoon": {
    en: "Commitment due within 24 hours",
    ko: "24시간 안에 마감인 약속",
  },
  "commitment.tracked": {
    en: "Tracked commitment — added to review queue",
    ko: "추적 중인 약속 — 검토 큐에 추가함",
  },
} as const satisfies Record<string, Record<NotificationLanguage, string>>;
// `satisfies`, not an annotation: it checks language completeness at the TABLE
// (a new NOTIFICATION_LANGUAGES entry errors on the exact reason missing a
// translation) while keeping the literal key union that StaticTierReasonKey
// and its type guard depend on.

export type StaticTierReasonKey = keyof typeof STATIC_TIER_REASONS;

export function isStaticTierReasonKey(value: string): value is StaticTierReasonKey {
  return Object.hasOwn(STATIC_TIER_REASONS, value);
}

/**
 * Render a stored reason for display. Keys become copy in the reader's
 * language; anything else (LLM prose, rows written before this change) is
 * returned exactly as stored.
 */
export function resolveTierReason(
  stored: string | null | undefined,
  language?: string | null,
): string | null {
  if (!stored) return null;
  if (!isStaticTierReasonKey(stored)) return stored;
  return STATIC_TIER_REASONS[stored][resolveNotificationLanguage(language)];
}
