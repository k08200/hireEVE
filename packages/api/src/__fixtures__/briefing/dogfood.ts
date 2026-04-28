export const DOGFOOD_BRIEFING_NOW = new Date("2026-04-28T09:00:00.000Z");

export const dogfoodBriefingFixture = {
  tasks: {
    tasks: [
      {
        id: "task-investor-deck",
        title: "Investor deck update",
        status: "TODO",
        priority: "HIGH",
        dueDate: "2026-04-28T12:00:00.000Z",
      },
      {
        id: "task-partnerco-deck",
        title: "PartnerCo deck update",
        status: "TODO",
        priority: "MEDIUM",
        dueDate: "2026-04-28T12:00:00.000Z",
      },
      {
        id: "task-launch-copy",
        title: "Launch copy polish",
        status: "TODO",
        priority: "LOW",
        dueDate: "2026-04-30T12:00:00.000Z",
      },
    ],
  },
  events: {
    events: [
      {
        id: "event-partnerco",
        summary: "PartnerCo kickoff",
        start: "2026-04-28T13:00:00.000Z",
        end: "2026-04-28T14:00:00.000Z",
      },
      {
        id: "event-investor",
        summary: "Investor check-in",
        start: "2026-04-29T01:00:00.000Z",
        end: "2026-04-29T02:00:00.000Z",
      },
    ],
  },
  emails: {
    emails: [
      {
        id: "email-contract",
        from: "sarah@example.com",
        subject: "Urgent: contract review due tomorrow",
        snippet: "Please send this by tomorrow.",
      },
      {
        id: "email-partnerco",
        from: "minsu@partnerco.com",
        subject: "PartnerCo kickoff agenda",
        snippet: "Let's cover metrics and deck update.",
      },
    ],
  },
} as const;

export const expectedDogfoodTopActionRefs = [
  "task:task-investor-deck",
  "task:task-partnerco-deck",
  "email:email-contract",
] as const;
