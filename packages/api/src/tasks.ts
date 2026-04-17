import { prisma } from "./db.js";

const OPEN_STATUSES = ["TODO", "IN_PROGRESS"] as const;
const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_OPEN_TASKS_IN_WINDOW = 15;
const DUPLICATE_JACCARD_THRESHOLD = 0.5;

// Noise words that should not count toward title similarity. Without this,
// two unrelated long English titles can trip the threshold on filler words alone.
const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "into",
  "onto",
  "this",
  "that",
  "these",
  "those",
  "will",
  "would",
  "could",
  "should",
  "about",
  "your",
  "you",
  "our",
  "are",
  "is",
  "was",
  "were",
  "been",
  "being",
  "has",
  "have",
  "had",
  "not",
  "but",
  "any",
  "all",
  "via",
]);

export function normalizeTitleWords(title: string): Set<string> {
  const words = title
    .toLowerCase()
    .replace(/[[\]()'"“”‘’`~!@#$%^&*_+=<>?,./\\|{}:;-]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w));
  return new Set(words);
}

/**
 * Jaccard similarity on normalized title word sets: |A ∩ B| / |A ∪ B|.
 * Identical word sets → 1.0, no overlap → 0. Either side empty → 0.
 */
export function titleSimilarity(a: string, b: string): number {
  const aWords = normalizeTitleWords(a);
  const bWords = normalizeTitleWords(b);
  if (aWords.size === 0 || bWords.size === 0) return 0;
  let intersect = 0;
  for (const w of aWords) if (bWords.has(w)) intersect++;
  const union = aWords.size + bWords.size - intersect;
  return union === 0 ? 0 : intersect / union;
}

export async function listTasks(userId: string, status?: string) {
  const where: Record<string, unknown> = { userId };
  if (status) where.status = status.toUpperCase();

  const tasks = await prisma.task.findMany({
    where,
    orderBy: [{ priority: "desc" }, { dueDate: "asc" }, { createdAt: "desc" }],
  });

  return {
    tasks: tasks.map(
      (t: {
        id: string;
        title: string;
        description: string | null;
        status: string;
        priority: string;
        dueDate: Date | null;
      }) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        dueDate: t.dueDate?.toISOString() || null,
      }),
    ),
  };
}

export async function createTask(
  userId: string,
  title: string,
  description?: string,
  priority?: string,
  dueDate?: string,
) {
  const recentOpen = await prisma.task.findMany({
    where: {
      userId,
      status: { in: [...OPEN_STATUSES] },
      createdAt: { gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, status: true, createdAt: true },
  });

  if (recentOpen.length >= MAX_OPEN_TASKS_IN_WINDOW) {
    return {
      success: false,
      reason: "too_many_open_tasks" as const,
      openTaskCount: recentOpen.length,
      message: `You already have ${recentOpen.length} open tasks created in the last 24h. Complete or delete existing tasks before creating more — do not create another duplicate.`,
    };
  }

  const duplicate = recentOpen.find(
    (t) => titleSimilarity(t.title, title) >= DUPLICATE_JACCARD_THRESHOLD,
  );
  if (duplicate) {
    return {
      success: false,
      reason: "duplicate" as const,
      existingTask: { id: duplicate.id, title: duplicate.title, status: duplicate.status },
      message: `A similar open task already exists: "${duplicate.title}" (id: ${duplicate.id}). Use update_task on the existing task instead of creating a new one.`,
    };
  }

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
