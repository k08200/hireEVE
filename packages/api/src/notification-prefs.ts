/**
 * Notification Preferences — per-user opt-out by category + quiet hours.
 *
 * Pure functions so push.ts and autonomous-agent.ts can gate notifications
 * consistently. Falls open when config is missing (default: notify).
 */

import { prisma } from "./db.js";

export type NotifCategory =
  | "email_urgent"
  | "meeting"
  | "task_due"
  | "agent_proposal"
  | "daily_briefing"
  | "system";

interface NotifPrefs {
  notifyEmailUrgent: boolean;
  notifyMeeting: boolean;
  notifyTaskDue: boolean;
  notifyAgentProposal: boolean;
  notifyDailyBriefing: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
}

function categoryEnabled(prefs: NotifPrefs, category: NotifCategory): boolean {
  switch (category) {
    case "email_urgent":
      return prefs.notifyEmailUrgent;
    case "meeting":
      return prefs.notifyMeeting;
    case "task_due":
      return prefs.notifyTaskDue;
    case "agent_proposal":
      return prefs.notifyAgentProposal;
    case "daily_briefing":
      return prefs.notifyDailyBriefing;
    case "system":
      return true; // System notifications are not category-filterable
  }
}

/**
 * Check if the current time falls within the user's quiet hours.
 * Supports windows that wrap midnight (e.g. 22:00 → 08:00).
 */
export function isInQuietHours(
  start: string | null,
  end: string | null,
  now: Date = new Date(),
): boolean {
  if (!start || !end) return false;
  const [sh, sm] = start.split(":").map((n) => Number.parseInt(n, 10));
  const [eh, em] = end.split(":").map((n) => Number.parseInt(n, 10));
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return false;

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;

  if (startMin === endMin) return false;
  if (startMin < endMin) {
    // Same-day window: e.g. 13:00–17:00
    return nowMin >= startMin && nowMin < endMin;
  }
  // Wraps midnight: e.g. 22:00–08:00
  return nowMin >= startMin || nowMin < endMin;
}

/**
 * Check if a notification should be delivered for a user + category.
 * Returns false if the category is disabled OR we're in quiet hours.
 */
export async function shouldNotify(userId: string, category: NotifCategory): Promise<boolean> {
  const config = await prisma.automationConfig.findUnique({ where: { userId } });
  if (!config) return true; // default: notify

  const prefs: NotifPrefs = {
    notifyEmailUrgent:
      (config as unknown as { notifyEmailUrgent?: boolean }).notifyEmailUrgent ?? true,
    notifyMeeting: (config as unknown as { notifyMeeting?: boolean }).notifyMeeting ?? true,
    notifyTaskDue: (config as unknown as { notifyTaskDue?: boolean }).notifyTaskDue ?? true,
    notifyAgentProposal:
      (config as unknown as { notifyAgentProposal?: boolean }).notifyAgentProposal ?? true,
    notifyDailyBriefing:
      (config as unknown as { notifyDailyBriefing?: boolean }).notifyDailyBriefing ?? true,
    quietHoursStart:
      (config as unknown as { quietHoursStart?: string | null }).quietHoursStart ?? null,
    quietHoursEnd: (config as unknown as { quietHoursEnd?: string | null }).quietHoursEnd ?? null,
  };

  if (!categoryEnabled(prefs, category)) return false;
  if (isInQuietHours(prefs.quietHoursStart, prefs.quietHoursEnd)) return false;
  return true;
}
