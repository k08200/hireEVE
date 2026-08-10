/**
 * Activity-driven mail pull.
 *
 * The scheduler's per-user email sync sits behind gates a user can silently
 * fall out of (no AutomationConfig row, emailAutoClassify off, the plan
 * feature, the Google-connected set). With Gmail push unconfigured there is
 * then NO path at all: mail simply stops with no in-app signal — observed
 * live, ingestion frozen 2026-08-04 → 08-10 while every scheduler reported
 * healthy. This hook runs on user ACTIVITY (the firewall GET, which every
 * client polls), so opening Klorn always pulls.
 *
 * Deliberately its own module: the firewall read path must not statically
 * import the whole ingestion graph (googleapis, judge, persist) just to fire
 * a background pull. syncEmails is loaded on demand, inside the try.
 */

import { captureError } from "../sentry.js";

const mailSyncLastRun = new Map<string, number>();
const MAIL_SYNC_DEBOUNCE_MS = 60_000;
const ACTIVITY_SYNC_MAX_RESULTS = 30;

/**
 * Pull recent mail because the user is LOOKING at the app right now.
 * Fire-and-forget safe: never throws, debounced per user (60 s, in-memory —
 * the scheduler's own cadence, so an active user is not synced twice as
 * often as a passive one). `sync` is injectable for tests only.
 */
export async function ensureRecentMailSync(
  userId: string,
  sync?: (userId: string, maxResults: number) => Promise<unknown>,
): Promise<void> {
  const last = mailSyncLastRun.get(userId);
  if (last && Date.now() - last < MAIL_SYNC_DEBOUNCE_MS) return;
  mailSyncLastRun.set(userId, Date.now());
  try {
    const run = sync ?? (await import("./email-sync.js")).syncEmails;
    await run(userId, ACTIVITY_SYNC_MAX_RESULTS);
  } catch (err) {
    // "Gmail not connected" is the expected shape for a dead token — the
    // reconnect prompt is surfaced by /api/email/inboxes, not by shouting
    // here every 60 s. Anything else is a real fault worth a breadcrumb.
    const msg = err instanceof Error ? err.message : String(err);
    if (!/not connected/i.test(msg)) {
      console.warn(`[MAIL-SYNC] activity sync failed for ${userId}: ${msg}`);
      captureError(err, { tags: { scope: "mail.activity-sync" }, extra: { userId } });
    }
  }
}
