/**
 * Deterministic ranking for the inbox Command Center summary.
 *
 * Intentionally rule-based — no LLM judgment in v0. The order is:
 *   1. PendingAction (PENDING) — user-blocking decisions
 *   2. Overdue tasks — already past due
 *   3. Today's events that are starting soon
 *   4. Unread agent_proposal notifications — secondary signal
 *
 * `pickTop3` always pulls pending actions first when present, so "approval
 * needed" never gets buried below noisy notifications.
 */

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

const TOP_LIMIT = 3;
const SOON_WINDOW_MS = 6 * 60 * 60 * 1000; // 6 hours — "starting soon"

function startOfToday(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function endOfToday(now: number): number {
  return startOfToday(now) + 24 * 60 * 60 * 1000;
}

function isPending(a: PendingActionInput): boolean {
  return a.status === "PENDING";
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
  const due = dueDateMs(t)!;
  const daysOverdue = Math.max(1, Math.floor((startOfToday(now) - due) / (24 * 60 * 60 * 1000)));
  return {
    kind: "overdue_task",
    id: t.id,
    title: t.title,
    dueDate: t.dueDate!,
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

  const pending = input.pendingActions.filter(isPending).map(toPendingItem);

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

  const ordered: AttentionItem[] = [...pending, ...overdueSorted, ...eventsSoon, ...proposals];
  return ordered.slice(0, TOP_LIMIT);
}

/**
 * Bundle the "오늘 봐야 할 것" section. Returned arrays are pre-sorted and
 * deduplicated against each other (today-due tasks excluded from overdue, etc).
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
