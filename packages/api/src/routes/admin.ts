import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../auth.js";
import { prisma } from "../db.js";

export async function adminRoutes(app: FastifyInstance) {
  // All admin routes require ADMIN role
  app.addHook("preHandler", requireAdmin);

  // GET /api/admin/users — List all users
  app.get("/users", async () => {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        plan: true,
        stripeId: true,
        createdAt: true,
        _count: {
          select: {
            conversations: true,
            tasks: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Add monthly message count for each user
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const usersWithUsage = await Promise.all(
      users.map(async (user: (typeof users)[number]) => {
        const messageCount = await prisma.message.count({
          where: {
            conversation: { userId: user.id },
            role: "USER",
            createdAt: { gte: periodStart },
          },
        });
        return { ...user, messageCount };
      }),
    );

    return { users: usersWithUsage };
  });

  // PATCH /api/admin/users/:id — Update user plan or role
  app.patch("/users/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { plan, role } = request.body as { plan?: string; role?: string };

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return reply.code(404).send({ error: "User not found" });

    const data: Record<string, string> = {};
    if (plan && ["FREE", "PRO", "TEAM", "ENTERPRISE"].includes(plan)) {
      data.plan = plan;
    }
    if (role && ["USER", "ADMIN"].includes(role)) {
      data.role = role;
    }

    if (Object.keys(data).length === 0) {
      return reply.code(400).send({ error: "No valid fields to update" });
    }

    const updated = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, email: true, name: true, role: true, plan: true },
    });

    return updated;
  });

  // DELETE /api/admin/users/:id — Delete user and all their data
  app.delete("/users/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return reply.code(404).send({ error: "User not found" });
    if (user.role === "ADMIN") {
      return reply.code(400).send({ error: "Cannot delete admin user" });
    }

    await prisma.$transaction([
      prisma.notification.deleteMany({ where: { userId: id } }),
      prisma.automationConfig.deleteMany({ where: { userId: id } }),
      prisma.calendarEvent.deleteMany({ where: { userId: id } }),
      prisma.contact.deleteMany({ where: { userId: id } }),
      prisma.reminder.deleteMany({ where: { userId: id } }),
      prisma.note.deleteMany({ where: { userId: id } }),
      prisma.task.deleteMany({ where: { userId: id } }),
      prisma.message.deleteMany({ where: { conversation: { userId: id } } }),
      prisma.conversation.deleteMany({ where: { userId: id } }),
      prisma.userToken.deleteMany({ where: { userId: id } }),
      prisma.evaluation.deleteMany({ where: { testRun: { userId: id } } }),
      prisma.testRun.deleteMany({ where: { userId: id } }),
      prisma.agent.deleteMany({ where: { userId: id } }),
      prisma.workspaceMember.deleteMany({ where: { userId: id } }),
      prisma.user.delete({ where: { id } }),
    ]);

    return reply.code(204).send();
  });

  // GET /api/admin/stats — Dashboard stats
  app.get("/stats", async () => {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalUsers, totalConversations, totalMessages, planDistribution] = await Promise.all([
      prisma.user.count(),
      prisma.conversation.count(),
      prisma.message.count({ where: { createdAt: { gte: periodStart } } }),
      prisma.user.groupBy({ by: ["plan"], _count: { id: true } }),
    ]);

    return {
      totalUsers,
      totalConversations,
      monthlyMessages: totalMessages,
      planDistribution: Object.fromEntries(
        planDistribution.map((p: { plan: string; _count: { id: number } }) => [
          p.plan,
          p._count.id,
        ]),
      ),
    };
  });
}
