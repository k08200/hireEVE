import type { FastifyInstance } from "fastify";
import { getUserId, requireAuth } from "../auth.js";
import { prisma } from "../db.js";
import { buildTeamRiskSummary } from "../team-risk.js";

export async function workspaceRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  // GET /api/workspaces — List user's workspaces
  app.get("/", async (request) => {
    const userId = getUserId(request);
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId },
      include: {
        workspace: {
          include: { _count: { select: { members: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return {
      workspaces: memberships.map((m) => ({
        id: m.workspace.id,
        name: m.workspace.name,
        slug: m.workspace.slug,
        role: m.role,
        memberCount: m.workspace._count.members,
        plan: m.workspace.plan,
      })),
    };
  });

  // POST /api/workspaces — Create workspace
  app.post("/", async (request, reply) => {
    const userId = getUserId(request);
    const { name } = request.body as { name: string };

    if (!name || name.trim().length < 2) {
      return reply.code(400).send({ error: "Name must be at least 2 characters" });
    }

    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);

    // Ensure unique slug
    const existing = await prisma.workspace.findUnique({ where: { slug } });
    const finalSlug = existing ? `${slug}-${Date.now().toString(36)}` : slug;

    const workspace = await prisma.workspace.create({
      data: {
        name: name.trim(),
        slug: finalSlug,
        members: {
          create: { userId, role: "OWNER" },
        },
      },
    });

    return reply.code(201).send({
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      role: "OWNER",
    });
  });

  // GET /api/workspaces/:id/risks — Team risk summary from member Work Graphs
  app.get("/:id/risks", async (request, reply) => {
    const userId = getUserId(request);
    const { id } = request.params as { id: string };
    const { limit } = request.query as { limit?: string };

    const membership = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId: id } },
    });
    if (!membership) return reply.code(403).send({ error: "Not a member" });

    return buildTeamRiskSummary(id, { limit: parseOptionalInteger(limit) });
  });

  // GET /api/workspaces/:id/members — List members
  app.get("/:id/members", async (request, reply) => {
    const userId = getUserId(request);
    const { id } = request.params as { id: string };

    // Verify user is a member
    const membership = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId: id } },
    });
    if (!membership) return reply.code(403).send({ error: "Not a member" });

    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId: id },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    });

    return {
      members: members.map((m) => ({
        id: m.id,
        userId: m.user.id,
        name: m.user.name,
        email: m.user.email,
        role: m.role,
        joinedAt: m.createdAt.toISOString(),
      })),
    };
  });

  // POST /api/workspaces/:id/invite — Invite member by email
  app.post("/:id/invite", async (request, reply) => {
    const userId = getUserId(request);
    const { id } = request.params as { id: string };
    const { email, role } = request.body as { email: string; role?: string };

    // Verify user is admin/owner
    const membership = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId: id } },
    });
    if (!membership || membership.role === "MEMBER") {
      return reply.code(403).send({ error: "Only admins can invite" });
    }

    const invitee = await prisma.user.findUnique({ where: { email } });
    if (!invitee)
      return reply.code(404).send({ error: "User not found. They need to register first." });

    // Check if already a member
    const existing = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: invitee.id, workspaceId: id } },
    });
    if (existing) return reply.code(409).send({ error: "Already a member" });

    const member = await prisma.workspaceMember.create({
      data: {
        userId: invitee.id,
        workspaceId: id,
        role: role === "ADMIN" ? "ADMIN" : "MEMBER",
      },
    });

    return reply.code(201).send({ id: member.id, email, role: member.role });
  });

  // DELETE /api/workspaces/:id/members/:memberId — Remove member
  app.delete("/:id/members/:memberId", async (request, reply) => {
    const userId = getUserId(request);
    const { id, memberId } = request.params as { id: string; memberId: string };

    const membership = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId: id } },
    });
    if (!membership || membership.role === "MEMBER") {
      return reply.code(403).send({ error: "Only admins can remove members" });
    }

    const target = await prisma.workspaceMember.findUnique({ where: { id: memberId } });
    if (!target || target.workspaceId !== id) {
      return reply.code(404).send({ error: "Member not found" });
    }
    if (target.role === "OWNER") {
      return reply.code(403).send({ error: "Cannot remove workspace owner" });
    }

    await prisma.workspaceMember.delete({ where: { id: memberId } });
    return reply.code(204).send();
  });

  // DELETE /api/workspaces/:id — Delete workspace (owner only)
  app.delete("/:id", async (request, reply) => {
    const userId = getUserId(request);
    const { id } = request.params as { id: string };

    const membership = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId: id } },
    });
    if (!membership || membership.role !== "OWNER") {
      return reply.code(403).send({ error: "Only the owner can delete a workspace" });
    }

    await prisma.workspace.delete({ where: { id } });
    return reply.code(204).send();
  });
}

function parseOptionalInteger(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}
