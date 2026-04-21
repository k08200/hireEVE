/**
 * Web Push — Send browser push notifications
 *
 * Uses the Web Push protocol to deliver notifications to subscribed browsers.
 * Requires VAPID keys (generate with: npx web-push generate-vapid-keys)
 *
 * Environment variables:
 * - VAPID_PUBLIC_KEY
 * - VAPID_PRIVATE_KEY
 * - VAPID_EMAIL (mailto: contact email)
 */

import webPush from "web-push";
import { prisma } from "./db.js";
import { isSafePushEndpoint } from "./is-safe-push-endpoint.js";
import { type NotifCategory, shouldNotify } from "./notification-prefs.js";
import { recordPushAttempt } from "./push-rate-limit.js";

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_EMAIL = process.env.VAPID_EMAIL || "mailto:hello@hireeve.com";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webPush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  console.log("[PUSH] Web Push configured");
} else {
  console.log("[PUSH] Web Push disabled — missing VAPID keys");
}

/** Send push notification to all subscriptions of a user */
export async function sendPushNotification(
  userId: string,
  payload: { title: string; body: string; url?: string },
  category: NotifCategory = "system",
): Promise<void> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.log(`[PUSH] Skipped — VAPID keys not configured`);
    return;
  }

  // Respect per-user preferences and quiet hours
  const allowed = await shouldNotify(userId, category);
  if (!allowed) {
    console.log(`[PUSH] Suppressed by user prefs for ${userId} (${category})`);
    return;
  }

  // Global per-user rate limit — blocks phone ring; DB notification is
  // already persisted upstream so the bell still surfaces this event.
  const rate = recordPushAttempt(userId);
  if (!rate.allowed) {
    console.log(`[PUSH] Rate-limited for ${userId}: ${rate.reason} — "${payload.title}"`);
    return;
  }

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
  });

  if (subscriptions.length === 0) {
    console.log(`[PUSH] No push subscriptions for user ${userId} — browser push skipped`);
    return;
  }
  console.log(
    `[PUSH] Sending to ${subscriptions.length} subscription(s) for ${userId}: "${payload.title}"`,
  );

  const data = JSON.stringify(payload);

  // Re-validate endpoints after DB read to prevent stored SSRF.
  const validSubs = subscriptions.filter((sub: { endpoint: string }) =>
    isSafePushEndpoint(sub.endpoint),
  );

  const results = await Promise.allSettled(
    validSubs.map((sub: { endpoint: string; p256dh: string; auth: string }) =>
      webPush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        data,
      ),
    ),
  );

  // Log results and clean up expired/invalid subscriptions
  let successCount = 0;
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled") {
      successCount++;
    } else if (result.status === "rejected") {
      const statusCode = (result.reason as { statusCode?: number })?.statusCode;
      const body = (result.reason as { body?: string })?.body;
      console.error(
        `[PUSH] Failed to send to subscription ${i}: status=${statusCode}, body=${body}, error=${result.reason}`,
      );
      if (statusCode === 410 || statusCode === 404) {
        await prisma.pushSubscription.delete({
          where: { id: validSubs[i].id },
        });
        console.log(`[PUSH] Removed expired subscription ${validSubs[i].id}`);
      }
    }
  }
  console.log(`[PUSH] Sent ${successCount}/${results.length} push notifications successfully`);
}

/** Get the public VAPID key for client-side subscription */
export function getVapidPublicKey(): string {
  return VAPID_PUBLIC_KEY;
}
