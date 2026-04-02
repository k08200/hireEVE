/**
 * Background Agent — EVE's autonomous brain
 *
 * Runs periodic checks:
 * 1. Overdue tasks → escalation
 * 2. Due-soon tasks → advance warning (24h)
 * 3. Upcoming calendar events → pre-meeting notification
 *
 * NOTE: Reminders are handled by reminder-scheduler.ts
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
  notif: { type: string; title: string; message: string },
) {
  // Persist to DB
  const entry = await prisma.notification.create({
    data: {
      userId,
      type: notif.type,
      title: notif.title,
      message: notif.message,
    },
  });

  // Push real-time via WebSocket
  pushNotification(userId, {
    id: entry.id,
    type: notif.type,
    title: notif.title,
    message: notif.message,
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

  return rows.map(
    (r: {
      id: string;
      type: string;
      title: string;
      message: string;
      isRead: boolean;
      createdAt: Date;
    }) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      message: r.message,
      isRead: r.isRead,
      createdAt: r.createdAt.toISOString(),
    }),
  );
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

async function checkOverdueTasks() {
  try {
    const now = new Date();
    const today = todayKey();
    const overdue = await prisma.task.findMany({
      where: {
        status: { not: "DONE" },
        dueDate: { lt: now },
      },
    });

    for (const task of overdue) {
      const key = `task:${task.id}:${today}`;
      if (notifiedIds.has(key)) continue;
      notifiedIds.add(key);

      await addNotification(task.userId, {
        type: "task",
        title: `마감 초과: ${task.title}`,
        message: `"${task.title}" 태스크가 ${task.dueDate?.toLocaleDateString("ko-KR")} 마감이었습니다.`,
      });
    }

    if (overdue.length > 0) {
      console.log(`[BG] Found ${overdue.length} overdue tasks`);
    }
  } catch (err) {
    console.error("[BG] Error checking overdue tasks:", err);
  }
}

async function checkDueSoonTasks() {
  try {
    const now = new Date();
    const today = todayKey();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const dueSoon = await prisma.task.findMany({
      where: {
        status: { not: "DONE" },
        dueDate: { gt: now, lte: in24h },
      },
    });

    for (const task of dueSoon) {
      const key = `task-soon:${task.id}:${today}`;
      if (notifiedIds.has(key)) continue;
      notifiedIds.add(key);

      const hoursLeft = Math.round(
        (task.dueDate!.getTime() - now.getTime()) / (60 * 60 * 1000),
      );

      await addNotification(task.userId, {
        type: "task",
        title: `마감 임박: ${task.title}`,
        message: `"${task.title}" 태스크가 ${hoursLeft}시간 후 마감입니다.`,
      });
    }

    if (dueSoon.length > 0) {
      console.log(`[BG] Found ${dueSoon.length} tasks due within 24h`);
    }
  } catch (err) {
    console.error("[BG] Error checking due-soon tasks:", err);
  }
}

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
            notifiedIds.add(key);

            const msg = meeting.meetingLink
              ? `참가 링크: ${meeting.meetingLink}`
              : `${meeting.summary} 곧 시작합니다`;

            await addNotification(userId, {
              type: "meeting",
              title: `${Math.ceil(minutesUntil)}분 후 회의: ${meeting.summary}`,
              message: msg,
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
  checkOverdueTasks();
  checkDueSoonTasks();
  checkUpcomingMeetings();

  // Then every 60 seconds
  intervalId = setInterval(async () => {
    pruneNotifiedIds();
    await checkOverdueTasks();
    await checkDueSoonTasks();
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
