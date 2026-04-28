import { describe, expect, it } from "vitest";
import {
  type AttentionItem,
  buildTodaySection,
  type EventInput,
  type NotificationInput,
  type PendingActionInput,
  pickTop3,
  type TaskInput,
} from "../inbox-summary.js";

const NOW = new Date("2026-04-28T10:00:00Z").getTime();
// startOfToday uses local time, so derive TODAY_START the same way the
// production code does — otherwise tests are timezone-fragile.
const TODAY_START = (() => {
  const d = new Date(NOW);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
})();

function pendingAction(overrides: Partial<PendingActionInput> = {}): PendingActionInput {
  return {
    id: "pa-1",
    conversationId: "c-1",
    status: "PENDING",
    toolName: "send_email",
    targetLabel: null,
    reasoning: null,
    createdAt: new Date(NOW - 60_000).toISOString(),
    ...overrides,
  };
}

function task(overrides: Partial<TaskInput> = {}): TaskInput {
  return {
    id: "t-1",
    title: "Sample task",
    status: "TODO",
    priority: "MEDIUM",
    dueDate: null,
    ...overrides,
  };
}

function event(overrides: Partial<EventInput> = {}): EventInput {
  return {
    id: "e-1",
    title: "Sample event",
    startTime: new Date(NOW + 30 * 60_000).toISOString(),
    location: null,
    ...overrides,
  };
}

function notification(overrides: Partial<NotificationInput> = {}): NotificationInput {
  return {
    id: "n-1",
    type: "agent_proposal",
    title: "[EVE] Suggestion",
    message: "Try this",
    isRead: false,
    link: null,
    pendingActionId: null,
    createdAt: new Date(NOW - 5 * 60_000).toISOString(),
    ...overrides,
  };
}

describe("pickTop3", () => {
  it("places pending actions before any other signal", () => {
    const result = pickTop3({
      pendingActions: [pendingAction()],
      tasks: [
        task({
          id: "overdue-1",
          dueDate: new Date(TODAY_START - 2 * 24 * 60 * 60 * 1000).toISOString(),
        }),
      ],
      events: [event()],
      notifications: [notification()],
      now: NOW,
    });

    expect(result).toHaveLength(3);
    expect(result[0].kind).toBe("pending_action");
  });

  it("ignores non-PENDING actions", () => {
    const result = pickTop3({
      pendingActions: [pendingAction({ status: "EXECUTED" })],
      tasks: [],
      events: [],
      notifications: [],
      now: NOW,
    });
    expect(result).toEqual([]);
  });

  it("orders overdue tasks by oldest due date first", () => {
    const result = pickTop3({
      pendingActions: [],
      tasks: [
        task({
          id: "newer",
          dueDate: new Date(TODAY_START - 1 * 24 * 60 * 60 * 1000).toISOString(),
        }),
        task({
          id: "older",
          dueDate: new Date(TODAY_START - 5 * 24 * 60 * 60 * 1000).toISOString(),
        }),
      ],
      events: [],
      notifications: [],
      now: NOW,
    });

    expect(result.map((r) => (r as AttentionItem & { id: string }).id)).toEqual(["older", "newer"]);
  });

  it("excludes events that already happened", () => {
    const result = pickTop3({
      pendingActions: [],
      tasks: [],
      events: [
        event({ id: "past", startTime: new Date(NOW - 60 * 60_000).toISOString() }),
        event({ id: "soon", startTime: new Date(NOW + 30 * 60_000).toISOString() }),
      ],
      notifications: [],
      now: NOW,
    });

    expect(result).toHaveLength(1);
    expect((result[0] as { id: string }).id).toBe("soon");
  });

  it("excludes events further than 6 hours away", () => {
    const result = pickTop3({
      pendingActions: [],
      tasks: [],
      events: [event({ id: "later", startTime: new Date(NOW + 7 * 60 * 60_000).toISOString() })],
      notifications: [],
      now: NOW,
    });
    expect(result).toEqual([]);
  });

  it("excludes proposals already linked to a pending action", () => {
    const result = pickTop3({
      pendingActions: [],
      tasks: [],
      events: [],
      notifications: [notification({ pendingActionId: "pa-99" })],
      now: NOW,
    });
    expect(result).toEqual([]);
  });

  it("caps at three items even when many candidates qualify", () => {
    const result = pickTop3({
      pendingActions: [
        pendingAction({ id: "pa-1" }),
        pendingAction({ id: "pa-2" }),
        pendingAction({ id: "pa-3" }),
        pendingAction({ id: "pa-4" }),
      ],
      tasks: [],
      events: [],
      notifications: [],
      now: NOW,
    });
    expect(result).toHaveLength(3);
  });

  it("computes daysOverdue from start-of-today, not raw hours", () => {
    const result = pickTop3({
      pendingActions: [],
      tasks: [
        task({
          id: "yesterday",
          dueDate: new Date(TODAY_START - 60 * 60 * 1000).toISOString(),
        }),
      ],
      events: [],
      notifications: [],
      now: NOW,
    });

    expect(result[0]).toMatchObject({ kind: "overdue_task", daysOverdue: 1 });
  });
});

describe("buildTodaySection", () => {
  it("separates overdue from today-due tasks", () => {
    const overdueDue = new Date(TODAY_START - 24 * 60 * 60 * 1000).toISOString();
    const todayDue = new Date(NOW + 60 * 60_000).toISOString();
    const section = buildTodaySection({
      tasks: [
        task({ id: "overdue", dueDate: overdueDue }),
        task({ id: "today", dueDate: todayDue }),
        task({ id: "no-due" }),
        task({ id: "done", status: "DONE", dueDate: todayDue }),
      ],
      events: [
        event({ id: "today-event", startTime: new Date(NOW + 60 * 60_000).toISOString() }),
        event({
          id: "tomorrow-event",
          startTime: new Date(NOW + 30 * 60 * 60 * 1000).toISOString(),
        }),
      ],
      now: NOW,
    });

    expect(section.overdueTasks.map((t) => t.id)).toEqual(["overdue"]);
    expect(section.todayTasks.map((t) => t.id)).toEqual(["today"]);
    expect(section.events.map((e) => e.id)).toEqual(["today-event"]);
  });
});
