/**
 * Gmail label mode — write the lane back into Gmail.
 *
 * SaneBox has run a profitable email-triage business since 2010 without ever
 * shipping a client: it moves mail into IMAP folders and you keep using
 * whatever you already read mail in. Klorn currently asks for the opposite —
 * open our app, or the classification may as well not exist. That is the
 * single biggest adoption tax we charge, and it is charged before the user has
 * any reason to trust us.
 *
 * This writes the decided lane back as a Gmail label, so Gmail, Apple Mail and
 * every other client show Klorn's judgement in a surface the user already has
 * open. Nothing about how the lane is decided changes.
 *
 * Deliberately narrow, for now:
 *
 *   - **Labels only. INBOX is not touched.** Moving mail out of the inbox is
 *     the behaviour that makes this genuinely valuable, and it is also the
 *     behaviour that loses a user's trust permanently if we get it wrong on
 *     day one. It is a separate, deliberate decision — not a side effect of
 *     turning labelling on.
 *   - **Exactly one lane label per message.** Applying a lane removes the other
 *     four in the same call, so a re-judge corrects the label instead of
 *     stacking a second one next to a stale one.
 *   - **Best-effort.** Every failure path returns a status; none of them throw.
 *     Classification must never fail because Gmail rate-limited a label write.
 *
 * Needs no new OAuth scope: `gmail.modify` — already requested at login —
 * covers both `labels.create` and `messages.modify`.
 *
 * Off by default behind `GMAIL_LABEL_MODE_ENABLED`.
 */

import { google } from "googleapis";
import { captureError } from "../sentry.js";
import { isGoogleAuthError, markLinkedInboxForReconnect, resolveMailClient } from "./gmail.js";

/** Lanes, as Gmail label names. `/` is how Gmail nests, so these appear under one parent. */
export const LANE_LABELS = {
  PUSH: "Klorn/Push",
  MEETING: "Klorn/Meeting",
  QUEUE: "Klorn/Queue",
  INFO: "Klorn/Info",
  SILENT: "Klorn/Silent",
} as const;

export type LaneLabelTier = keyof typeof LANE_LABELS;

export type ApplyLaneResult = "applied" | "skipped" | "failed";

function isLaneLabelTier(value: string): value is LaneLabelTier {
  return Object.hasOwn(LANE_LABELS, value);
}

/**
 * Label ids are per (user, account) and effectively immutable once created, so
 * they are cached in-process rather than re-listed for every message — a busy
 * sync would otherwise spend one `labels.list` per email.
 *
 * A TTL rather than a permanent cache because the user can delete a label in
 * Gmail at any time; when they do, the id goes stale and `messages.modify`
 * starts failing until the entry expires and we re-create it.
 */
const LABEL_CACHE_TTL_MS = 30 * 60 * 1000;

interface CacheEntry {
  ids: Record<LaneLabelTier, string>;
  expiresAt: number;
}

const labelCache = new Map<string, CacheEntry>();

/** Test seam: the cache is module-level state and would leak between cases. */
export function __resetLabelCacheForTests(): void {
  labelCache.clear();
}

export function isLabelModeEnabled(): boolean {
  return process.env.GMAIL_LABEL_MODE_ENABLED === "true";
}

function cacheKey(userId: string, linkedInboxAccountId?: string | null): string {
  return `${userId}::${linkedInboxAccountId ?? "primary"}`;
}

type GmailClient = ReturnType<typeof google.gmail>;

/**
 * Resolve every lane label id, creating the ones Gmail does not have yet.
 *
 * Throws on failure rather than returning a partial map: a half-resolved map
 * would apply one lane and silently fail to clear the others, which is exactly
 * the stale-double-label state the exclusivity rule exists to prevent. The
 * caller turns the throw into `"failed"` — and, importantly, nothing is cached,
 * so the next message retries instead of inheriting a broken map.
 */
async function ensureLaneLabelIds(
  gmail: GmailClient,
  key: string,
): Promise<Record<LaneLabelTier, string>> {
  const cached = labelCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.ids;

  const existing = await gmail.users.labels.list({ userId: "me" });
  const byName = new Map<string, string>();
  for (const label of existing.data.labels ?? []) {
    if (label.name && label.id) byName.set(label.name, label.id);
  }

  const ids = {} as Record<LaneLabelTier, string>;
  for (const [tier, name] of Object.entries(LANE_LABELS) as [LaneLabelTier, string][]) {
    const found = byName.get(name);
    if (found) {
      ids[tier] = found;
      continue;
    }
    const created = await gmail.users.labels.create({
      userId: "me",
      requestBody: {
        name,
        labelListVisibility: "labelShow",
        messageListVisibility: "show",
      },
    });
    const createdId = created.data.id;
    if (!createdId) throw new Error(`Gmail did not return an id for label "${name}"`);
    ids[tier] = createdId;
  }

  labelCache.set(key, { ids, expiresAt: Date.now() + LABEL_CACHE_TTL_MS });
  return ids;
}

/**
 * Stamp one message with its lane, clearing any other lane it used to carry.
 *
 * Never throws. `"skipped"` means we deliberately did nothing (flag off, or the
 * account is not a Gmail account); `"failed"` means we tried and could not.
 */
export async function applyLaneLabel(
  userId: string,
  gmailMessageId: string,
  // Accepts any tier string, not just the five, because the v1 judge still
  // emits the retired AUTO value while TIER_V2_ENABLED is off. Labelling is a
  // v2 surface; anything outside the five lanes is skipped here rather than
  // forcing every caller to remember the exception.
  tier: string,
  linkedInboxAccountId?: string | null,
): Promise<ApplyLaneResult> {
  if (!isLabelModeEnabled()) return "skipped";
  if (!gmailMessageId) return "skipped";
  if (!isLaneLabelTier(tier)) return "skipped";

  try {
    // Null covers both "Google not connected" and "this is a NAVER/IMAP inbox":
    // getAuthedInboxClient is provider-scoped to GOOGLE, so an IMAP account can
    // never resolve a client here. There are no Gmail labels to write for it.
    const auth = await resolveMailClient(userId, linkedInboxAccountId);
    if (!auth) return "skipped";

    const gmail = google.gmail({ version: "v1", auth });
    const ids = await ensureLaneLabelIds(gmail, cacheKey(userId, linkedInboxAccountId));

    const others = (Object.keys(LANE_LABELS) as LaneLabelTier[])
      .filter((t) => t !== tier)
      .map((t) => ids[t]);

    await gmail.users.messages.modify({
      userId: "me",
      id: gmailMessageId,
      requestBody: { addLabelIds: [ids[tier]], removeLabelIds: others },
    });
    return "applied";
  } catch (err) {
    if (isGoogleAuthError(err) && linkedInboxAccountId) {
      // try/catch rather than a trailing .catch(): this function's contract is
      // that it never throws, and that must not depend on the reconnect helper
      // returning a thenable.
      try {
        await markLinkedInboxForReconnect(userId, linkedInboxAccountId);
      } catch {
        // The reconnect flag is a nicety; failing to set it must not escalate.
      }
    }
    // A stale cached id is one cause of failure here; drop the entry so the
    // next message rebuilds it rather than failing forever against the same
    // dead label.
    labelCache.delete(cacheKey(userId, linkedInboxAccountId));
    console.warn(
      "[gmail-labels] could not apply lane label:",
      err instanceof Error ? err.message : String(err),
    );
    captureError(err, {
      tags: { scope: "gmail-label-mode" },
      extra: { userId, gmailMessageId, tier },
    });
    return "failed";
  }
}
