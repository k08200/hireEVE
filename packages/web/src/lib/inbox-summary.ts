/**
 * Type contract for the inbox Command Center summary returned by
 * `GET /api/inbox/summary`. The server owns the ranking — the frontend just
 * renders. Keep this file in sync with `packages/api/src/inbox-summary.ts`.
 */

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

export interface TaskItem {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
}

export interface EventItem {
  id: string;
  title: string;
  startTime: string;
  endTime?: string;
  location?: string | null;
}

export interface TodaySection {
  events: EventItem[];
  overdueTasks: TaskItem[];
  todayTasks: TaskItem[];
}

export interface InboxSummary {
  top3: AttentionItem[];
  today: TodaySection;
}
