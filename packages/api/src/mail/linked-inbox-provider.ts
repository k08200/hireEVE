/**
 * Provider lookup for a linked inbox id (Phase 0b).
 *
 * The single-item delete/archive routes need one question answered before
 * they act: does this EmailMessage belong to a mailbox whose provider has no
 * Gmail-API action surface (NAVER today; ICLOUD/IMAP later)? For those the
 * route must refuse loudly — the old "Gmail not connected, remove locally"
 * fallback produced a false 200 whose local delete the next IMAP poll
 * resurrected as a brand-new message.
 *
 * A missing row answers false on purpose: the caller then follows its normal
 * not-connected path, which is the right behavior for a stale id.
 */

import { prisma } from "../db.js";

export async function isNonGoogleLinkedInbox(
  userId: string,
  linkedInboxAccountId: string | null,
): Promise<boolean> {
  if (!linkedInboxAccountId) return false;
  const row = await prisma.linkedInboxAccount.findFirst({
    where: { id: linkedInboxAccountId, userId },
    select: { provider: true },
  });
  return row ? row.provider !== "GOOGLE" : false;
}
