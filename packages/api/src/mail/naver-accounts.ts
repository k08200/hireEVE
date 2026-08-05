/**
 * Table-backed Naver account fan-out (Phase 0b,
 * docs/providers/multi-provider-plan.md).
 *
 * Naver credentials live in LinkedInboxAccount rows (provider NAVER) — the
 * four flat User columns are legacy, migrated by
 * 20260805170000_naver_into_linked_inbox and no longer read. That move is
 * what makes Naver multi-account: one row per connected mailbox.
 *
 * Separated from naver-imap.ts so the fan-out is unit-testable: this module
 * owns row selection, credential decryption, and aggregation; naver-imap.ts
 * owns the actual IMAP conversation.
 */

import { decryptToken } from "../crypto-tokens.js";
import { prisma } from "../db.js";
import { captureError } from "../sentry.js";
import { isAllowedImapHost } from "./is-allowed-imap-host.js";
import { syncNaverImap } from "./naver-imap.js";

export interface NaverSyncAggregate {
  fetched: number;
  inserted: number;
  classified: number;
  errors: number;
}

/**
 * Sync every NAVER row the user has. Returns null when there are none (the
 * scheduler treats that as "nothing to log"). Accounts run serially — Naver
 * rate-limits multiple LOGINs from one IP — and one account's failure counts
 * an error but never blocks the next.
 */
export async function syncNaverAccountsForUser(userId: string): Promise<NaverSyncAggregate | null> {
  const rows = await prisma.linkedInboxAccount.findMany({
    where: { userId, provider: "NAVER" },
    orderBy: { createdAt: "asc" },
  });
  if (rows.length === 0) return null;

  const total: NaverSyncAggregate = { fetched: 0, inserted: 0, classified: 0, errors: 0 };
  for (const row of rows) {
    // A NAVER row without IMAP credentials is half-migrated or hand-edited:
    // skip it (it will surface as needsReconnect through the UI), never throw.
    if (!row.email || !row.imapHost || !row.imapPasswordCipher) continue;
    // Re-validate the stored host at the connection boundary, not only at the
    // /connect write — a host that reaches this row by any other write path
    // must never open a TLS connection to an internal target.
    if (!isAllowedImapHost(row.imapHost)) {
      console.warn(
        `[naver-imap] poll skipped — host not allowlisted for row ${row.id}: ${row.imapHost}`,
      );
      continue;
    }
    try {
      const result = await syncNaverImap({
        userId,
        email: row.email,
        password: decryptToken(row.imapPasswordCipher),
        host: row.imapHost,
        linkedInboxAccountId: row.id,
      });
      total.fetched += result.fetched;
      total.inserted += result.inserted;
      total.classified += result.classified;
      total.errors += result.errors;
      // Stamp the last successful check (not just last new mail) so the UI's
      // "Synced Xm ago" is real — same contract as the Gmail linked-inbox path.
      await prisma.linkedInboxAccount.updateMany({
        where: { id: row.id, userId },
        data: { lastSyncedAt: new Date() },
      });
    } catch (err) {
      total.errors += 1;
      // console first — captureError is a no-op without a Sentry DSN, and a
      // silent per-account failure here would strand one mailbox invisibly.
      console.warn(`[naver-imap] sync failed for row ${row.id}:`, err);
      captureError(err, {
        tags: { scope: "naver-imap.account-sync" },
        extra: { userId, linkedInboxAccountId: row.id },
      });
    }
  }
  return total;
}
