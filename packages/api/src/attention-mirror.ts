/**
 * Producer that mirrors PendingAction lifecycle into AttentionItem.
 *
 * Call shape:
 *   - After `pendingAction.create` →  upsertAttentionForPendingAction(...)
 *   - After a single PA status update →  upsertAttentionForPendingAction(...)
 *   - After a bulk PA status update (e.g. expire) →
 *       bulkResolveAttentionForPendingActions(ids, finalStatus)
 *
 * Upserts are idempotent and keyed on (source=PENDING_ACTION, sourceId=pa.id),
 * so re-running is always safe — useful when chat.ts updates a PA twice within
 * the approve flow (claim → result/error).
 *
 * Failures are caught and logged but do not throw, since the AttentionItem is
 * a derived projection and the source PendingAction is the source of truth.
 * Future PRs can flip this to strict consistency if needed.
 */

import type { AttentionStatus, AttentionType } from "@prisma/client";
import { prisma } from "./db.js";

export interface PendingActionLike {
  id: string;
  userId: string;
  toolName: string;
  status: string;
  reasoning: string | null;
}

const TITLE_MAX_LEN = 120;

function statusFor(paStatus: string): AttentionStatus {
  switch (paStatus) {
    case "PENDING":
      return "OPEN";
    case "REJECTED":
      return "DISMISSED";
    // EXECUTED + FAILED both close the loop — the user has already seen the
    // outcome message in the chat, so the queue entry is resolved either way.
    case "EXECUTED":
    case "FAILED":
      return "RESOLVED";
    default:
      return "OPEN";
  }
}

function titleFor(pa: PendingActionLike): string {
  const reason = pa.reasoning?.trim();
  if (reason)
    return reason.length > TITLE_MAX_LEN ? `${reason.slice(0, TITLE_MAX_LEN - 1)}…` : reason;
  return pa.toolName.replace(/_/g, " ");
}

/**
 * Upsert the AttentionItem mirroring this PendingAction. Safe to call after
 * either a create or an update — uses the (source, sourceId) unique key.
 */
export async function upsertAttentionForPendingAction(pa: PendingActionLike): Promise<void> {
  const status = statusFor(pa.status);
  const isResolved = status !== "OPEN";
  const type: AttentionType = "DECISION";

  try {
    await prisma.attentionItem.upsert({
      where: { source_sourceId: { source: "PENDING_ACTION", sourceId: pa.id } },
      create: {
        userId: pa.userId,
        source: "PENDING_ACTION",
        sourceId: pa.id,
        type,
        status,
        title: titleFor(pa),
        body: pa.reasoning,
        suggestedAction: pa.toolName.replace(/_/g, " "),
        resolvedAt: isResolved ? new Date() : null,
      },
      update: {
        status,
        resolvedAt: isResolved ? new Date() : null,
      },
    });
  } catch (err) {
    console.warn("[attention-mirror] upsert failed for PendingAction", pa.id, err);
  }
}

/**
 * Mark every AttentionItem mirroring one of these PendingActions as resolved.
 * Used by bulk lifecycle operations (expire job, cascade cleanup) where we
 * already know the final status applies uniformly to the whole batch.
 */
export async function bulkResolveAttentionForPendingActions(
  pendingActionIds: string[],
  finalStatus: "REJECTED" | "EXECUTED" | "FAILED",
): Promise<void> {
  if (pendingActionIds.length === 0) return;
  const status = statusFor(finalStatus);
  try {
    await prisma.attentionItem.updateMany({
      where: {
        source: "PENDING_ACTION",
        sourceId: { in: pendingActionIds },
      },
      data: {
        status,
        resolvedAt: new Date(),
      },
    });
  } catch (err) {
    console.warn(
      "[attention-mirror] bulkResolveAttentionForPendingActions failed",
      pendingActionIds.length,
      err,
    );
  }
}

/**
 * Delete the AttentionItem(s) mirroring the given PendingAction ids. Used when
 * the source rows themselves are deleted (e.g. clearing a conversation).
 */
export async function deleteAttentionForPendingActions(pendingActionIds: string[]): Promise<void> {
  if (pendingActionIds.length === 0) return;
  try {
    await prisma.attentionItem.deleteMany({
      where: { source: "PENDING_ACTION", sourceId: { in: pendingActionIds } },
    });
  } catch (err) {
    console.warn("[attention-mirror] deleteAttentionForPendingActions failed", err);
  }
}
