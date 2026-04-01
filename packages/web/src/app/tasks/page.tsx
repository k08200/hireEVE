"use client";

import { useCallback, useEffect, useState } from "react";
import AuthGuard from "../../components/auth-guard";
import { useConfirm } from "../../components/confirm-dialog";
import { ListSkeleton } from "../../components/skeleton";
import { useToast } from "../../components/toast";
import { API_BASE, apiFetch, authHeaders } from "../../lib/api";

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: "TODO" | "IN_PROGRESS" | "DONE";
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  dueDate: string | null;
}

const statusColors: Record<string, string> = {
  TODO: "bg-gray-800 text-gray-300 border border-gray-700",
  IN_PROGRESS: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  DONE: "bg-green-500/10 text-green-400 border border-green-500/20",
};

const priorityColors: Record<string, string> = {
  LOW: "text-gray-500",
  MEDIUM: "text-yellow-500",
  HIGH: "text-orange-500",
  URGENT: "text-red-500",
};

function formatDueDate(dueDate: string, isDone: boolean): string {
  const due = new Date(dueDate);
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (isDone) return `Due: ${due.toLocaleDateString()}`;
  if (diffDays < 0) return `Overdue by ${Math.abs(diffDays)}d`;
  if (diffDays === 0) return "Due today";
  if (diffDays === 1) return "Due tomorrow";
  if (diffDays <= 7) return `Due in ${diffDays}d`;
  return `Due: ${due.toLocaleDateString()}`;
}

