/**
 * Server-side ranking for the inbox Command Center summary.
 *
 * Deterministic, rule-based — no LLM judgment. Pure functions over plain inputs
 * so the route is easy to unit-test without touching the database.
 *
 * Order:
 *   1. PendingAction (PENDING) — user-blocking decisions, never buried
 *   2. Overdue tasks
 *   3. Today's events that are starting soon
 *   4. Unread agent_proposal notifications without an attached PendingAction
 */

import { resolveActionTarget } from "./action-target.js";
import { upsertAttentionForPendingAction } from "./attention-mirror.js";
import { prisma } from "./db.js";

export interface PendingActionInput {
  id: string;
  conversationId: string;
  status: string;
  toolName: string;
  targetLabel: string | null;
  reasoning: string | null;
  createdAt: string;
}

export interface TaskInput {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
}

export interface EventInput {
  id: string;
  title: string;
  startTime: string;
  endTime?: string;
  location?: string | null;
}

export interface NotificationInput {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  link?: string | null;
  conversationId?: string | null;
  pendingActionId?: string | null;
  createdAt: string;
}

export type AttentionItem =
  | {
      kind: "pending_action";
      id: string;
      toolName: string;
      label: string;
      conversationId: string;
      reasoning: string | null;
    }
  | {
      kind: "overdue_task";
      id: string;
      title: string;
      dueDate: string;
      daysOverdue: number;
    }
  | {
      kind: "today_event";
      id: string;
      title: string;
      startTime: string;
      minutesAway: number;
      location: string | null;
    }
  | {
      kind: "agent_proposal";
      id: string;
      title: string;
      message: string;
      link: string | null;
    };

export interface TodaySection {
  events: EventInput[];
  overdueTasks: TaskInput[];
  todayTasks: TaskInput[];
}

export interface InboxSummary {
  top3: AttentionItem[];
  today: TodaySection;
}

