/**
 * Automation Scheduler — Executes user-configured automations
 *
 * Handles:
 * - Daily Briefing: generates and delivers at user's configured briefingTime
 * - Email Auto-Classify: periodically classifies inbox emails
 * - Calendar Auto-Sync: syncs Google Calendar every 15 minutes
 *
 * Runs every 60 seconds, checks all users with active automation configs.
 */

import generateBriefing from "./briefing.js";
import { prisma } from "./db.js";
import { classifyEmails, getAuthedClient } from "./gmail.js";
import { sendPushNotification } from "./push.js";
import { pushNotification } from "./websocket.js";

let intervalId: ReturnType<typeof setInterval> | null = null;

const CHECK_INTERVAL_MS = 60_000; // 1 minute

// Track which users already received today's briefing (reset daily)
const briefingSentToday = new Map<string, string>(); // userId -> date string

function getTodayStr(): string {
  return new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD
}

function getCurrentHHMM(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

async function runAutomations() {
  try {
    const configs = await prisma.automationConfig.findMany();
    if (configs.length === 0) return;

    const today = getTodayStr();
    const currentTime = getCurrentHHMM();

    // Reset briefing tracker on new day
    for (const [userId, date] of briefingSentToday) {
      if (date !== today) briefingSentToday.delete(userId);
    }

    for (const config of configs) {
      // --- Daily Briefing ---
      if (config.dailyBriefing && !briefingSentToday.has(config.userId)) {
        if (currentTime === config.briefingTime) {
          try {
            console.log(`[AUTOMATION] Generating daily briefing for ${config.userId}`);
            const briefing = await generateBriefing(config.userId);

            // Save as note
            await prisma.note.create({
              data: {
                userId: config.userId,
                title: `Daily Briefing — ${new Date().toLocaleDateString("ko-KR")}`,
                content: briefing,
              },
            });

            // Create notification
            const notification = await prisma.notification.create({
              data: {
                userId: config.userId,
                type: "briefing",
                title: "Daily Briefing Ready",
                message: briefing.slice(0, 200) + (briefing.length > 200 ? "..." : ""),
              },
            });

            const briefingMsg = briefing.slice(0, 200) + (briefing.length > 200 ? "..." : "");

            // Push via WebSocket
            pushNotification(config.userId, {
              id: notification.id,
              type: "briefing",
              title: "Daily Briefing Ready",
              message: briefingMsg,
              createdAt: notification.createdAt.toISOString(),
            });

            // Send browser push
            sendPushNotification(config.userId, {
              title: "Daily Briefing Ready",
              body: briefingMsg,
              url: "/notes",
            });

            briefingSentToday.set(config.userId, today);
            console.log(`[AUTOMATION] Briefing delivered to ${config.userId}`);
          } catch (err) {
            console.error(`[AUTOMATION] Briefing failed for ${config.userId}:`, err);
          }
        }
      }

      // --- Calendar Auto-Sync (every 15 minutes) ---
      const minute = new Date().getMinutes();
      if (minute === 0 || minute === 15 || minute === 30 || minute === 45) {
        try {
          const auth = await getAuthedClient(config.userId);
          if (auth) {
            const { google } = await import("googleapis");
            const calendar = google.calendar({ version: "v3", auth });
            const now = new Date();
            const later = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

            const response = await calendar.events.list({
              calendarId: "primary",
              timeMin: now.toISOString(),
              timeMax: later.toISOString(),
              singleEvents: true,
              orderBy: "startTime",
              maxResults: 100,
            });

            for (const item of response.data.items || []) {
              const googleId = item.id || "";
              if (!googleId) continue;
              const startTime = item.start?.dateTime || item.start?.date || "";
              const endTime = item.end?.dateTime || item.end?.date || "";
              if (!startTime || !endTime) continue;

              let meetingLink: string | null = null;
              if (item.conferenceData?.entryPoints) {
                const video = item.conferenceData.entryPoints.find((e) => e.entryPointType === "video");
                if (video) meetingLink = video.uri || null;
              }
              if (!meetingLink && item.hangoutLink) meetingLink = item.hangoutLink;

              await prisma.calendarEvent.upsert({
                where: { googleId },
                create: {
                  userId: config.userId,
                  title: item.summary || "Untitled",
                  description: item.description || null,
                  startTime: new Date(startTime),
                  endTime: new Date(endTime),
                  location: item.location || null,
                  meetingLink,
                  allDay: !item.start?.dateTime,
                  googleId,
                },
                update: {
                  title: item.summary || "Untitled",
                  description: item.description || null,
                  startTime: new Date(startTime),
                  endTime: new Date(endTime),
                  location: item.location || null,
                  meetingLink,
                  allDay: !item.start?.dateTime,
                },
              });
            }
          }
        } catch {
          // Calendar sync failed — skip silently
        }
      }

      // --- Email Auto-Classify ---
      if (config.emailAutoClassify) {
        // Run classification every 30 minutes (check modulo)
        const minute = new Date().getMinutes();
        if (minute === 0 || minute === 30) {
          try {
            const result = await classifyEmails(config.userId, 10);
            if ("error" in result || !("summary" in result)) continue;

            const highPriority = result.summary.high;
            if (highPriority > 0) {
              const emailMsg = `You have ${highPriority} high-priority email(s) in your inbox.`;
              const notification = await prisma.notification.create({
                data: {
                  userId: config.userId,
                  type: "email",
                  title: "High Priority Emails",
                  message: emailMsg,
                },
              });

              pushNotification(config.userId, {
                id: notification.id,
                type: "email",
                title: "High Priority Emails",
                message: emailMsg,
                createdAt: notification.createdAt.toISOString(),
              });

              sendPushNotification(config.userId, {
                title: "High Priority Emails",
                body: emailMsg,
                url: "/email",
              });
            }
          } catch {
            // Gmail not connected — skip silently
          }
        }
      }
    }
  } catch (err) {
    console.error("[AUTOMATION] Scheduler error:", err);
  }
}

/** Start the automation scheduler */
export function startAutomationScheduler() {
  if (intervalId) return;

  console.log("[AUTOMATION] Scheduler started (checking every 60s)");

  // Run once on start
  runAutomations();

  // Then check every minute
  intervalId = setInterval(runAutomations, CHECK_INTERVAL_MS);
}

/** Stop the automation scheduler */
export function stopAutomationScheduler() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("[AUTOMATION] Scheduler stopped");
  }
}
