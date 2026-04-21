/**
 * Resolve a human-readable label for a pending action's target.
 *
 * When a pending action is a delete/update operation, the raw tool args only
 * carry an ID (e.g. `task_id: "659a..."`) — useless to the user. This helper
 * looks the entity up and returns its title/name so UIs can render
 * "삭제: 월요일 회의 준비" instead of "삭제: ?".
 *
 * Returns null when the entity isn't found or the tool doesn't have a
 * resolvable target (creates, sends, etc.).
 */

import { prisma } from "./db.js";

export async function resolveActionTarget(
  toolName: string,
  args: Record<string, unknown>,
): Promise<string | null> {
  try {
    if (toolName === "delete_task" || toolName === "update_task") {
      const id = args.task_id;
      if (typeof id !== "string") return null;
      const row = await prisma.task.findUnique({
        where: { id },
        select: { title: true },
      });
      return row?.title ?? null;
    }
    if (toolName === "delete_note" || toolName === "update_note") {
      const id = args.note_id;
      if (typeof id !== "string") return null;
      const row = await prisma.note.findUnique({
        where: { id },
        select: { title: true },
      });
      return row?.title ?? null;
    }
    if (toolName === "delete_contact" || toolName === "update_contact") {
      const id = args.contact_id;
      if (typeof id !== "string") return null;
      const row = await prisma.contact.findUnique({
        where: { id },
        select: { name: true },
      });
      return row?.name ?? null;
    }
  } catch {
    // Entity lookup failed — fall through to null so UI shows a generic label
    return null;
  }
  return null;
}
