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

// ─── Tasks ──────────────────────────────────────────────────────────────────
// Tasks have a time-based surfacing rule: they only enter the queue once the
// dueDate is today or already past. The producer is therefore not "every task
// change" — it's "tasks whose due window is open." Callers fall into two
// shapes: (a) write-time hooks for status/dueDate changes, (b) read-time
// backfill from `buildInboxSummary`.

export interface TaskLike {
  id: string;
  userId: string;
  title: string;
  status: string;
  priority: string;
  dueDate: Date | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfTodayMs(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function priorityForTask(task: TaskLike, isOverdue: boolean): number {
  let p = 50;
  if (isOverdue) p += 20;
  if (task.priority === "URGENT") p += 20;
  else if (task.priority === "HIGH") p += 10;
  return p;
}

/**
 * Surface a task into the queue if its due window is open. No-op for tasks
 * that are not yet due today, so this is safe to call on every task change.
 *
 * If the task is already DONE we clear the AttentionItem instead — the user
 * already finished it, so the queue entry should resolve.
 */
export async function upsertAttentionForTask(task: TaskLike, now = Date.now()): Promise<void> {
  // No due date → no time-based surfacing rule applies.
  if (!task.dueDate) return;

  const dueMs = task.dueDate.getTime();
  if (!Number.isFinite(dueMs)) return;

  const todayStart = startOfTodayMs(now);
  const tomorrowStart = todayStart + DAY_MS;

  // Only surface if due today or earlier. Future-dated tasks stay invisible
  // until their day comes.
  if (dueMs >= tomorrowStart) return;

  const isOverdue = dueMs < todayStart;
  const status: AttentionStatus = task.status === "DONE" ? "RESOLVED" : "OPEN";
  const isResolved = status !== "OPEN";
  const type: AttentionType = "DEADLINE";

  try {
    await prisma.attentionItem.upsert({
      where: { source_sourceId: { source: "TASK", sourceId: task.id } },
      create: {
        userId: task.userId,
        source: "TASK",
        sourceId: task.id,
        type,
        status,
        priority: priorityForTask(task, isOverdue),
        title: task.title,
        resolvedAt: isResolved ? new Date() : null,
      },
      update: {
        status,
        priority: priorityForTask(task, isOverdue),
        title: task.title,
        resolvedAt: isResolved ? new Date() : null,
      },
    });
  } catch (err) {
    console.warn("[attention-mirror] upsert failed for Task", task.id, err);
  }
}

/**
 * Mark the AttentionItem mirroring this task as resolved. Used by callers
 * that know the task just transitioned away from an open state but don't
 * have the full task row handy.
 */
export async function resolveAttentionForTask(taskId: string): Promise<void> {
  try {
    await prisma.attentionItem.updateMany({
      where: { source: "TASK", sourceId: taskId, status: "OPEN" },
      data: { status: "RESOLVED", resolvedAt: new Date() },
    });
  } catch (err) {
    console.warn("[attention-mirror] resolveAttentionForTask failed", taskId, err);
  }
}

/**
 * Delete AttentionItem rows mirroring the given task ids. Used when the
 * source tasks themselves are removed.
 */
export async function deleteAttentionForTasks(taskIds: string[]): Promise<void> {
  if (taskIds.length === 0) return;
  try {
    await prisma.attentionItem.deleteMany({
      where: { source: "TASK", sourceId: { in: taskIds } },
    });
  } catch (err) {
    console.warn("[attention-mirror] deleteAttentionForTasks failed", err);
  }
}

/**
 * Bulk-delete every AttentionItem belonging to a user. Used by user data
 * deletion flows that wipe per-source tables but not the User row itself
 * (so the FK cascade does not fire).
 */
export async function deleteAllAttentionForUser(userId: string): Promise<void> {
  try {
    await prisma.attentionItem.deleteMany({ where: { userId } });
  } catch (err) {
    console.warn("[attention-mirror] deleteAllAttentionForUser failed", userId, err);
  }
}
