/**
 * Reminder Scheduler — Checks for due reminders and delivers notifications
 *
 * Runs on a 30-second interval:
 * 1. Finds PENDING reminders where remindAt <= now
 * 2. Creates Notification records in DB
 * 3. Pushes real-time notifications via WebSocket
 * 4. Updates reminder status to SENT
 */

import { prisma } from "./db.js";
import { sendPushNotification } from "./push.js";
import { pushNotification } from "./websocket.js";

let intervalId: ReturnType<typeof setInterval> | null = null;

const CHECK_INTERVAL_MS = 30_000; // 30 seconds

async function checkDueReminders() {
  try {
    const now = new Date();

    const dueReminders = await prisma.reminder.findMany({
      where: {
        status: "PENDING",
        remindAt: { lte: now },
      },
    });

    if (dueReminders.length === 0) return;

    console.log(`[REMINDER] Found ${dueReminders.length} due reminder(s)`);

    for (const reminder of dueReminders) {
      const msg = reminder.description || `Reminder: ${reminder.title}`;

      // Use transaction: create notification + mark SENT atomically
      const [notification] = await prisma.$transaction([
        prisma.notification.create({
          data: {
            userId: reminder.userId,
            type: "reminder",
            title: reminder.title,
            message: msg,
          },
        }),
        prisma.reminder.update({
          where: { id: reminder.id },
          data: { status: "SENT" },
        }),
      ]);

      // Push real-time notification via WebSocket
      pushNotification(reminder.userId, {
        id: notification.id,
        type: "reminder",
        title: reminder.title,
        message: msg,
        createdAt: notification.createdAt.toISOString(),
      });

      // Send browser push notification
      sendPushNotification(reminder.userId, {
        title: reminder.title,
        body: msg,
        url: "/reminders",
      });

      console.log(`[REMINDER] Delivered: "${reminder.title}" to user ${reminder.userId}`);
    }
  } catch (err) {
    console.error("[REMINDER] Scheduler error:", err);
  }
}

/** Start the reminder scheduler */
export function startReminderScheduler() {
  if (intervalId) return; // already running

  console.log("[REMINDER] Scheduler started (checking every 30s)");

  // Run immediately on start
  checkDueReminders();

  // Then check periodically
  intervalId = setInterval(checkDueReminders, CHECK_INTERVAL_MS);
}

/** Stop the reminder scheduler */
export function stopReminderScheduler() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("[REMINDER] Scheduler stopped");
  }
}
