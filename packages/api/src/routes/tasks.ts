import type { FastifyInstance } from "fastify";
import { getUserId, requireAuth } from "../auth.js";
import { prisma } from "../db.js";
import { createTask, deleteTask, listTasks, updateTask } from "../tasks.js";

const createTaskBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["title"],
  properties: {
    title: { type: "string", minLength: 1, maxLength: 500 },
    description: { type: "string", maxLength: 5000 },
    priority: {
      type: "string",
      enum: ["low", "medium", "high", "urgent", "LOW", "MEDIUM", "HIGH", "URGENT"],
    },
    due_date: { type: "string", maxLength: 100 },
    dueDate: { type: "string", maxLength: 100 },
  },
} as const;

export async function taskRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  // GET /api/tasks?status=TODO
  app.get("/", async (request) => {
    const userId = getUserId(request);
    const { status } = request.query as { status?: string };
    return listTasks(userId, status);
  });

  // PATCH /api/tasks/:id
  app.patch("/:id", async (request, reply) => {
    const userId = getUserId(request);
    const { id } = request.params as { id: string };
    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) return reply.code(404).send({ error: "Task not found" });
    if (task.userId !== userId) return reply.code(403).send({ error: "Forbidden" });

    const body = request.body as Record<string, unknown>;
    return updateTask(id, body);
  });

  // DELETE /api/tasks/:id
  app.delete("/:id", async (request, reply) => {
    const userId = getUserId(request);
    const { id } = request.params as { id: string };
    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) return reply.code(404).send({ error: "Task not found" });
    if (task.userId !== userId) return reply.code(403).send({ error: "Forbidden" });

    await deleteTask(id);
    return reply.code(204).send();
  });

  // POST /api/tasks
  app.post("/", { schema: { body: createTaskBodySchema } }, async (request, reply) => {
    const userId = getUserId(request);
    const body = request.body as {
      title: string;
      description?: string;
      priority?: string;
      due_date?: string;
      dueDate?: string;
    };
    if (!body.title.trim()) {
      return reply.code(400).send({ error: "Title is required" });
    }
    const result = await createTask(
      userId,
      body.title,
      body.description,
      body.priority,
      body.due_date ?? body.dueDate,
    );
    if ("success" in result && result.success === false) {
      return reply.code(409).send(result);
    }
    return reply.code(201).send(result);
  });
}
