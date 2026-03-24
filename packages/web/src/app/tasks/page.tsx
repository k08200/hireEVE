"use client";

import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: "TODO" | "IN_PROGRESS" | "DONE";
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  dueDate: string | null;
}

const statusColors: Record<string, string> = {
  TODO: "bg-gray-700 text-gray-300",
  IN_PROGRESS: "bg-blue-900 text-blue-300",
  DONE: "bg-green-900 text-green-300",
};

const priorityColors: Record<string, string> = {
  LOW: "text-gray-500",
  MEDIUM: "text-yellow-500",
  HIGH: "text-orange-500",
  URGENT: "text-red-500",
};

const statusLabels: Record<string, string> = {
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  DONE: "Done",
};

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  const loadTasks = () => {
    const url =
      filter === "all"
        ? `${API_BASE}/api/tasks?userId=demo-user`
        : `${API_BASE}/api/tasks?userId=demo-user&status=${filter}`;
    fetch(url)
      .then((r) => r.json())
      .then((data) => setTasks(data.tasks || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadTasks();
  }, [filter]);

  const updateStatus = async (taskId: string, status: string) => {
    await fetch(`${API_BASE}/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    loadTasks();
  };

  const deleteTask = async (taskId: string) => {
    await fetch(`${API_BASE}/api/tasks/${taskId}`, { method: "DELETE" });
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  };

  const filtered = tasks;

  return (
    <main className="max-w-3xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Tasks</h1>
          <p className="text-gray-400 text-sm mt-1">
            Managed by EVE — ask her to add tasks in chat
          </p>
        </div>
        <div className="flex gap-1">
          {["all", "TODO", "IN_PROGRESS", "DONE"].map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                filter === f
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:text-white"
              }`}
            >
              {f === "all" ? "All" : statusLabels[f]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-gray-500 mb-2">No tasks yet</p>
          <p className="text-gray-600 text-sm">
            Tell EVE in chat: &quot;할 일 추가해줘&quot;
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((task) => (
            <div
              key={task.id}
              className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex items-start gap-3"
            >
              <button
                type="button"
                onClick={() =>
                  updateStatus(
                    task.id,
                    task.status === "DONE"
                      ? "TODO"
                      : task.status === "TODO"
                        ? "IN_PROGRESS"
                        : "DONE",
                  )
                }
                className={`mt-0.5 w-5 h-5 rounded border-2 shrink-0 transition ${
                  task.status === "DONE"
                    ? "bg-green-600 border-green-600"
                    : "border-gray-600 hover:border-blue-500"
                }`}
              >
                {task.status === "DONE" && (
                  <span className="text-white text-xs flex items-center justify-center">
                    ✓
                  </span>
                )}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`font-medium ${task.status === "DONE" ? "line-through text-gray-500" : ""}`}
                  >
                    {task.title}
                  </span>
                  <span className={`text-xs ${priorityColors[task.priority]}`}>
                    {task.priority}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${statusColors[task.status]}`}
                  >
                    {statusLabels[task.status]}
                  </span>
                </div>
                {task.description && (
                  <p className="text-sm text-gray-400 mt-1 truncate">{task.description}</p>
                )}
                {task.dueDate && (
                  <p className="text-xs text-gray-500 mt-1">
                    Due: {new Date(task.dueDate).toLocaleDateString()}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => deleteTask(task.id)}
                className="text-gray-600 hover:text-red-400 text-sm transition shrink-0"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
