/**
 * MailProviderActions for providers with no action surface yet — NAVER today
 * (read-only IMAP ingestion), ICLOUD/OUTLOOK/IMAP until their phases land.
 *
 * Every mutation answers `{ unsupported: true }` so routes refuse loudly
 * (501) instead of hitting the "not connected, remove locally" fallback whose
 * false 200 the next IMAP poll resurrected (Phase 0b finding). The wire copy
 * is the exact string those 0b routes shipped.
 */

import type { InboxProviderName } from "../inbox-credentials.js";
import type { MailActionUnsupported, MailProviderActions } from "./types.js";

function refuse(action: string): MailActionUnsupported {
  return {
    unsupported: true,
    error: `This mailbox's provider does not support ${action} from Klorn yet.`,
  };
}

export function unsupportedMailActions(provider: InboxProviderName): MailProviderActions {
  return {
    provider,
    sendEmail: async () => refuse("sending mail"),
    createDraft: async () => refuse("drafts"),
    // Best-effort by contract — reply threading degrades, never errors.
    getReplyHeaders: async () => ({}),
    markAsRead: async () => refuse("mark as read"),
    toggleRead: async () => refuse("mark as read"),
    toggleStar: async () => refuse("star"),
    trash: async () => refuse("delete"),
    untrash: async () => refuse("restore"),
    archive: async () => refuse("archive"),
    unarchive: async () => refuse("restore"),
  };
}
