import type { FastifyInstance } from "fastify";
import { getUserId } from "../auth.js";
import { createTask, deleteTask, listTasks, updateTask } from "../tasks.js";

export async function taskRoutes(app: FastifyInstance) {
  // GET /api/tasks?status=TODO
  app.get("/", async (request) => {
    const userId = getUserId(request);
    const { status } = request.query as { status?: string };
    return listTasks(userId, status);
  });

  // PATCH /api/tasks/:id
  app.patch("/:id", async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;
    return updateTask(id, body);
  });

  // DELETE /api/tasks/:id
  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    await deleteTask(id);
    return reply.code(204).send();
  });

  // POST /api/tasks
  app.post("/", async (request, reply) => {
    const userId = getUserId(request);
    const { title, description, priority, due_date } = request.body as {
      title: string;
      description?: string;
      priority?: string;
      due_date?: string;
    };
    const result = await createTask(userId, title, description, priority, due_date);
    return reply.code(201).send(result);
  });
}
