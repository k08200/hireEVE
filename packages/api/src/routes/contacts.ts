import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";

export async function contactRoutes(app: FastifyInstance) {
  app.get("/", async (request) => {
    const { userId, search } = request.query as { userId?: string; search?: string };
    const where: Record<string, unknown> = {};
    if (userId) where.userId = userId;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { company: { contains: search, mode: "insensitive" } },
      ];
    }
    const contacts = await prisma.contact.findMany({ where, orderBy: { name: "asc" } });
    return { contacts };
  });

  app.post("/", async (request, reply) => {
    const body = request.body as Record<string, string>;
    const contact = await prisma.contact.create({
      data: {
        userId: body.userId,
        name: body.name,
        email: body.email || null,
        phone: body.phone || null,
        company: body.company || null,
        role: body.role || null,
        notes: body.notes || null,
        tags: body.tags || null,
      },
    });
    return reply.code(201).send(contact);
  });

  app.patch("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const updates = request.body as Record<string, string>;
    const contact = await prisma.contact.update({ where: { id }, data: updates });
    return reply.send(contact);
  });

  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    await prisma.contact.delete({ where: { id } });
    return reply.code(204).send();
  });
}
