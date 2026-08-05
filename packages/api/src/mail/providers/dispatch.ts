/**
 * Provider dispatch for mail actions (Phase 1 of
 * docs/providers/multi-provider-plan.md).
 *
 * `mailActionsFor` answers "which action surface does this message's mailbox
 * have?" from a linked-inbox id: the primary inbox (null id) is always the
 * Google OAuth account, a linked row dispatches on its `provider` column, and
 * a missing row deliberately resolves to GOOGLE — the caller then follows its
 * normal not-connected path, which is the right behavior for a stale id.
 * (This subsumes the Phase 0b `isNonGoogleLinkedInbox` helper.)
 *
 * Callers that already hold the provider (e.g. from a joined row) skip the
 * lookup with `mailActionsForProvider`.
 */

import { prisma } from "../../db.js";
import type { InboxProviderName } from "../inbox-credentials.js";
import { googleMailActions } from "./google.js";
import type { MailProviderActions } from "./types.js";
import { unsupportedMailActions } from "./unsupported.js";

const ACTIONS_BY_PROVIDER: Readonly<Record<InboxProviderName, MailProviderActions>> = {
  GOOGLE: googleMailActions,
  NAVER: unsupportedMailActions("NAVER"),
  ICLOUD: unsupportedMailActions("ICLOUD"),
  OUTLOOK: unsupportedMailActions("OUTLOOK"),
  IMAP: unsupportedMailActions("IMAP"),
};

export function mailActionsForProvider(provider: InboxProviderName): MailProviderActions {
  return ACTIONS_BY_PROVIDER[provider];
}

export async function mailActionsFor(
  userId: string,
  linkedInboxAccountId: string | null | undefined,
): Promise<MailProviderActions> {
  if (!linkedInboxAccountId) return googleMailActions;
  const row = await prisma.linkedInboxAccount.findFirst({
    where: { id: linkedInboxAccountId, userId },
    select: { provider: true },
  });
  return mailActionsForProvider((row?.provider as InboxProviderName) ?? "GOOGLE");
}
