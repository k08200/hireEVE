/**
 * Calendar API — Manage events and schedule
 *
 * Provides local calendar events stored in DB + optional Google Calendar sync.
 */
import type { FastifyInstance } from "fastify";
import { getUserId } from "../auth.js";
import { prisma } from "../db.js";

export async function calendarRoutes(app: FastifyInstance) {
  // List events (next N days)
  app.get("/", async (request) => {
    const uid = getUserId(request);
    const { days } = request.query as { days?: string };
    const daysAhead = Number(days) || 14;

    const now = new Date();
    const until = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

    const events = await prisma.calendarEvent.findMany({
      where: {
        userId: uid,
        startTime: { gte: now, lte: until },
      },
      orderBy: { startTime: "asc" },
    });

    return { events };
  });

  // Get single event
  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const event = await prisma.calendarEvent.findUnique({ where: { id } });
    if (!event) return reply.code(404).send({ error: "Event not found" });
    return event;
  });

  // Create event
  app.post("/", async (request) => {
    const userId = getUserId(request);
    const { title, description, startTime, endTime, location, meetingLink, color, allDay } =
      request.body as {
        title: string;
        description?: string;
        startTime: string;
        endTime: string;
        location?: string;
        meetingLink?: string;
        color?: string;
        allDay?: boolean;
      };

    const event = await prisma.calendarEvent.create({
      data: {
        userId,
        title,
        description: description || null,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        location: location || null,
        meetingLink: meetingLink || null,
        color: color || null,
        allDay: allDay || false,
      },
    });

    return event;
  });

  // Update event
  app.patch("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const updates = request.body as Record<string, unknown>;

    // Convert date strings to Date objects
    if (typeof updates.startTime === "string")
      updates.startTime = new Date(updates.startTime as string);
    if (typeof updates.endTime === "string") updates.endTime = new Date(updates.endTime as string);

    try {
      const event = await prisma.calendarEvent.update({
        where: { id },
        data: updates,
      });
      return event;
    } catch {
      return reply.code(404).send({ error: "Event not found" });
    }
  });

  // Delete event
  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await prisma.calendarEvent.delete({ where: { id } });
      return reply.code(204).send();
    } catch {
      return reply.code(404).send({ error: "Event not found" });
    }
  });

  // Today's schedule summary
  app.get("/today/summary", async (request) => {
    const uid = getUserId(request);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const events = await prisma.calendarEvent.findMany({
      where: {
        userId: uid,
        startTime: { gte: todayStart, lte: todayEnd },
      },
      orderBy: { startTime: "asc" },
    });

    const now = new Date();
    const upcoming = events.filter((e: { startTime: Date }) => e.startTime > now);
    const current = events.find((e: { startTime: Date; endTime: Date }) => e.startTime <= now && e.endTime > now);

    return {
      total: events.length,
      current: current || null,
      upcoming,
      nextEvent: upcoming[0] || null,
    };
  });
}
