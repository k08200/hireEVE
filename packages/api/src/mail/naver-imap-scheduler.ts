/**
 * Naver IMAP polling scheduler.
 *
 * Every POLL_INTERVAL_MS, walks every User that has Naver IMAP connected
 * and runs syncNaverImapForUser on them. Errors from one user never block
 * the others — caught + logged.
 *
 * Why polling instead of IMAP IDLE: Render's free tier dyno can sleep,
 * and IMAP IDLE holds a TCP connection that breaks when the dyno wakes.
 * Polling every 5 minutes is the simplest robust shape; we can revisit
 * once we move off free tier.
 */

import { prisma } from "../db.js";
import { recordSchedulerTick, registerScheduler } from "../scheduler-heartbeat.js";
import { captureError } from "../sentry.js";
import { syncNaverAccountsForUser } from "./naver-accounts.js";

let intervalId: ReturnType<typeof setInterval> | null = null;
let firstTickTimer: ReturnType<typeof setTimeout> | null = null;
const POLL_INTERVAL_MS = 5 * 60_000; // 5 minutes

async function tickOnce(): Promise<void> {
  // Users come from the table now (Phase 0b) — one row per connected Naver
  // mailbox, so groupBy collapses a user's multiple accounts into one entry;
  // syncNaverAccountsForUser fans out over their rows itself.
  const owners = await prisma.linkedInboxAccount.groupBy({
    by: ["userId"],
    where: { provider: "NAVER" },
  });
  if (owners.length === 0) return;

  // Run serially — Naver IMAP per-user rate-limits aggressively when you
  // open multiple LOGIN sessions from the same IP in quick succession.
  for (const owner of owners) {
    try {
      const result = await syncNaverAccountsForUser(owner.userId);
      if (result) {
        console.log(
          `[naver-imap] user ${owner.userId}: fetched=${result.fetched} inserted=${result.inserted} errors=${result.errors}`,
        );
      }
    } catch (err) {
      // Terminal handler for the per-user Naver sync — console first so a
      // failure is visible without a Sentry DSN (self-host / dev).
      console.warn(`[naver-imap-scheduler] sync failed for user ${owner.userId}:`, err);
      captureError(err, {
        tags: { scope: "naver-imap-scheduler" },
        extra: { userId: owner.userId },
      });
    }
  }
}

export function startNaverImapScheduler(): void {
  // Guard the boot window too: intervalId isn't set until the first tick fires
  // ~30s in, so a second start() call before then would schedule a duplicate
  // first tick. Track the setTimeout handle so the double-start guard covers it.
  if (intervalId || firstTickTimer) return;
  registerScheduler("naver-imap", POLL_INTERVAL_MS);
  // First tick after 30s so the API server can finish booting before
  // we open IMAP sockets. Subsequent ticks on the regular interval.
  firstTickTimer = setTimeout(() => {
    firstTickTimer = null;
    recordSchedulerTick("naver-imap");
    tickOnce().catch((err) =>
      captureError(err, { tags: { scope: "naver-imap-scheduler.first-tick" } }),
    );
    intervalId = setInterval(() => {
      recordSchedulerTick("naver-imap");
      tickOnce().catch((err) =>
        captureError(err, { tags: { scope: "naver-imap-scheduler.tick" } }),
      );
    }, POLL_INTERVAL_MS);
  }, 30_000);
  console.log(
    `[naver-imap-scheduler] started — first tick in 30s, then every ${POLL_INTERVAL_MS / 1000}s`,
  );
}

export function stopNaverImapScheduler(): void {
  if (firstTickTimer) {
    clearTimeout(firstTickTimer);
    firstTickTimer = null;
  }
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
