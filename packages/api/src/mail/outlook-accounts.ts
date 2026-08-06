/**
 * Table-backed Outlook account fan-out — Phase 3B, mirroring
 * mail/imap-accounts.ts: this module owns row selection, token decryption +
 * refresh, cursor persistence, and aggregation; outlook-sync.ts owns the
 * Graph conversation.
 *
 * Token lifecycle per row: decrypt → refresh when expired (Microsoft
 * ROTATES refresh tokens — the new cipher must be persisted or the chain
 * dies) → sync. Any auth failure (undecryptable cipher, invalid_grant on
 * refresh, 401/403 from Graph) flags the row via markLinkedInboxForReconnect
 * — the same durable "Reconnect" prompt the Google linked path uses — and
 * never blocks the user's other accounts.
 */

import { decryptOptional, decryptToken, encryptOptional, encryptToken } from "../crypto-tokens.js";
import { prisma } from "../db.js";
import { captureError } from "../sentry.js";
import { markLinkedInboxForReconnect } from "./gmail.js";
import { refreshOutlookTokens } from "./outlook-oauth.js";
import { syncOutlookInbox } from "./outlook-sync.js";

export interface OutlookSyncAggregate {
  fetched: number;
  inserted: number;
  classified: number;
  errors: number;
}

// Refresh slightly BEFORE expiry so a token that dies mid-sync is rare.
const EXPIRY_SLACK_MS = 2 * 60_000;

interface OutlookRow {
  id: string;
  email: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: Date | null;
  historyId: string | null;
}

/**
 * Resolve a usable bearer token for one row, refreshing (and persisting the
 * rotated ciphers) when needed. Returns null when the row cannot sync — the
 * caller skips it; reconnect marking already happened here.
 */
async function resolveAccessToken(userId: string, row: OutlookRow): Promise<string | null> {
  if (!row.accessToken) return null;

  let accessToken: string;
  let refreshToken: string | null;
  try {
    accessToken = decryptToken(row.accessToken);
    refreshToken = decryptOptional(row.refreshToken);
  } catch (err) {
    // Undecryptable cipher (key rotation gap, hand-edited row): durable flag,
    // fire-and-forget — same contract as the Google linked path.
    console.warn(`[outlook-accounts] undecryptable token for row ${row.id}:`, err);
    void markLinkedInboxForReconnect(userId, row.id, "OUTLOOK").catch((markErr) => {
      console.warn(`[outlook-accounts] reconnect mark failed for row ${row.id}:`, markErr);
    });
    return null;
  }

  const fresh = row.expiresAt && row.expiresAt.getTime() > Date.now() + EXPIRY_SLACK_MS;
  if (fresh) return accessToken;

  if (!refreshToken) {
    // Expired with no refresh token — nothing to do but ask the user.
    void markLinkedInboxForReconnect(userId, row.id, "OUTLOOK").catch((markErr) => {
      console.warn(`[outlook-accounts] reconnect mark failed for row ${row.id}:`, markErr);
    });
    return null;
  }

  const refreshed = await refreshOutlookTokens(refreshToken);
  if ("error" in refreshed) {
    // invalid_grant = revoked/aged-out; any other code is equally terminal
    // for this tick — flag and let the user re-link.
    void markLinkedInboxForReconnect(userId, row.id, "OUTLOOK").catch((markErr) => {
      console.warn(`[outlook-accounts] reconnect mark failed for row ${row.id}:`, markErr);
    });
    return null;
  }
  await prisma.linkedInboxAccount.updateMany({
    where: { id: row.id, userId },
    data: {
      accessToken: encryptToken(refreshed.accessToken),
      // Rotation: persist the NEW refresh token when Microsoft sent one;
      // keep the old cipher otherwise (some responses omit it).
      ...(refreshed.refreshToken ? { refreshToken: encryptOptional(refreshed.refreshToken) } : {}),
      expiresAt: refreshed.expiresAt,
      needsReconnect: false,
    },
  });
  return refreshed.accessToken;
}

/**
 * Sync every OUTLOOK row the user has. Returns null when there are none.
 * Accounts run serially (Graph throttles per app+mailbox); one account's
 * failure counts an error but never blocks the next.
 */
export async function syncOutlookAccountsForUser(
  userId: string,
): Promise<OutlookSyncAggregate | null> {
  const rows = await prisma.linkedInboxAccount.findMany({
    where: { userId, provider: "OUTLOOK" },
    orderBy: { createdAt: "asc" },
  });
  if (rows.length === 0) return null;

  const total: OutlookSyncAggregate = { fetched: 0, inserted: 0, classified: 0, errors: 0 };
  for (const row of rows) {
    if (!row.email) continue;
    try {
      const accessToken = await resolveAccessToken(userId, row);
      if (!accessToken) {
        total.errors += 1;
        continue;
      }
      const result = await syncOutlookInbox({
        userId,
        email: row.email,
        accessToken,
        linkedInboxAccountId: row.id,
        cursor: row.historyId,
      });
      total.fetched += result.fetched;
      total.inserted += result.inserted;
      total.classified += result.classified;
      total.errors += result.errors;
      if (result.authFailed) {
        void markLinkedInboxForReconnect(userId, row.id, "OUTLOOK").catch((markErr) => {
          console.warn(`[outlook-accounts] reconnect mark failed for row ${row.id}:`, markErr);
        });
        total.errors += 1;
        continue;
      }
      await prisma.linkedInboxAccount.updateMany({
        where: { id: row.id, userId },
        data: {
          // "Synced Xm ago" is the last successful CHECK, not last new mail.
          lastSyncedAt: new Date(),
          // Advance the delta cursor only when the sync learned a new link —
          // a throttled/failed tick keeps the old cursor and resumes.
          ...(result.cursor ? { historyId: result.cursor } : {}),
        },
      });
    } catch (err) {
      total.errors += 1;
      // console first — captureError is a no-op without a Sentry DSN.
      console.warn(`[outlook-accounts] sync failed for row ${row.id}:`, err);
      captureError(err, {
        tags: { scope: "outlook-accounts.account-sync" },
        extra: { userId, linkedInboxAccountId: row.id },
      });
    }
  }
  return total;
}
