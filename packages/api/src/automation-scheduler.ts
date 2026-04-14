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
import {
  checkAutoReplyRules,
  generateSmartReply,
  reconcileEmails,
  summarizeUnsummarizedEmails,
  syncEmails,
} from "./email-sync.js";
import { getAuthedClient, renewExpiringGmailWatches, sendEmail, trashEmail } from "./gmail.js";
import { sendPushNotification } from "./push.js";
import { planHasFeature } from "./stripe.js";
import { pushNotification } from "./websocket.js";

let intervalId: ReturnType<typeof setInterval> | null = null;

const CHECK_INTERVAL_MS = 60_000; // 1 minute
const WATCH_RENEWAL_INTERVAL_MS = 60 * 60 * 1000; // hourly check for expiring Gmail watches

// In-memory cache to skip redundant DB queries within same process lifetime.
// Actual dedup is DB-based (survives server restarts).
const briefingSentToday = new Map<string, string>(); // userId -> date string
let lastWatchRenewalAt = 0;

function getTodayStr(): string {
  return new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD
}

/** DB-based check: did we already send a briefing notification today? */
async function hasBriefingBeenSentToday(userId: string): Promise<boolean> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const existing = await prisma.notification.findFirst({
    where: {
      userId,
      type: "briefing",
      createdAt: { gte: todayStart },
    },
  });
  return !!existing;
}

