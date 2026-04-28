import { describe, expect, it } from "vitest";
import { buildBriefingSignals } from "../briefing-signals.js";

const NOW = new Date("2026-04-28T09:00:00.000Z");

describe("buildBriefingSignals", () => {
  it("extracts deterministic deadline and urgency signals", () => {
    const signals = buildBriefingSignals(
      {
        tasks: {
          tasks: [
            {
              id: "task-1",
              title: "Investor deck update",
              status: "TODO",
              priority: "HIGH",
              dueDate: "2026-04-28T12:00:00.000Z",
            },
          ],
        },
        events: { events: [] },
        emails: {
          emails: [
            {
              id: "email-1",
              from: "sarah@example.com",
              subject: "Urgent: contract review due tomorrow",
              snippet: "Please send this by tomorrow.",
            },
          ],
        },
      },
      { now: NOW },
    );

    expect(signals.deadlines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "task",
          id: "task-1",
          dueAt: "2026-04-28T12:00:00.000Z",
        }),
        expect.objectContaining({
          source: "email",
          id: "email-1",
          dueText: "tomorrow",
          reason: "deadline language in email",
        }),
      ]),
    );
    expect(signals.urgentItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "task", id: "task-1", reason: "HIGH priority" }),
        expect.objectContaining({ source: "email", id: "email-1" }),
      ]),
    );
  });

  it("links emails, tasks, and events through shared work context", () => {
    const signals = buildBriefingSignals(
      {
        tasks: {
          tasks: [
            {
              id: "task-1",
              title: "PartnerCo deck update",
              status: "TODO",
              priority: "MEDIUM",
              dueDate: "2026-04-28T12:00:00.000Z",
            },
          ],
        },
        events: {
          events: [
            {
              id: "event-1",
              summary: "PartnerCo kickoff",
              start: "2026-04-28T13:00:00.000Z",
              end: "2026-04-28T14:00:00.000Z",
            },
          ],
        },
        emails: {
          emails: [
            {
              id: "email-1",
              from: "minsu@partnerco.com",
              subject: "PartnerCo kickoff agenda",
              snippet: "Let's cover metrics and deck updates.",
            },
          ],
        },
      },
      { now: NOW },
    );

    expect(signals.crossLinks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "email_task",
          email: expect.objectContaining({ id: "email-1" }),
          task: expect.objectContaining({ id: "task-1" }),
        }),
        expect.objectContaining({
          kind: "email_event",
          email: expect.objectContaining({ id: "email-1" }),
          event: expect.objectContaining({ id: "event-1" }),
        }),
        expect.objectContaining({
          kind: "task_event",
          reason: expect.stringContaining("task due before event"),
          task: expect.objectContaining({ id: "task-1" }),
          event: expect.objectContaining({ id: "event-1" }),
        }),
      ]),
    );
  });

  it("skips completed tasks when building action links", () => {
    const signals = buildBriefingSignals(
      {
        tasks: {
          tasks: [
            {
              id: "done-task",
              title: "PartnerCo deck update",
              status: "DONE",
              priority: "URGENT",
              dueDate: "2026-04-28T12:00:00.000Z",
            },
          ],
        },
        events: { events: [{ id: "event-1", summary: "PartnerCo kickoff" }] },
        emails: { emails: [{ id: "email-1", subject: "PartnerCo agenda", snippet: "" }] },
      },
      { now: NOW },
    );

    expect(signals.urgentItems).toHaveLength(0);
    expect(signals.crossLinks.some((link) => link.kind === "email_task")).toBe(false);
    expect(signals.crossLinks.some((link) => link.kind === "task_event")).toBe(false);
  });
});
