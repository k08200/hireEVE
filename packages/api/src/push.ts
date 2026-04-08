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
): Promise<void> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.log(`[PUSH] Skipped — VAPID keys not configured`);
    return;
  }

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
  });

  if (subscriptions.length === 0) {
    console.log(`[PUSH] No push subscriptions for user ${userId} — browser push skipped`);
    return;
  }
  console.log(`[PUSH] Sending to ${subscriptions.length} subscription(s) for ${userId}: "${payload.title}"`);

  const data = JSON.stringify(payload);

  // Filter subscriptions with valid endpoints (re-validate after DB read to prevent stored SSRF)
  const validSubs = subscriptions.filter(
    (sub: { endpoint: string; p256dh: string; auth: string }) => {
      try {
        const parsed = new URL(sub.endpoint);
        if (parsed.protocol !== "https:") return false;
        const host = parsed.hostname.toLowerCase();
        if (
          host === "localhost" ||
          host === "127.0.0.1" ||
          host === "::1" ||
          host.endsWith(".internal") ||
          host.endsWith(".local")
        ) {
          return false;
        }
        const ipMatch = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
        if (ipMatch) {
          const [, a, b] = ipMatch.map(Number);
          if (
            a === 10 ||
            (a === 172 && b >= 16 && b <= 31) ||
            (a === 192 && b === 168) ||
            (a === 169 && b === 254) ||
            a === 0
          ) {
            return false;
          }
        }
        return true;
      } catch {
        return false;
      }
    },
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
      console.error(`[PUSH] Failed to send to subscription ${i}: status=${statusCode}, body=${body}, error=${result.reason}`);
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
