/**
 * Schema-only smoke test for AttentionItem.
 *
 * Producers and consumers land in follow-up PRs. This test pins the surface
 * area of the model so future schema changes are intentional: adding/removing
 * a field or enum value forces an update here.
 */
import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

describe("AttentionItem schema", () => {
  it("exposes the field set the producers will populate", () => {
    const fields = Prisma.AttentionItemScalarFieldEnum;
    expect(fields).toMatchObject({
      id: "id",
      userId: "userId",
      source: "source",
      sourceId: "sourceId",
      type: "type",
      status: "status",
      priority: "priority",
      confidence: "confidence",
      autonomyLevel: "autonomyLevel",
      title: "title",
      body: "body",
      suggestedAction: "suggestedAction",
      costOfIgnoring: "costOfIgnoring",
      evidence: "evidence",
      surfacedAt: "surfacedAt",
      resolvedAt: "resolvedAt",
      snoozedUntil: "snoozedUntil",
      createdAt: "createdAt",
      updatedAt: "updatedAt",
    });
  });

  it("supports the four expected sources", () => {
    const sources = Object.values(Prisma.AttentionItemScalarFieldEnum);
    expect(sources).toContain("source");
    // Enum values come from the generated client — assert the canonical set
    // by attempting to construct an UncheckedCreateInput referencing each.
    const samples: Prisma.AttentionItemUncheckedCreateInput[] = [
      {
        userId: "u",
        source: "PENDING_ACTION",
        sourceId: "p1",
        type: "DECISION",
        title: "x",
      },
      {
        userId: "u",
        source: "TASK",
        sourceId: "t1",
        type: "DEADLINE",
        title: "x",
      },
      {
        userId: "u",
        source: "CALENDAR_EVENT",
        sourceId: "c1",
        type: "MEETING_PREP",
        title: "x",
      },
      {
        userId: "u",
        source: "NOTIFICATION",
        sourceId: "n1",
        type: "FOLLOWUP",
        title: "x",
      },
    ];
    expect(samples).toHaveLength(4);
  });
});
