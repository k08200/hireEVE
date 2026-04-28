import { describe, expect, it } from "vitest";
import { assembleTeamRiskSummary, type TeamRiskMember } from "../team-risk.js";
import type { WorkGraphContext } from "../work-graph.js";

const alice: TeamRiskMember = {
  userId: "u-1",
  name: "Alice",
  email: "alice@example.com",
  role: "OWNER",
};
const bob: TeamRiskMember = {
  userId: "u-2",
  name: "Bob",
  email: "bob@example.com",
  role: "MEMBER",
};

function context(over: Partial<WorkGraphContext> = {}): WorkGraphContext {
  return {
    id: over.id ?? "ctx-1",
    kind: over.kind ?? "email_thread",
    title: over.title ?? "PartnerCo renewal",
    subtitle: over.subtitle ?? null,
    href: over.href ?? "/email/e-1",
    people: over.people ?? [],
    lastActivityAt: over.lastActivityAt ?? "2026-04-28T00:00:00.000Z",
    risk: over.risk ?? "high",
    reasons: over.reasons ?? ["긴급 메일"],
    signals: over.signals ?? {
      emails: 1,
      unreadEmails: 1,
      urgentEmails: 1,
      pendingActions: 0,
      commitments: 0,
      overdueCommitments: 0,
    },
  };
}

describe("assembleTeamRiskSummary", () => {
  it("aggregates high and medium work graph contexts across team members", () => {
    const summary = assembleTeamRiskSummary(
      "ws-1",
      [
        { member: alice, graph: { generatedAt: "now", contexts: [context()] } },
        {
          member: bob,
          graph: {
            generatedAt: "now",
            contexts: [context({ id: "ctx-2", risk: "medium", title: "Hiring loop" })],
          },
        },
      ],
      { now: Date.parse("2026-04-28T00:00:00.000Z") },
    );

    expect(summary).toMatchObject({
      workspaceId: "ws-1",
      memberCount: 2,
      highRiskCount: 1,
      mediumRiskCount: 1,
    });
    expect(summary.risks.map((risk) => risk.context.risk)).toEqual(["high", "medium"]);
  });

  it("marks shared contexts when multiple members have the same risky thread", () => {
    const summary = assembleTeamRiskSummary("ws-1", [
      { member: alice, graph: { generatedAt: "now", contexts: [context()] } },
      {
        member: bob,
        graph: {
          generatedAt: "now",
          contexts: [context({ id: "ctx-b", title: "partnerco renewal" })],
        },
      },
    ]);

    expect(summary.sharedContextCount).toBe(2);
    expect(summary.risks.every((risk) => risk.sharedWith === 1)).toBe(true);
    expect(summary.risks[0].reasons[0]).toBe("Shared across 2 team members");
  });

  it("drops low-risk contexts and respects the result limit", () => {
    const summary = assembleTeamRiskSummary(
      "ws-1",
      [
        {
          member: alice,
          graph: {
            generatedAt: "now",
            contexts: [
              context({ id: "low", risk: "low" }),
              context({ id: "high", risk: "high", title: "High" }),
              context({ id: "medium", risk: "medium", title: "Medium" }),
            ],
          },
        },
      ],
      { limit: 1 },
    );

    expect(summary.risks).toHaveLength(1);
    expect(summary.risks[0].context.title).toBe("High");
  });
});