const statusLabels: Record<string, string> = {
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  DONE: "Done",
};

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", priority: "MEDIUM", dueDate: "" });
  const [editing, setEditing] = useState<Task | null>(null);
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    priority: "MEDIUM",
    status: "TODO",
    dueDate: "",
  });

  const loadTasks = useCallback(() => {
    const path = filter === "all" ? `/api/tasks` : `/api/tasks?status=${filter}`;
    apiFetch<{ tasks: Task[] }>(path)
      .then((data) => setTasks(data.tasks || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const updateStatus = async (taskId: string, status: string) => {
    await fetch(`${API_BASE}/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ status }),
    });
    loadTasks();
  };

  const createTask = async () => {
    try {
      await fetch(`${API_BASE}/api/tasks`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          title: form.title,
          description: form.description || undefined,
          priority: form.priority,
          dueDate: form.dueDate || undefined,
        }),
      });
      setShowForm(false);
      setForm({ title: "", description: "", priority: "MEDIUM", dueDate: "" });
      loadTasks();
      toast("Task created", "success");
    } catch (err) {
      toast(`Failed: ${err instanceof Error ? err.message : "Unknown error"}`, "error");
    }
  };

  const startEdit = (task: Task) => {
    setEditing(task);
    setEditForm({
      title: task.title,
      description: task.description || "",
      priority: task.priority,
      status: task.status,
      dueDate: task.dueDate ? task.dueDate.split("T")[0] : "",
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    await fetch(`${API_BASE}/api/tasks/${editing.id}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({
        title: editForm.title,
        description: editForm.description || null,
        priority: editForm.priority,
        status: editForm.status,
        dueDate: editForm.dueDate || null,
      }),
    });
    setEditing(null);
    loadTasks();
    toast("Task updated", "success");
  };

  const deleteTask = async (taskId: string) => {
    const ok = await confirm({
      title: "Delete Task / 할 일 삭제",
      message: "Are you sure? This cannot be undone. / 정말 삭제하시겠습니까?",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    await fetch(`${API_BASE}/api/tasks/${taskId}`, { method: "DELETE", headers: authHeaders() });
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    toast("Task deleted", "info");
  };

  // Escape key closes modals
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (editing) setEditing(null);
        else if (showForm) setShowForm(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editing, showForm]);

  const filtered = tasks.filter((t) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return t.title.toLowerCase().includes(q) || (t.description || "").toLowerCase().includes(q);
  });

  const doneCount = tasks.filter((t) => t.status === "DONE").length;
  const overdueCount = tasks.filter(
    (t) => t.status !== "DONE" && t.dueDate && new Date(t.dueDate) < new Date(),
  ).length;
  const progress = tasks.length > 0 ? Math.round((doneCount / tasks.length) * 100) : 0;

  return (
    <AuthGuard>
      <main className="max-w-3xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold">Tasks</h1>
            <p className="text-gray-400 text-sm mt-1">
              Managed by EVE or add directly / EVE에게 시키거나 직접 추가
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <button
              type="button"
              onClick={() => setShowForm(!showForm)}
              className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
            >
              + Add Task
            </button>
          </div>
        </div>

        {/* Stats bar */}
        {!loading && tasks.length > 0 && (
          <div className="bg-gray-900/80 border border-gray-800/60 rounded-xl p-4 mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-400">
                {doneCount}/{tasks.length} completed
                {overdueCount > 0 && (
                  <span className="text-red-400 ml-2">{overdueCount} overdue</span>
                )}
              </span>
              <span className="text-sm font-medium text-blue-400">{progress}%</span>
            </div>
            <div className="w-full bg-gray-800 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {showForm && (
          <div className="bg-gray-900/80 border border-gray-800/60 rounded-xl p-4 mb-6 space-y-3">
            <input
              placeholder="Task title * / 할 일 제목"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
            <textarea
              placeholder="Description (optional) / 설명"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm resize-none focus:outline-none focus:border-blue-500"
            />
            <div className="grid grid-cols-2 gap-3">
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
                className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-3 py-1.5 text-sm text-gray-400 hover:text-white transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={createTask}
                disabled={!form.title}
                className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white px-4 py-1.5 rounded text-sm font-medium transition"
              >
                Save
              </button>
            </div>
          </div>
        )}

        <div className="flex gap-1 mb-4">
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

        {/* Search */}
        <div className="mb-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks... / 할 일 검색..."
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition placeholder-gray-500"
          />
        </div>

        {/* Edit modal */}
        {editing && (
          // biome-ignore lint/a11y/noStaticElementInteractions: modal backdrop dismiss
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-slide-up px-4"
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget) setEditing(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditing(null);
            }}
          >
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-lg">
              <h3 className="font-semibold mb-4">Edit Task / 할 일 수정</h3>
              <div className="space-y-3">
                <input
                  placeholder="Title *"
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
                <textarea
                  placeholder="Description (optional)"
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  rows={2}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm resize-none focus:outline-none focus:border-blue-500"
                />
                <div className="grid grid-cols-3 gap-3">
                  <select
                    value={editForm.priority}
                    onChange={(e) => setEditForm({ ...editForm, priority: e.target.value })}
                    className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                  <select
                    value={editForm.status}
                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                    className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  >
                    <option value="TODO">To Do</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="DONE">Done</option>
                  </select>
                  <input
                    type="date"
                    value={editForm.dueDate}
                    onChange={(e) => setEditForm({ ...editForm, dueDate: e.target.value })}
                    className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end mt-4">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveEdit}
                  disabled={!editForm.title}
                  className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <ListSkeleton count={4} />
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-500 mb-2">No tasks yet</p>
            <p className="text-gray-600 text-sm">Tell EVE in chat: &quot;할 일 추가해줘&quot;</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((task) => (
              // biome-ignore lint/a11y/useSemanticElements: div with nested interactive buttons
              <div
                key={task.id}
                role="button"
                tabIndex={0}
                className="bg-gray-900/80 border border-gray-800/60 rounded-xl p-4 flex items-start gap-3 cursor-pointer hover:border-gray-600 transition"
                onClick={() => startEdit(task)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") startEdit(task);
                }}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    updateStatus(
                      task.id,
                      task.status === "DONE"
                        ? "TODO"
                        : task.status === "TODO"
                          ? "IN_PROGRESS"
                          : "DONE",
                    );
                  }}
                  className={`mt-0.5 w-5 h-5 rounded border-2 shrink-0 transition ${
                    task.status === "DONE"
                      ? "bg-green-600 border-green-600"
                      : "border-gray-600 hover:border-blue-500"
                  }`}
                >
                  {task.status === "DONE" && (
                    <span className="text-white text-xs flex items-center justify-center">✓</span>
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
                    <p
                      className={`text-xs mt-1 ${task.status !== "DONE" && new Date(task.dueDate) < new Date() ? "text-red-400" : "text-gray-500"}`}
                    >
                      {formatDueDate(task.dueDate, task.status === "DONE")}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteTask(task.id);
                  }}
                  className="text-gray-600 hover:text-red-400 text-sm transition shrink-0"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </AuthGuard>
  );
}
