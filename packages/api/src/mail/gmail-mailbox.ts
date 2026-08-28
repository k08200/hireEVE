/**
 * Live folder listings — Sent / Drafts / Archived.
 *
 * Every serious mail client shows these folders; Klorn's local mirror is
 * INBOX-only by design (the classifier's input), so the folders are read live
 * from Gmail instead of widening the sync. `gmail.readonly` already covers
 * every label — no new scope.
 *
 * Listing is METADATA-ONLY: a folder view renders sender / subject / snippet /
 * time, and downloading 50 full MIME trees (bodies + attachment bytes) to
 * paint 50 rows is the mistake `fetchGmailEmails` makes acceptable only
 * because sync needs the bodies. Opening a message goes through the existing
 * detail path, which fetches exactly one.
 */

import { google } from "googleapis";
import { Semaphore } from "../semaphore.js";
import { getAuthedClient } from "./gmail.js";

export const MAILBOXES = ["sent", "drafts", "archived"] as const;
export type Mailbox = (typeof MAILBOXES)[number];

/** One row of a folder listing — what the list renders, nothing more. */
export interface MailboxItemWire {
  gmailId: string;
  threadId: string | null;
  subject: string;
  from: string;
  to: string;
  snippet: string;
  /** ISO. Gmail's internalDate (epoch ms) is the arrival authority. */
  receivedAt: string;
  isRead: boolean;
}

/**
 * The box → Gmail search mapping, exported for its tests: "archived" is a
 * negative-space query (mail that is in no folder at all) and every exclusion
 * carries weight — dropping `-in:trash` resurfaces deleted mail in a folder
 * the user thinks of as safe.
 */
export function buildMailboxQuery(box: Mailbox): string {
  switch (box) {
    case "sent":
      return "in:sent";
    case "drafts":
      return "in:draft";
    case "archived":
      return "-in:inbox -in:sent -in:draft -in:trash -in:spam -in:chats";
  }
}

const PAGE_SIZE = 50;
const METADATA_CONCURRENCY = 8;

function header(headers: { name?: string | null; value?: string | null }[], name: string): string {
  return headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

/**
 * List one folder, newest first, PAGE_SIZE rows. Returns null when Gmail is
 * not connected so the route can fall back to demo data the same way the
 * inbox list does. Metadata fetches run under a small semaphore — 50 parallel
 * requests is how a folder click turns into a Gmail 429.
 */
export async function listGmailMailbox(
  userId: string,
  box: Mailbox,
): Promise<MailboxItemWire[] | null> {
  const auth = await getAuthedClient(userId);
  if (!auth) return null;

  const gmail = google.gmail({ version: "v1", auth });
  const res = await gmail.users.messages.list({
    userId: "me",
    maxResults: PAGE_SIZE,
    q: buildMailboxQuery(box),
  });
  const ids = (res.data.messages ?? []).map((m) => m.id).filter((id): id is string => Boolean(id));

  const sem = new Semaphore(METADATA_CONCURRENCY);
  const rows = await sem.all<MailboxItemWire | null>(
    ids.map((id) => async () => {
      try {
        const detail = await gmail.users.messages.get({
          userId: "me",
          id,
          format: "metadata",
          metadataHeaders: ["From", "To", "Subject", "Date"],
        });
        const headers = detail.data.payload?.headers ?? [];
        const internal = Number(detail.data.internalDate);
        return {
          gmailId: detail.data.id ?? id,
          threadId: detail.data.threadId ?? null,
          subject: header(headers, "Subject"),
          from: header(headers, "From"),
          to: header(headers, "To"),
          snippet: detail.data.snippet ?? "",
          receivedAt: Number.isFinite(internal)
            ? new Date(internal).toISOString()
            : new Date(0).toISOString(),
          isRead: !(detail.data.labelIds ?? []).includes("UNREAD"),
        };
      } catch {
        // One unreadable message must not blank the folder.
        return null;
      }
    }),
  );
  return rows.filter((r): r is MailboxItemWire => r !== null);
}

/**
 * Delete the Gmail draft whose MESSAGE id is `gmailId`. The folder listing
 * hands out message ids (messages.list), but drafts.delete wants the DRAFT
 * id — deleting with the message id silently 404s and the draft lingers, so
 * this resolves through users.drafts.list first. Called after a draft-based
 * send so the original doesn't survive as a duplicate; best-effort by
 * contract (false = not found / not connected, never a throw for a missing
 * row).
 */
export async function deleteGmailDraftByMessageId(
  userId: string,
  gmailId: string,
): Promise<boolean> {
  const auth = await getAuthedClient(userId);
  if (!auth) return false;

  const gmail = google.gmail({ version: "v1", auth });
  const res = await gmail.users.drafts.list({ userId: "me", maxResults: 100 });
  const draft = (res.data.drafts ?? []).find((d) => d.message?.id === gmailId);
  if (!draft?.id) return false;
  await gmail.users.drafts.delete({ userId: "me", id: draft.id });
  return true;
}
