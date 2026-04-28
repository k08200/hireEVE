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
import {
  createPushDeliveryAttempt,
  createSkippedPushDelivery,
  markPushAccepted,
  markPushFailed,
} from "./push-delivery.js";
import { recordPushAttempt } from "./push-rate-limit.js";

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_EMAIL = process.env.VAPID_EMAIL || "mailto:hello@hireeve.com";
const PUSH_RECEIPT_BASE_URL =
  process.env.PUSH_RECEIPT_BASE_URL || process.env.RENDER_EXTERNAL_URL || "";

interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushSendSummary {
  status: "sent" | "skipped";
  reason?: string;
  subscriptions: number;
  attempted: number;
  accepted: number;
  failed: number;
}

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webPush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  console.log("[PUSH] Web Push configured");
} else {
  console.log("[PUSH] Web Push disabled — missing VAPID keys");
}

/** Send push notification to all subscriptions of a user */
export async function sendPushNotification(
  userId: string,
  payload: { title: string; body: string; url?: string; notificationId?: string },
  category: NotifCategory = "system",
): Promise<PushSendSummary> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.log(`[PUSH] Skipped — VAPID keys not configured`);
    await recordSkipped(userId, payload.title, category, "missing_vapid_keys");
    return skipped("missing_vapid_keys");
  }

  // Respect per-user preferences and quiet hours
  const allowed = await shouldNotify(userId, category);
  if (!allowed) {
    console.log(`[PUSH] Suppressed by user prefs for ${userId} (${category})`);
    await recordSkipped(userId, payload.title, category, "user_preferences_or_quiet_hours");
    return skipped("user_preferences_or_quiet_hours");
  }

  // Global per-user rate limit — blocks phone ring; DB notification is
  // already persisted upstream so the bell still surfaces this event.
  const rate = recordPushAttempt(userId);
  if (!rate.allowed) {
    console.log(`[PUSH] Rate-limited for ${userId}: ${rate.reason} — "${payload.title}"`);
    await recordSkipped(
      userId,
      payload.title,
      category,
      `rate_limited:${rate.reason ?? "unknown"}`,
    );
    return skipped("rate_limited");
  }

  const subscriptions = (await prisma.pushSubscription.findMany({
    where: { userId },
  })) as PushSubscriptionRow[];

  if (subscriptions.length === 0) {
    console.log(`[PUSH] No push subscriptions for user ${userId} — browser push skipped`);
    await recordSkipped(userId, payload.title, category, "no_subscriptions");
    return skipped("no_subscriptions");
  }
  console.log(
    `[PUSH] Sending to ${subscriptions.length} subscription(s) for ${userId}: "${payload.title}"`,
  );

  let accepted = 0;
  let failed = 0;
  let attempted = 0;
  for (const sub of subscriptions) {
    if (!isSafePushEndpoint(sub.endpoint)) {
      await recordSkipped(userId, payload.title, category, "unsafe_endpoint");
      continue;
    }
    attempted++;
    const deliveryId = await createPushDeliveryAttempt({
      userId,
      subscriptionId: sub.id,
      endpoint: sub.endpoint,
      notificationId: payload.notificationId ?? null,
      category,
      title: payload.title,
    });
    try {
      await webPush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify({
          ...payload,
          deliveryId,
          receiptUrl: pushReceiptUrl(deliveryId),
        }),
      );
      await markPushAccepted(deliveryId);
      accepted++;
    } catch (err) {
      failed++;
      const statusCode = (err as { statusCode?: number })?.statusCode;
      const body = (err as { body?: string })?.body;
      await markPushFailed(deliveryId, { statusCode, body });
      console.error(
        `[PUSH] Failed to send to subscription ${sub.id}: status=${statusCode}, body=${body}, error=${err}`,
      );
      if (statusCode === 410 || statusCode === 404) {
        await prisma.pushSubscription.delete({
          where: { id: sub.id },
        });
        console.log(`[PUSH] Removed expired subscription ${sub.id}`);
      }
    }
  }
  console.log(`[PUSH] Sent ${accepted}/${attempted} push notifications successfully`);
  return {
    status: "sent",
    subscriptions: subscriptions.length,
    attempted,
    accepted,
    failed,
  };
}

/** Get the public VAPID key for client-side subscription */
export function getVapidPublicKey(): string {
  return VAPID_PUBLIC_KEY;
}

function skipped(reason: string): PushSendSummary {
  return { status: "skipped", reason, subscriptions: 0, attempted: 0, accepted: 0, failed: 0 };
}

async function recordSkipped(
  userId: string,
  title: string,
  category: NotifCategory,
  skipReason: string,
): Promise<void> {
  await createSkippedPushDelivery({ userId, category, title, skipReason });
}

function pushReceiptUrl(deliveryId: string): string | null {
  if (!PUSH_RECEIPT_BASE_URL) return null;
  return `${PUSH_RECEIPT_BASE_URL.replace(/\/+$/, "")}/api/notifications/push/receipts/${deliveryId}`;
}
