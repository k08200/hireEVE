import { prisma } from "./db.js";

export async function listTasks(userId: string, status?: string) {
  const where: Record<string, unknown> = { userId };
  if (status) where.status = status.toUpperCase();

  const tasks = await prisma.task.findMany({
    where,
    orderBy: [{ priority: "desc" }, { dueDate: "asc" }, { createdAt: "desc" }],
  });

  return {
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate?.toISOString() || null,
    })),
  };
}

export async function createTask(
  userId: string,
  title: string,
  description?: string,
  priority?: string,
  dueDate?: string,
) {
  const task = await prisma.task.create({
    data: {
      userId,
      title,
      description: description || null,
      priority: (priority?.toUpperCase() as "LOW" | "MEDIUM" | "HIGH" | "URGENT") || "MEDIUM",
      dueDate: dueDate ? new Date(dueDate) : null,
    },
  });

  return { success: true, task: { id: task.id, title: task.title, status: task.status } };
}

export async function updateTask(taskId: string, updates: Record<string, unknown>) {
  const data: Record<string, unknown> = {};
  if (updates.title) data.title = updates.title;
  if (updates.description !== undefined) data.description = updates.description;
  if (updates.status) data.status = (updates.status as string).toUpperCase();
  if (updates.priority) data.priority = (updates.priority as string).toUpperCase();
  if (updates.due_date !== undefined) {
    data.dueDate = updates.due_date ? new Date(updates.due_date as string) : null;
  }

  const task = await prisma.task.update({ where: { id: taskId }, data });

  return {
    success: true,
    task: { id: task.id, title: task.title, status: task.status, priority: task.priority },
  };
}

export async function deleteTask(taskId: string) {
  await prisma.task.delete({ where: { id: taskId } });
  return { success: true };
}

export const TASK_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "list_tasks",
      description: "List the user's tasks. Can filter by status (todo, in_progress, done).",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            description:
              "Filter by status: todo, in_progress, or done (optional, shows all if omitted)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_task",
      description: "Create a new task for the user",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Task title" },
          description: { type: "string", description: "Task description (optional)" },
          priority: {
            type: "string",
            description: "Priority: low, medium, high, or urgent (default: medium)",
          },
          due_date: {
            type: "string",
            description: "Due date in ISO 8601 format (optional)",
          },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_task",
      description: "Update an existing task (change status, priority, title, etc.)",
      parameters: {
        type: "object",
        properties: {
          task_id: { type: "string", description: "The task ID to update" },
          title: { type: "string", description: "New title (optional)" },
          description: { type: "string", description: "New description (optional)" },
          status: {
            type: "string",
            description: "New status: todo, in_progress, or done (optional)",
          },
          priority: {
            type: "string",
            description: "New priority: low, medium, high, or urgent (optional)",
          },
          due_date: { type: "string", description: "New due date in ISO 8601 (optional)" },
        },
        required: ["task_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "delete_task",
      description: "Delete a task by its ID",
      parameters: {
        type: "object",
        properties: {
          task_id: { type: "string", description: "The task ID to delete" },
        },
        required: ["task_id"],
      },
    },
  },
];