function getCurrentHHMM(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

async function runAutomations() {
  try {
    // Gmail watch renewal runs once per hour regardless of configs.
    // It is a no-op when GMAIL_PUBSUB_TOPIC is unset or no watches are due.
    if (Date.now() - lastWatchRenewalAt >= WATCH_RENEWAL_INTERVAL_MS) {
      lastWatchRenewalAt = Date.now();
      renewExpiringGmailWatches()
        .then(({ renewed, failed }) => {
          if (renewed + failed > 0) {
            console.log(`[GMAIL-WATCH] Renewal: ${renewed} renewed, ${failed} failed`);
          }
        })
        .catch((err) => {
          console.warn("[GMAIL-WATCH] Renewal sweep errored:", err);
        });
    }

    const configs = await prisma.automationConfig.findMany();
    if (configs.length === 0) return;

    // Fetch user plans for feature gating
    const configUserIds = configs.map((c) => c.userId);
    const automationUsers = await prisma.user.findMany({
      where: { id: { in: configUserIds } },
      select: { id: true, plan: true },
    });
    const automationPlanMap = new Map(automationUsers.map((u) => [u.id, u.plan]));

    const today = getTodayStr();
    const currentTime = getCurrentHHMM();

    // Reset briefing tracker on new day
    for (const [userId, date] of briefingSentToday) {
      if (date !== today) briefingSentToday.delete(userId);
    }

    for (const config of configs) {
      const configUserPlan = automationPlanMap.get(config.userId) || "FREE";

      // --- Daily Briefing (requires PRO+) ---
      if (
        config.dailyBriefing &&
        !briefingSentToday.has(config.userId) &&
        planHasFeature(configUserPlan, "daily_briefing")
      ) {
        if (currentTime === config.briefingTime) {
          // DB-based dedup: check if briefing was already sent today (survives restarts)
          const alreadySent = await hasBriefingBeenSentToday(config.userId);
          if (alreadySent) {
            briefingSentToday.set(config.userId, today);
            continue;
          }
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
                const video = item.conferenceData.entryPoints.find(
                  (e) => e.entryPointType === "video",
                );
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
        } catch (err) {
          const gaxiosErr = err as {
            response?: { status?: number; data?: { error?: { message?: string } } };
            message?: string;
          };
          const status = gaxiosErr.response?.status;
          console.error(
            `[AUTOMATION] Calendar sync failed for ${config.userId} (HTTP ${status}):`,
            gaxiosErr.response?.data?.error?.message || gaxiosErr.message || err,
          );

          // 401/403 = token invalid — notify user to reconnect
          if (status === 401 || status === 403) {
            const existingAlert = await prisma.notification.findFirst({
              where: {
                userId: config.userId,
                type: "calendar",
                title: { contains: "Google 연결 끊김" },
                createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
              },
            });
            if (!existingAlert) {
              await prisma.notification.create({
                data: {
                  userId: config.userId,
                  type: "calendar",
                  title: "Google 연결 끊김",
                  message:
                    "Google 캘린더 동기화가 중단되었습니다. 설정에서 Google 계정을 다시 연결해주세요.",
                  link: "/settings",
                },
              });
              pushNotification(config.userId, {
                id: crypto.randomUUID(),
                type: "calendar",
                title: "Google 연결 끊김",
                message: "설정에서 Google 계정을 다시 연결해주세요.",
                link: "/settings",
              });
            }
          }
        }
      }

      // --- Email Sync + AI Classify (requires PRO+ for classify, TEAM+ for auto-reply) ---
      if (config.emailAutoClassify && planHasFeature(configUserPlan, "email_auto_classify")) {
        // Run every 15 minutes (check modulo)
        const minute = new Date().getMinutes();
        if (minute % 15 === 0) {
          try {
            // Sync from Gmail → DB
            const syncResult = await syncEmails(config.userId, 20);

            // AI summarize new emails
            if (syncResult.newCount > 0) {
              await summarizeUnsummarizedEmails(config.userId, syncResult.newCount);
            }

            // Auto-delete LOW priority emails (ads/promotions) — trash in Gmail + remove from DB
            const lowEmails = await prisma.emailMessage.findMany({
              where: { userId: config.userId, priority: "LOW" },
              select: { id: true, gmailId: true },
            });
            for (const low of lowEmails) {
              try {
                await trashEmail(config.userId, low.gmailId);
                await prisma.emailMessage.delete({ where: { id: low.id } });
              } catch {
                // Gmail trash failed — just remove from local DB
                await prisma.emailMessage.delete({ where: { id: low.id } }).catch(() => {});
              }
            }

            // Auto-reply: check rules for newly synced emails (dedup by gmailId)
            // Requires TEAM+ plan for auto-reply
            if (syncResult.newCount > 0 && planHasFeature(configUserPlan, "email_auto_reply")) {
              const newEmails = await prisma.emailMessage.findMany({
                where: { userId: config.userId },
                orderBy: { syncedAt: "desc" },
                take: syncResult.newCount,
              });
              for (const email of newEmails) {
                try {
                  // Skip if we already sent an auto-reply notification for this email
                  const alreadyReplied = await prisma.notification.findFirst({
                    where: {
                      userId: config.userId,
                      type: "email",
                      title: "Auto-reply sent",
                      message: { contains: email.gmailId },
                    },
                  });
                  if (alreadyReplied) continue;

                  const matched = await checkAutoReplyRules(config.userId, email);
                  if (
                    matched &&
                    (matched.actionType === "AUTO_REPLY" || matched.actionType === "DRAFT_REPLY")
                  ) {
                    const replyBody = await generateSmartReply(matched.actionValue, {
                      from: email.from,
                      subject: email.subject,
                      body: email.body || "",
                    });
                    if (matched.actionType === "AUTO_REPLY") {
                      const emailMatch = email.from.match(/<([^>]+)>/) || [null, email.from];
                      const toAddr = emailMatch[1] || email.from;
                      await sendEmail(config.userId, toAddr, `Re: ${email.subject}`, replyBody);
                      const notification = await prisma.notification.create({
                        data: {
                          userId: config.userId,
                          type: "email",
                          title: "Auto-reply sent",
                          message: `Auto-replied to ${toAddr} (rule: "${matched.ruleName}") [${email.gmailId}]`,
                        },
                      });
                      pushNotification(config.userId, {
                        id: notification.id,
                        type: "email",
                        title: "Auto-reply sent",
                        message: `Auto-replied to ${toAddr}`,
                        createdAt: notification.createdAt.toISOString(),
                      });
                    }
                  }
                } catch {
                  // Auto-reply failed — non-critical
                }
              }
            }

            // Reconcile DB with Gmail (remove deleted/archived emails)
            // Run less frequently — only at 0 and 30 minute marks
            if (minute === 0 || minute === 30) {
              try {
                await reconcileEmails(config.userId);
              } catch (err) {
                console.error(`[AUTOMATION] Reconcile failed for ${config.userId}:`, err);
              }
            }

            // Check for urgent unread emails — notify only for NEW urgent emails
            // Only check truly new emails (synced in last hour) to avoid re-notifying old unread emails
            const urgentEmails = await prisma.emailMessage.findMany({
              where: {
                userId: config.userId,
                priority: "URGENT",
                isRead: false,
                syncedAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
              },
              orderBy: { receivedAt: "desc" },
              select: { id: true, gmailId: true, subject: true, from: true, summary: true },
            });

            if (urgentEmails.length > 0) {
              // Check which urgent emails we already notified about (by gmailId in message, last 7 days)
              const recentUrgentNotifs = await prisma.notification.findMany({
                where: {
                  userId: config.userId,
                  type: "email",
                  title: "긴급 이메일",
                  createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
                },
                select: { message: true },
              });
              const notifiedGmailIds = new Set(
                recentUrgentNotifs
                  .map((n) => {
                    const match = n.message.match(/\[([^\]]+)\]$/);
                    return match ? match[1] : null;
                  })
                  .filter(Boolean),
              );

              // Only notify for urgent emails we haven't notified about yet
              const newUrgent = urgentEmails.filter((e) => !notifiedGmailIds.has(e.gmailId));

              if (newUrgent.length > 0) {
                const top = newUrgent[0];
                const emailMsg =
                  newUrgent.length === 1
                    ? `긴급 이메일: ${top.summary || top.subject || "새 이메일"} (from: ${top.from || "unknown"}) [${top.gmailId}]`
                    : `긴급 이메일 ${newUrgent.length}건. 최신: ${top.summary || top.subject || ""} [${top.gmailId}]`;

                const notification = await prisma.notification.create({
                  data: {
                    userId: config.userId,
                    type: "email",
                    title: "긴급 이메일",
                    message: emailMsg,
                  },
                });

                pushNotification(config.userId, {
                  id: notification.id,
                  type: "email",
                  title: "긴급 이메일",
                  message: emailMsg,
                  createdAt: notification.createdAt.toISOString(),
                });

                sendPushNotification(config.userId, {
                  title: "[EVE] 긴급 이메일",
                  body: emailMsg,
                  url: "/email",
                });
              }
            }
          } catch {
            // Gmail not connected or sync failed — skip silently
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