const TOP_LIMIT = 3;
const SOON_WINDOW_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function startOfToday(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function endOfToday(now: number): number {
  return startOfToday(now) + DAY_MS;
}

function dueDateMs(t: TaskInput): number | null {
  if (!t.dueDate) return null;
  const ms = new Date(t.dueDate).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function isOverdue(t: TaskInput, now: number): boolean {
  const due = dueDateMs(t);
  if (due === null) return false;
  return due < startOfToday(now);
}

function isDueToday(t: TaskInput, now: number): boolean {
  const due = dueDateMs(t);
  if (due === null) return false;
  return due >= startOfToday(now) && due < endOfToday(now);
}

function isTodayEvent(e: EventInput, now: number): boolean {
  const start = new Date(e.startTime).getTime();
  if (!Number.isFinite(start)) return false;
  return start >= startOfToday(now) && start < endOfToday(now);
}

function pendingLabel(a: PendingActionInput): string {
  if (a.targetLabel) return `${a.toolName.replace(/_/g, " ")}: ${a.targetLabel}`;
  return a.toolName.replace(/_/g, " ");
}

function toPendingItem(a: PendingActionInput): AttentionItem {
  return {
    kind: "pending_action",
    id: a.id,
    toolName: a.toolName,
    label: pendingLabel(a),
    conversationId: a.conversationId,
    reasoning: a.reasoning,
  };
}

function toOverdueItem(t: TaskInput, now: number): AttentionItem {
  const due = dueDateMs(t);
  if (due === null || !t.dueDate) {
    throw new Error("toOverdueItem requires a task with a valid dueDate");
  }
  const daysOverdue = Math.max(1, Math.floor((startOfToday(now) - due) / DAY_MS));
  return {
    kind: "overdue_task",
    id: t.id,
    title: t.title,
    dueDate: t.dueDate,
    daysOverdue,
  };
}

function toEventItem(e: EventInput, now: number): AttentionItem {
  const start = new Date(e.startTime).getTime();
  return {
    kind: "today_event",
    id: e.id,
    title: e.title,
    startTime: e.startTime,
    minutesAway: Math.round((start - now) / 60_000),
    location: e.location ?? null,
  };
}

function toProposalItem(n: NotificationInput): AttentionItem {
  return {
    kind: "agent_proposal",
    id: n.id,
    title: n.title,
    message: n.message,
    link: n.link ?? null,
  };
}

/**
 * Pick the top items the user should look at right now. Pending actions get
 * absolute priority — never buried below notifications.
 */
export function pickTop3(input: {
  pendingActions: PendingActionInput[];
  tasks: TaskInput[];
  events: EventInput[];
  notifications: NotificationInput[];
  now?: number;
}): AttentionItem[] {
  const now = input.now ?? Date.now();

  const pending = input.pendingActions.filter((a) => a.status === "PENDING").map(toPendingItem);

  const overdueSorted = input.tasks
    .filter((t) => t.status !== "DONE" && isOverdue(t, now))
    .sort((a, b) => (dueDateMs(a) ?? 0) - (dueDateMs(b) ?? 0))
    .map((t) => toOverdueItem(t, now));

  const eventsSoon = input.events
    .filter((e) => {
      const start = new Date(e.startTime).getTime();
      return Number.isFinite(start) && start >= now && start - now <= SOON_WINDOW_MS;
    })
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    .map((e) => toEventItem(e, now));

  const proposals = input.notifications
    .filter((n) => n.type === "agent_proposal" && !n.isRead && !n.pendingActionId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map(toProposalItem);

  return [...pending, ...overdueSorted, ...eventsSoon, ...proposals].slice(0, TOP_LIMIT);
}

/**
 * Bundle the "오늘 봐야 할 것" section. Events for today, overdue tasks, and
 * today-due tasks — each pre-sorted, with no overlap between overdue and today.
 */
export function buildTodaySection(input: {
  tasks: TaskInput[];
  events: EventInput[];
  now?: number;
}): TodaySection {
  const now = input.now ?? Date.now();
  const events = input.events
    .filter((e) => isTodayEvent(e, now))
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  const overdueTasks = input.tasks
    .filter((t) => t.status !== "DONE" && isOverdue(t, now))
    .sort((a, b) => (dueDateMs(a) ?? 0) - (dueDateMs(b) ?? 0));
  const todayTasks = input.tasks
    .filter((t) => t.status !== "DONE" && isDueToday(t, now))
    .sort((a, b) => (dueDateMs(a) ?? 0) - (dueDateMs(b) ?? 0));
  return { events, overdueTasks, todayTasks };
}

/**
 * Build the inbox summary by reading the four signal sources directly from the
 * database. Centralising this on the server keeps the `/inbox` page to a single
 * fetch and gives EVE a single place to evolve the ranking logic.
 */
export async function buildInboxSummary(userId: string, now = Date.now()): Promise<InboxSummary> {
  const todayStart = new Date(startOfToday(now));
  const tomorrowStart = new Date(endOfToday(now));

  type PendingActionRow = {
    id: string;
    userId: string;
    conversationId: string;
    status: string;
    toolName: string;
    toolArgs: string;
    reasoning: string | null;
    createdAt: Date;
  };

  const [pendingRows, taskRows, eventRows, notifRows] = await Promise.all([
    (prisma.pendingAction.findMany as (args: unknown) => Promise<PendingActionRow[]>)({
      where: { userId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.task.findMany({
      where: { userId, status: { not: "DONE" } },
      orderBy: { dueDate: "asc" },
      take: 100,
    }),
    prisma.calendarEvent.findMany({
      where: { userId, startTime: { gte: todayStart, lt: tomorrowStart } },
      orderBy: { startTime: "asc" },
    }),
    prisma.notification.findMany({
      where: { userId, type: "agent_proposal", isRead: false, pendingActionId: null },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);

  // Backfill AttentionItems for any PendingActions still missing from the queue
  // (rows created before #153 landed). Idempotent — upsert keyed on (source,
  // sourceId) so no duplicates and no extra writes once the queue is in sync.
  const existingAttention = (await prisma.attentionItem.findMany({
    where: { userId, source: "PENDING_ACTION", status: "OPEN" },
    select: { sourceId: true },
  })) as Array<{ sourceId: string }>;
  const mirroredIds = new Set(existingAttention.map((a) => a.sourceId));
  const orphans = pendingRows.filter((p) => !mirroredIds.has(p.id));
  if (orphans.length > 0) {
    await Promise.all(orphans.map((p) => upsertAttentionForPendingAction(p)));
  }

  // Read the queue from AttentionItem now — sourceId joins back to PendingAction
  // for the conversation/tool metadata the UI still needs.
  type AttentionItemRow = {
    id: string;
    sourceId: string;
    surfacedAt: Date;
  };
  const queue = (await prisma.attentionItem.findMany({
    where: { userId, source: "PENDING_ACTION", status: "OPEN" },
    orderBy: [{ priority: "desc" }, { surfacedAt: "desc" }],
    take: 50,
    select: { id: true, sourceId: true, surfacedAt: true },
  })) as AttentionItemRow[];

  const queueSourceIds = queue.map((q) => q.sourceId);
  const paBySourceId = new Map<string, PendingActionRow>(
    queueSourceIds.length === 0
      ? []
      : (
          (await (prisma.pendingAction.findMany as (args: unknown) => Promise<PendingActionRow[]>)({
            where: { id: { in: queueSourceIds }, status: "PENDING" },
          })) as PendingActionRow[]
        ).map((p) => [p.id, p]),
  );

  const pendingActions: PendingActionInput[] = (
    await Promise.all(
      queue.map(async (q) => {
        const a = paBySourceId.get(q.sourceId);
        if (!a) return null;
        let targetLabel: string | null = null;
        try {
          const parsed = JSON.parse(a.toolArgs) as Record<string, unknown>;
          targetLabel = await resolveActionTarget(a.toolName, parsed);
        } catch {
          // Malformed toolArgs — leave label null
        }
        return {
          id: a.id,
          conversationId: a.conversationId,
          status: a.status,
          toolName: a.toolName,
          targetLabel,
          reasoning: a.reasoning,
          createdAt: a.createdAt.toISOString(),
        };
      }),
    )
  ).filter((x): x is PendingActionInput => x !== null);

  const tasks: TaskInput[] = taskRows.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
  }));

  const events: EventInput[] = eventRows.map((e) => ({
    id: e.id,
    title: e.title,
    startTime: e.startTime.toISOString(),
    endTime: e.endTime ? e.endTime.toISOString() : undefined,
    location: e.location,
  }));

  const notifications: NotificationInput[] = notifRows.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    isRead: n.isRead,
    link: n.link,
    conversationId: n.conversationId,
    pendingActionId: n.pendingActionId,
    createdAt: n.createdAt.toISOString(),
  }));

  const top3 = pickTop3({ pendingActions, tasks, events, notifications, now });
  const today = buildTodaySection({ tasks, events, now });

  return { top3, today };
}
