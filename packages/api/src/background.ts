/**
 * Background Agent — Lightweight real-time notifications
 *
 * Only handles time-critical checks that need sub-minute accuracy:
 * - Upcoming calendar events → pre-meeting notification (5 min before)
 *
 * NOTE: Task overdue/due-soon checks are handled by autonomous-agent.ts
 *       (which uses LLM reasoning for smarter, context-aware notifications)
 *       Reminders are handled by reminder-scheduler.ts
 *       Daily briefing & email classify are handled by automation-scheduler.ts
 *
 * Notifications are persisted to PostgreSQL (Notification model).
 */

import { prisma } from "./db.js";
import { getUpcomingMeetings } from "./meeting.js";
import { pushNotification } from "./websocket.js";

// Track already-notified items to prevent duplicates within a single server lifecycle
// Uses date-scoped keys to auto-expire: "task:uuid:2026-04-02"
const notifiedIds: Set<string> = new Set();

/** Get today's date string for scoping notification keys */
function todayKey(): string {
  return new Date().toISOString().split("T")[0];
}

/** Clean up old notification keys (keep only today's) */
function pruneNotifiedIds() {
  const today = todayKey();
  for (const key of notifiedIds) {
    const datePart = key.split(":").pop();
    if (datePart && datePart !== today && /^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
      notifiedIds.delete(key);
    }
  }
}

async function addNotification(
  userId: string,
  notif: { type: string; title: string; message: string; link?: string },
) {
  // Persist to DB
  const data: Record<string, unknown> = {
    userId,
    type: notif.type,
    title: notif.title,
    message: notif.message,
  };
  if (notif.link) data.link = notif.link;
  // eslint-disable-next-line -- link field added via db push, not yet in generated client
  const entry = await (
    prisma.notification as unknown as {
      create: (args: { data: Record<string, unknown> }) => Promise<{ id: string; createdAt: Date }>;
    }
  ).create({ data });

  // Push real-time via WebSocket
  pushNotification(userId, {
    id: entry.id,
    type: notif.type,
    title: notif.title,
    message: notif.message,
    link: notif.link,
    createdAt: entry.createdAt.toISOString(),
  });
}

export async function getNotifications(
  userId: string,
  options?: { unreadOnly?: boolean; limit?: number },
): Promise<
  Array<{
    id: string;
    type: string;
    title: string;
    message: string;
    isRead: boolean;
    link: string | null;
    createdAt: string;
  }>
> {
  const where: { userId: string; isRead?: boolean } = { userId };
  if (options?.unreadOnly) where.isRead = false;

  const rows = await prisma.notification.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: options?.limit || 50,
  });

  return rows.map((r: Record<string, unknown>) => ({
    id: r.id as string,
    type: r.type as string,
    title: r.title as string,
    message: r.message as string,
    isRead: r.isRead as boolean,
    link: (r.link as string | null) ?? null,
    createdAt: (r.createdAt as Date).toISOString(),
  }));
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  await prisma.notification.update({
    where: { id: notificationId },
    data: { isRead: true },
  });
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });
}

export async function clearNotifications(userId: string): Promise<void> {
  await prisma.notification.deleteMany({ where: { userId } });
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: meeting check has inherent nested logic (users → meetings → dedup → notify)
async function checkUpcomingMeetings() {
  try {
    // Check all users who have Google connected AND meeting automation enabled
    const usersWithGoogle = await prisma.userToken.findMany({
      where: { provider: "google" },
      select: { userId: true },
    });

    const now = Date.now();

    for (const { userId } of usersWithGoogle) {
      // Check if user has meetingAutoJoin enabled
      const config = await prisma.automationConfig.findUnique({
        where: { userId },
      });
      if (config && !config.meetingAutoJoin) continue;

      try {
        const meetings = await getUpcomingMeetings(userId);

        for (const meeting of meetings) {
          const startTime = new Date(meeting.start).getTime();
          const minutesUntil = (startTime - now) / 60_000;

          // Notify 5 minutes before meeting
          if (minutesUntil > 0 && minutesUntil <= 5) {
            const key = `meeting:${meeting.id}`;
            if (notifiedIds.has(key)) continue;

            // DB-based dedup: check if we already notified for this meeting today
            const existingNotif = await prisma.notification.findFirst({
              where: {
                userId,
                type: "meeting",
                message: { contains: meeting.id },
                createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
              },
            });
            if (existingNotif) {
              notifiedIds.add(key);
              continue;
            }
            notifiedIds.add(key);

            const msg = meeting.meetingLink
              ? `참가 링크: ${meeting.meetingLink} [${meeting.id}]`
              : `${meeting.summary} 곧 시작합니다 [${meeting.id}]`;

            await addNotification(userId, {
              type: "meeting",
              title: `${Math.ceil(minutesUntil)}분 후 회의: ${meeting.summary}`,
              message: msg,
              link: meeting.meetingLink || "/calendar",
            });

            // Also send browser push with meeting link
            try {
              const { sendPushNotification } = await import("./push.js");
              sendPushNotification(userId, {
                title: `${Math.ceil(minutesUntil)}분 후 회의`,
                body: meeting.summary,
                url: meeting.meetingLink || "/calendar",
              });
            } catch {
              // Push not available
            }

            console.log(
              `[BG] Upcoming meeting: "${meeting.summary}" in ${Math.ceil(minutesUntil)}min for user ${userId}`,
            );
          }
        }
      } catch {
        // Individual user's Google might be expired — skip
      }
    }
  } catch {
    // Meeting check is optional
  }
}

let intervalId: ReturnType<typeof setInterval> | null = null;

export function startBackgroundAgent() {
  if (intervalId) return;

  console.log("[BG] Background agent started (60s interval)");

  // Run immediately once
  checkUpcomingMeetings();

  // Then every 60 seconds — only meeting checks (task checks moved to autonomous-agent.ts)
  intervalId = setInterval(async () => {
    pruneNotifiedIds();
    await checkUpcomingMeetings();
  }, 60_000);
}

export function stopBackgroundAgent() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("[BG] Background agent stopped");
  }
}
