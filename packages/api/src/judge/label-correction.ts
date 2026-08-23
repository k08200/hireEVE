/**
 * Label correction — the other half of label mode.
 *
 * SaneBox's entire learning loop is "drag the mail to a different folder".
 * Klorn already learns from a tier move made *in the app*: it lands in an
 * append-only DecisionLabel ledger and two matching corrections make a sender
 * deterministic. Label mode put the same lanes into Gmail, which means a user
 * can now express the exact same correction by dragging a message from
 * `Klorn/Queue` to `Klorn/Push` — and until this, that correction went nowhere.
 *
 * The load-bearing decision here is what this module does NOT do: it does not
 * write a tier, and it does not write a ledger row. It calls
 * `overrideAttentionTier`, the same function the in-app move calls, so a
 * correction made in Gmail and one made in Klorn are indistinguishable
 * downstream — same transaction, same ledger, same effect on the sender prior.
 * A second write path here would be a second source of truth, and the two would
 * eventually disagree.
 *
 * Runs on the sync path, so it is best-effort in the strongest sense: a sync
 * must never fail because a correction could not be recorded.
 */

import { prisma } from "../db.js";
import { isLabelModeEnabled, laneForLabelIds } from "../mail/gmail-labels.js";
import { captureError } from "../sentry.js";
import { overrideAttentionTier } from "./attention-override.js";

export type LabelCorrectionResult = "corrected" | "unchanged" | "skipped";

/**
 * Reconcile what Gmail's labels say against the tier Klorn recorded.
 *
 * Ordered so the cheap checks come first: this runs for every message on every
 * sync, and the overwhelmingly common case is "nothing was dragged". The flag
 * check costs nothing, the lane lookup hits a warm in-process map, and only a
 * message that actually carries a lane label reaches the database.
 *
 * Note that Klorn's own label writes are self-consistent — after it stamps
 * `Klorn/Queue`, the next sync reads `Klorn/Queue` back and finds it already
 * agrees. Only a human moving the label produces a disagreement.
 */
export async function reconcileLabelCorrection(
  userId: string,
  emailDbId: string,
  labelIds: string[],
  linkedInboxAccountId?: string | null,
): Promise<LabelCorrectionResult> {
  if (!isLabelModeEnabled()) return "skipped";

  try {
    const lane = await laneForLabelIds(userId, labelIds, linkedInboxAccountId);
    if (!lane) return "skipped";

    const item = await prisma.attentionItem.findFirst({
      where: { userId, source: "EMAIL", sourceId: emailDbId, status: "OPEN" },
      select: { id: true, tier: true },
    });
    if (!item) return "skipped";

    // Gmail agrees with us — which is the normal case, because we are usually
    // the one who put that label there.
    if (item.tier === lane) return "unchanged";

    const result = await overrideAttentionTier(userId, item.id, lane);
    return result.ok ? "corrected" : "skipped";
  } catch (err) {
    console.warn(
      "[label-correction] could not reconcile:",
      err instanceof Error ? err.message : String(err),
    );
    captureError(err, {
      tags: { scope: "label-correction" },
      extra: { userId, emailDbId },
    });
    return "skipped";
  }
}
