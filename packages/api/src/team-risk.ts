/**
 * Team risk summary v0.
 *
 * Step 9 starts team mode without adding a durable team graph yet. We reuse
 * each member's Work Graph and aggregate high/medium contexts into a
 * workspace-level view so EVE can spot cross-member risk.
 */

import { prisma } from "./db.js";
import { buildWorkGraphSummary, type WorkGraphContext } from "./work-graph.js";

export interface TeamRiskMember {
  userId: string;
  name: string | null;
  email: string;
  role: string;
}

export interface TeamRiskItem {
  id: string;
  member: TeamRiskMember;
  context: WorkGraphContext;
  sharedWith: number;
  reasons: string[];
}

export interface TeamRiskSummary {
  generatedAt: string;
  workspaceId: string;
  memberCount: number;
  highRiskCount: number;
  mediumRiskCount: number;
  sharedContextCount: number;
  risks: TeamRiskItem[];
}

export interface TeamRiskOptions {
  limit?: number;
  perMemberLimit?: number;
  now?: number;
}

interface WorkspaceMemberRow {
  userId: string;
  role: string;
  user: { id: string; name: string | null; email: string };
}

export async function buildTeamRiskSummary(
  workspaceId: string,
  opts: TeamRiskOptions = {},
): Promise<TeamRiskSummary> {
  const members = (await prisma.workspaceMember.findMany({
    where: { workspaceId },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  })) as WorkspaceMemberRow[];

  const memberGraphs = await Promise.all(
    members.map(async (member) => ({
      member: {
        userId: member.user.id,
        name: member.user.name,
        email: member.user.email,
        role: member.role,
      },
      graph: await buildWorkGraphSummary(member.userId, {
        limit: opts.perMemberLimit ?? 6,
        now: opts.now,
      }),
    })),
  );

  return assembleTeamRiskSummary(workspaceId, memberGraphs, opts);
}

export function assembleTeamRiskSummary(
  workspaceId: string,
  memberGraphs: Array<{
    member: TeamRiskMember;
    graph: { generatedAt: string; contexts: WorkGraphContext[] };
  }>,
  opts: Pick<TeamRiskOptions, "limit" | "now"> = {},
): TeamRiskSummary {
  const limit = normalizeLimit(opts.limit);
  const generatedAt = new Date(opts.now ?? Date.now()).toISOString();
  const rawRisks = memberGraphs.flatMap(({ member, graph }) =>
    graph.contexts
      .filter((context) => context.risk === "high" || context.risk === "medium")
      .map((context) => ({ member, context })),
  );

  const sharedCounts = new Map<string, Set<string>>();
  for (const risk of rawRisks) {
    const key = riskKey(risk.context);
    const users = sharedCounts.get(key) ?? new Set<string>();
    users.add(risk.member.userId);
    sharedCounts.set(key, users);
  }

  const risks = rawRisks
    .map(({ member, context }) => {
      const sharedWith = Math.max(0, (sharedCounts.get(riskKey(context))?.size ?? 1) - 1);
      const reasons =
        sharedWith > 0
          ? [`Shared across ${sharedWith + 1} team members`, ...context.reasons]
          : context.reasons;
      return {
        id: `${member.userId}:${context.id}`,
        member,
        context,
        sharedWith,
        reasons: reasons.slice(0, 5),
      };
    })
    .sort(compareTeamRisks)
    .slice(0, limit);

  return {
    generatedAt,
    workspaceId,
    memberCount: memberGraphs.length,
    highRiskCount: rawRisks.filter((risk) => risk.context.risk === "high").length,
    mediumRiskCount: rawRisks.filter((risk) => risk.context.risk === "medium").length,
    sharedContextCount: risks.filter((risk) => risk.sharedWith > 0).length,
    risks,
  };
}

function compareTeamRisks(a: TeamRiskItem, b: TeamRiskItem): number {
  const riskDelta = riskWeight(b.context.risk) - riskWeight(a.context.risk);
  if (riskDelta !== 0) return riskDelta;
  const sharedDelta = b.sharedWith - a.sharedWith;
  if (sharedDelta !== 0) return sharedDelta;
  return (
    new Date(b.context.lastActivityAt).getTime() - new Date(a.context.lastActivityAt).getTime()
  );
}

function riskWeight(risk: WorkGraphContext["risk"]): number {
  if (risk === "high") return 3;
  if (risk === "medium") return 2;
  return 1;
}

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit) || !limit || limit < 1) return 20;
  return Math.min(Math.floor(limit), 50);
}

function riskKey(context: WorkGraphContext): string {
  return `${context.kind}:${context.title.trim().toLowerCase().replace(/\s+/g, " ")}`;
}
