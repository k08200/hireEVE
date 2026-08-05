/**
 * Which EmailMessage rows the auto-reply sweep may act on (Phase 1
 * per-account send routing, docs/providers/multi-provider-plan.md).
 *
 * No linked ids → the exact historical primary-only filter (the flag is off,
 * or multi-inbox sync is off, so linked rows never have new mail anyway).
 * With ids → primary plus exactly those accounts. Callers pass only linked
 * GOOGLE accounts that actually synced this tick — never every linked row:
 * an IMAP provider (NAVER) has no send surface, so a reply "from" it would
 * either fail or leave from the wrong address.
 */

export function autoReplyEmailWhere(
  userId: string,
  linkedInboxAccountIds: string[],
):
  | { userId: string; linkedInboxAccountId: null }
  | {
      userId: string;
      OR: Array<{ linkedInboxAccountId: null } | { linkedInboxAccountId: { in: string[] } }>;
    } {
  if (linkedInboxAccountIds.length === 0) {
    return { userId, linkedInboxAccountId: null };
  }
  return {
    userId,
    OR: [{ linkedInboxAccountId: null }, { linkedInboxAccountId: { in: linkedInboxAccountIds } }],
  };
}
