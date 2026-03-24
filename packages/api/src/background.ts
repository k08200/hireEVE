/**
 * Background Agent — EVE's autonomous brain
 *
 * Runs periodic checks:
 * 1. Due reminders → notify user
 * 2. Upcoming calendar events → pre-meeting briefing
 * 3. New important emails → flag for attention
 * 4. Overdue tasks → escalation
 *
 * In production, this would be a separate worker process or cron job.
 * For MVP, it runs as an interval within the API server.
 */

import { prisma } from "./db.js";
import { checkDueReminders } from "./reminders.js";

interface Notification {
  id: string;
  type: "reminder" | "calendar" | "email" | "task";
  title: string;
  message: string;
  createdAt: string;
}

// In-memory notification queue (MVP — replace with DB/push in production)
const notifications: Map<string, Notification[]> = new Map();
// Track already-notified items to prevent duplicates
const notifiedIds: Set<string> = new Set();

function addNotification(userId: string, notif: Omit<Notification, "id" | "createdAt">) {
  const list = notifications.get(userId) || [];
  list.push({
    ...notif,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  });
  // Keep max 50 notifications
  if (list.length > 50) list.shift();
  notifications.set(userId, list);
}

export function getNotifications(userId: string): Notification[] {
  return notifications.get(userId) || [];
}

export function clearNotifications(userId: string): void {
  notifications.delete(userId);
}

async function checkReminders() {
  try {
    const due = await checkDueReminders();
    for (const r of due) {
      const key = `reminder:${r.id}`;
      if (notifiedIds.has(key)) continue;
      notifiedIds.add(key);

      addNotification(r.userId, {
        type: "reminder",
        title: r.title,
        message: r.description || `Reminder: ${r.title}`,
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

      addNotification(task.userId, {
        type: "task",
        title: `Overdue: ${task.title}`,
        message: `Task "${task.title}" was due ${task.dueDate?.toLocaleDateString()}`,
      });
    }

    if (overdue.length > 0) {
      console.log(`[BG] Found ${overdue.length} overdue tasks`);
    }
  } catch (err) {
    console.error("[BG] Error checking overdue tasks:", err);
  }
}

let intervalId: ReturnType<typeof setInterval> | null = null;

export function startBackgroundAgent() {
  if (intervalId) return;

  console.log("[BG] Background agent started (60s interval)");

  // Run immediately once
  checkReminders();
  checkOverdueTasks();

  // Then every 60 seconds
  intervalId = setInterval(async () => {
    await checkReminders();
    await checkOverdueTasks();
  }, 60_000);
}

export function stopBackgroundAgent() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("[BG] Background agent stopped");
  }
}
