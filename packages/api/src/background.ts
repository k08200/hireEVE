/**
 * Background Agent — EVE's autonomous brain
 *
 * Runs periodic checks:
 * 1. Due reminders → notify user
 * 2. Upcoming calendar events → pre-meeting briefing
 * 3. Overdue tasks → escalation
 * 4. Daily briefing → auto-generate at configured time
 *
 * Notifications are persisted to PostgreSQL (Notification model).
 */

import { prisma } from "./db.js";
import { getUpcomingMeetings } from "./meeting.js";
import { checkDueReminders } from "./reminders.js";
import { pushNotification } from "./websocket.js";

// Track already-notified items to prevent duplicates within a single server lifecycle
const notifiedIds: Set<string> = new Set();
// Track last briefing date per user to avoid duplicates
const lastBriefingDate: Map<string, string> = new Map();

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

  return rows.map((r: { id: string; type: string; title: string; message: string; isRead: boolean; createdAt: Date }) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    message: r.message,
    isRead: r.isRead,
    createdAt: r.createdAt.toISOString(),
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

async function checkReminders() {
  try {
    const due = await checkDueReminders();
    for (const r of due) {
      const key = `reminder:${r.id}`;
      if (notifiedIds.has(key)) continue;
      notifiedIds.add(key);

      await addNotification(r.userId, {
        type: "reminder",
        title: r.title,
        message: r.description || `리마인더: ${r.title}`,
      });
      console.log(`[BG] Reminder due: "${r.title}" for user ${r.userId}`);
    }
  } catch (err) {
    console.error("[BG] Error checking reminders:", err);
  }
}

async function checkOverdueTasks() {
  try {
    const now = new Date();
    const overdue = await prisma.task.findMany({
      where: {
        status: { not: "DONE" },
        dueDate: { lt: now },
      },
      include: { user: true },
    });

    for (const task of overdue) {
      const key = `task:${task.id}`;
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

async function checkUpcomingMeetings() {
  try {
    const meetings = await getUpcomingMeetings("demo-user");
    const now = Date.now();

    for (const meeting of meetings) {
      const startTime = new Date(meeting.start).getTime();
      const minutesUntil = (startTime - now) / 60_000;

      // Notify 5 minutes before meeting
      if (minutesUntil > 0 && minutesUntil <= 5) {
        const key = `meeting:${meeting.id}`;
        if (notifiedIds.has(key)) continue;
        notifiedIds.add(key);

        await addNotification("demo-user", {
          type: "meeting",
          title: `${Math.ceil(minutesUntil)}분 후 회의: ${meeting.summary}`,
          message: meeting.meetingLink
            ? `참가: ${meeting.meetingLink}`
            : `${meeting.summary} 곧 시작합니다`,
        });
        console.log(`[BG] Upcoming meeting: "${meeting.summary}" in ${Math.ceil(minutesUntil)}min`);
      }
    }
  } catch {
    // Meeting check is optional — Google might not be connected
  }
}

async function checkDailyBriefing() {
  try {
    // Get all users with dailyBriefing enabled
    const configs = await prisma.automationConfig.findMany({
      where: { dailyBriefing: true },
      include: { user: true },
    });

    const now = new Date();
    const kstHour = new Date(now.getTime() + 9 * 60 * 60 * 1000).getUTCHours();
    const kstMinute = new Date(now.getTime() + 9 * 60 * 60 * 1000).getUTCMinutes();
    const today = now.toISOString().split("T")[0];

    for (const config of configs) {
      const [targetHour, targetMinute] = config.briefingTime.split(":").map(Number);

      // Check if it's within the target time window (±2 minutes)
      if (kstHour === targetHour && Math.abs(kstMinute - targetMinute) <= 2) {
        // Check if we already sent today
        const lastDate = lastBriefingDate.get(config.userId);
        if (lastDate === today) continue;

        lastBriefingDate.set(config.userId, today);

        console.log(`[BG] Generating daily briefing for user ${config.userId}`);

        // Generate briefing asynchronously
        try {
          const { default: generateBriefing } = await import("./briefing.js");
          const briefing = await generateBriefing(config.userId);

          // Save as note
          await prisma.note.create({
            data: {
              userId: config.userId,
              title: `Daily Briefing — ${now.toLocaleDateString("ko-KR")}`,
              content: briefing,
            },
          });

          // Notify user
          await addNotification(config.userId, {
            type: "briefing",
            title: "오늘의 브리핑이 준비되었습니다",
            message: briefing.slice(0, 200) + (briefing.length > 200 ? "..." : ""),
          });
        } catch (err) {
          console.error(`[BG] Failed to generate briefing for ${config.userId}:`, err);
        }
      }
    }
  } catch (err) {
    console.error("[BG] Error checking daily briefing:", err);
  }
}

let intervalId: ReturnType<typeof setInterval> | null = null;

export function startBackgroundAgent() {
  if (intervalId) return;

  console.log("[BG] Background agent started (60s interval)");

  // Run immediately once
  checkReminders();
  checkOverdueTasks();
  checkUpcomingMeetings();

  // Then every 60 seconds
  intervalId = setInterval(async () => {
    await checkReminders();
    await checkOverdueTasks();
    await checkUpcomingMeetings();
    await checkDailyBriefing();
  }, 60_000);
}

export function stopBackgroundAgent() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("[BG] Background agent stopped");
  }
}
