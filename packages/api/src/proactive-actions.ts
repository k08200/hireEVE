/**
 * Proactive Actions — Rule-based autonomous behaviors that run without LLM calls.
 *
 * These are the actions that make EVE feel like a real employee:
 * 1. Unanswered email detection → auto-create reminder
 * 2. Pre-meeting briefing → push notification 1 hour before
 * 3. Overdue task alerts → push notification
 * 4. Weekly review → summary notification every Monday
 *
 * Called from automation-scheduler.ts every 60 seconds per user.
 * All actions are idempotent (dedup via DB notification check).
 */

import { prisma } from "./db.js";
import { sendPushNotification } from "./push.js";
import { pushNotification } from "./websocket.js";

const UNANSWERED_THRESHOLD_HOURS = 48;
const MEETING_PREP_MINUTES = 60;
const WEEKLY_REVIEW_DAY = 1; // Monday

/** Check for emails that haven't been replied to in 48 hours */
async function checkUnansweredEmails(userId: string): Promise<void> {
  const threshold = new Date(Date.now() - UNANSWERED_THRESHOLD_HOURS * 60 * 60 * 1000);

  const unanswered = await prisma.emailMessage.findMany({
    where: {
      userId,
      isRead: true,
      priority: { in: ["URGENT", "NORMAL"] },
      receivedAt: { lte: threshold, gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      category: { notIn: ["automated", "newsletter"] },
    },
    select: { id: true, from: true, subject: true, receivedAt: true },
    take: 5,
  });

  if (unanswered.length === 0) return;

  // Dedup: check if we already notified about unanswered emails today
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const existing = await prisma.notification.findFirst({
    where: {
      userId,
      type: "email",
      title: { contains: "unanswered" },
      createdAt: { gte: todayStart },
    },
  });
  if (existing) return;

  const emailList = unanswered
    .map((e) => {
      const from = e.from
        .replace(/[<>]/g, "")
        .trim()
        .slice(0, 30);
      return `${from}: ${(e.subject || "No subject").slice(0, 40)}`;
    })
    .join("\n");

  const message = `${unanswered.length} email(s) waiting for your reply:\n${emailList}`;

  await notify(userId, "email", `${unanswered.length} unanswered email(s)`, message, "/email");
}

/** Send a notification 1 hour before meetings with a mini-brief */
async function checkUpcomingMeetings(userId: string): Promise<void> {
  const now = new Date();
  const soon = new Date(now.getTime() + MEETING_PREP_MINUTES * 60 * 1000);
  const justAfter = new Date(now.getTime() + (MEETING_PREP_MINUTES + 5) * 60 * 1000);

  // Find meetings starting in ~60 minutes (5 min window to avoid duplicates)
  const upcoming = await prisma.calendarEvent.findMany({
    where: {
      userId,
      startTime: { gte: soon, lte: justAfter },
    },
    select: {
      id: true,
      title: true,
      startTime: true,
      location: true,
      meetingLink: true,
      description: true,
    },
  });

  for (const event of upcoming) {
    // Dedup: check if we already sent a prep notification for this event
    const existing = await prisma.notification.findFirst({
      where: {
        userId,
        type: "calendar",
        title: { contains: event.title.slice(0, 20) },
        createdAt: { gte: new Date(Date.now() - 2 * 60 * 60 * 1000) },
      },
    });
    if (existing) continue;

    const time = event.startTime.toLocaleTimeString("ko-KR", {
      timeZone: "Asia/Seoul",
      hour: "2-digit",
      minute: "2-digit",
    });
    const location = event.location ? ` @ ${event.location}` : "";
    const link = event.meetingLink ? `\nJoin: ${event.meetingLink}` : "";

    const message = `${event.title} starts at ${time}${location}${link}`;

    await notify(
      userId,
      "calendar",
      `Meeting in 1 hour: ${event.title.slice(0, 30)}`,
      message,
      "/calendar",
    );
  }
}

/** Alert on tasks that are past their due date */
async function checkOverdueTasks(userId: string): Promise<void> {
  const now = new Date();

  const overdue = await prisma.task.findMany({
    where: {
      userId,
      status: { not: "DONE" },
      dueDate: { lt: now },
    },
    select: { id: true, title: true, dueDate: true, priority: true },
    take: 5,
  });

  if (overdue.length === 0) return;

  // Dedup: check if we already notified about overdue tasks today
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const existing = await prisma.notification.findFirst({
    where: {
      userId,
      type: "task",
      title: { contains: "overdue" },
      createdAt: { gte: todayStart },
    },
  });
  if (existing) return;

  const taskList = overdue
    .map((t) => {
      const due = t.dueDate ? t.dueDate.toLocaleDateString("ko-KR") : "";
      return `- ${t.title} (due: ${due})`;
    })
    .join("\n");

  const message = `${overdue.length} task(s) past deadline:\n${taskList}`;

  await notify(userId, "task", `${overdue.length} overdue task(s)`, message, "/tasks");
}

/** Weekly review summary every Monday morning */
async function checkWeeklyReview(userId: string): Promise<void> {
  const now = new Date();
  if (now.getDay() !== WEEKLY_REVIEW_DAY) return;
  if (now.getHours() !== 9 || now.getMinutes() > 5) return;

  // Dedup: check if we already sent a weekly review this week
  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  const existing = await prisma.notification.findFirst({
    where: {
      userId,
      type: "review",
      createdAt: { gte: weekStart },
    },
  });
  if (existing) return;

  const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [completedTasks, emailCount, meetingCount] = await Promise.all([
    prisma.task.count({
      where: { userId, status: "DONE", updatedAt: { gte: lastWeek } },
    }),
    prisma.emailMessage.count({
      where: { userId, receivedAt: { gte: lastWeek } },
    }),
    prisma.calendarEvent.count({
      where: { userId, startTime: { gte: lastWeek, lte: now } },
    }),
  ]);

  const message = `Last week: ${completedTasks} tasks completed, ${emailCount} emails processed, ${meetingCount} meetings attended.`;

  await notify(userId, "review", "Weekly Review", message, "/dashboard");
}

/** Create DB notification + WebSocket push + browser push */
async function notify(
  userId: string,
  type: string,
  title: string,
  message: string,
  url: string,
): Promise<void> {
  const notification = await prisma.notification.create({
    data: { userId, type, title, message },
  });

  pushNotification(userId, {
    id: notification.id,
    type,
    title,
    message,
    createdAt: notification.createdAt.toISOString(),
  });

  sendPushNotification(userId, { title, body: message.slice(0, 200), url });
}

/**
 * Run all proactive actions for a user.
 * Called from automation-scheduler.ts every 60 seconds.
 */
export async function runProactiveActions(userId: string): Promise<void> {
  try {
    await Promise.allSettled([
      checkUnansweredEmails(userId),
      checkUpcomingMeetings(userId),
      checkOverdueTasks(userId),
      checkWeeklyReview(userId),
    ]);
  } catch (err) {
    console.error(`[PROACTIVE] Error for ${userId}:`, err);
  }
}
