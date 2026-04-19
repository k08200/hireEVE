"use client";

import { useEffect, useState } from "react";
import AuthGuard from "../../components/auth-guard";
import { useConfirm } from "../../components/confirm-dialog";
import { ListSkeleton } from "../../components/skeleton";
import { useToast } from "../../components/toast";

import { API_BASE, apiFetch, authHeaders } from "../../lib/api";
import { captureClientError } from "../../lib/sentry";

interface Reminder {
  id: string;
  title: string;
  description: string | null;
  remindAt: string;
  status: "PENDING" | "SENT" | "DISMISSED";
}

export default function RemindersPage() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", remindAt: "" });
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const { confirm } = useConfirm();

  const load = () => {
    apiFetch<{ reminders: Reminder[] }>("/api/reminders")
      .then((d) => setReminders(d.reminders || []))
      .catch((err) => captureClientError(err, { scope: "reminders.load" }))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    const res = await fetch(`${API_BASE}/api/reminders`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      toast("Failed to create reminder", "error");
      return;
    }
    setShowForm(false);
    setForm({ title: "", description: "", remindAt: "" });
    load();
    toast("Reminder created", "success");
  };

  const dismiss = async (id: string) => {
    const res = await fetch(`${API_BASE}/api/reminders/${id}/dismiss`, {
      method: "PATCH",
      headers: authHeaders(),
    });
    if (!res.ok) return;
    setReminders((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: "DISMISSED" as const } : r)),
    );
    toast("Reminder dismissed", "success");
  };

  const snooze = async (id: string, minutes: number) => {
    const res = await fetch(`${API_BASE}/api/reminders/${id}/snooze`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ minutes }),
    });
    if (!res.ok) {
      toast("Snooze failed", "error");
      return;
    }
    const updated = await res.json();
    setReminders((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, remindAt: updated.remindAt, status: "PENDING" as const } : r,
      ),
    );
    const label = minutes >= 1440 ? `${minutes / 1440}d` : `${minutes / 60}h`;
    toast(`Snoozed for ${label}`, "success");
  };

  const remove = async (id: string) => {
    const ok = await confirm({
      title: "Delete Reminder",
      message: "Are you sure? This cannot be undone.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    await fetch(`${API_BASE}/api/reminders/${id}`, { method: "DELETE", headers: authHeaders() });
    setReminders((prev) => prev.filter((r) => r.id !== id));
    toast("Reminder deleted", "info");
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulkDelete = async (ids?: string[]) => {
    const label = ids ? `${ids.length} selected reminders` : "all reminders";
    const ok = await confirm({
      title: "Delete Reminders",
      message: `Delete ${label}? This cannot be undone.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    await fetch(`${API_BASE}/api/reminders/bulk-delete`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ ids }),
    });
    if (ids) {
      const idSet = new Set(ids);
      setReminders((prev) => prev.filter((r) => !idSet.has(r.id)));
    } else {
      setReminders([]);
    }
    setSelected(new Set());
    setSelectMode(false);
    toast(`Deleted ${label}`, "info");
  };

  // Escape key closes form
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && showForm) setShowForm(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showForm]);

  const quickCreate = async (title: string, minutesFromNow: number) => {
    const remindAt = new Date(Date.now() + minutesFromNow * 60_000).toISOString();
    await fetch(`${API_BASE}/api/reminders`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ title, remindAt }),
    });
    load();
    toast(`Reminder set: ${title}`, "success");
  };

  const active = reminders.filter((r) => r.status !== "DISMISSED");
  const dismissed = reminders.filter((r) => r.status === "DISMISSED");

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const isPast = (iso: string) => new Date(iso) < new Date();

  return (
    <AuthGuard>
      <main className="max-w-3xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Reminders</h1>
            <p className="text-gray-400 text-sm mt-1">Never forget anything</p>
          </div>
          <div className="flex items-center gap-2">
            {reminders.length > 0 && (
              <>
                {selectMode ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        if (selected.size === reminders.length) {
                          setSelected(new Set());
                        } else {
                          setSelected(new Set(reminders.map((r) => r.id)));
                        }
                      }}
                      className="text-xs text-gray-400 hover:text-white transition px-3 py-2"
                    >
                      {selected.size === reminders.length ? "Deselect All" : "Select All"}
                    </button>
                    {selected.size > 0 && (
                      <button
                        type="button"
                        onClick={() => bulkDelete(Array.from(selected))}
                        className="bg-red-600 hover:bg-red-500 text-white px-3 py-2 rounded-lg text-xs font-medium transition"
                      >
                        Delete ({selected.size})
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectMode(false);
                        setSelected(new Set());
                      }}
                      className="text-xs text-gray-400 hover:text-white transition px-3 py-2"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setSelectMode(true)}
                      className="text-xs text-gray-400 hover:text-white transition px-3 py-2 border border-gray-700 rounded-lg"
                    >
                      Select
                    </button>
                    <button
                      type="button"
                      onClick={() => bulkDelete()}
                      className="text-xs text-red-400 hover:text-red-300 transition px-3 py-2 border border-gray-700 rounded-lg"
                    >
                      Delete All
                    </button>
                  </>
                )}
              </>
            )}
            <button
              type="button"
              onClick={() => setShowForm(!showForm)}
              className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
            >
              + Add Reminder
            </button>
          </div>
        </div>

        {/* Quick-create presets */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {[
            { label: "30min later", labelKr: "30min later", minutes: 30 },
            { label: "1 hour", labelKr: "1 hour", minutes: 60 },
            { label: "Tomorrow 9AM", labelKr: "Tomorrow 9AM", minutes: -1 },
            { label: "Lunch break", labelKr: "Lunch break", minutes: -2 },
            { label: "End of day", labelKr: "End of day", minutes: -3 },
          ].map((preset) => {
            let minutes = preset.minutes;
            if (minutes === -1) {
              const tomorrow = new Date();
              tomorrow.setDate(tomorrow.getDate() + 1);
              tomorrow.setHours(9, 0, 0, 0);
              minutes = Math.max(1, Math.round((tomorrow.getTime() - Date.now()) / 60_000));
            } else if (minutes === -2) {
              const today = new Date();
              today.setHours(12, 0, 0, 0);
              if (today.getTime() < Date.now()) today.setDate(today.getDate() + 1);
              minutes = Math.max(1, Math.round((today.getTime() - Date.now()) / 60_000));
            } else if (minutes === -3) {
              const today = new Date();
              today.setHours(18, 0, 0, 0);
              if (today.getTime() < Date.now()) today.setDate(today.getDate() + 1);
              minutes = Math.max(1, Math.round((today.getTime() - Date.now()) / 60_000));
            }
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => quickCreate(`Reminder (${preset.labelKr})`, minutes)}
                className="bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white border border-gray-700 px-3 py-1.5 rounded-lg text-xs font-medium transition"
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        {showForm && (
          <div className="bg-gray-900/80 border border-gray-800/60 rounded-xl p-4 mb-6 space-y-3">
            <input
              placeholder="Title *"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
            <textarea
              placeholder="Description (optional)"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm resize-none focus:outline-none focus:border-blue-500"
            />
            <input
              type="datetime-local"
              value={form.remindAt}
              onChange={(e) => setForm({ ...form, remindAt: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
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
                onClick={create}
                disabled={!form.title || !form.remindAt}
                className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white px-4 py-1.5 rounded text-sm font-medium transition"
              >
                Save
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <ListSkeleton count={3} />
        ) : active.length === 0 && dismissed.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-500 mb-2">No reminders yet</p>
            <p className="text-gray-600 text-sm">
              Tell EVE: &quot;Remind me about the meeting at 3pm tomorrow&quot;
            </p>
          </div>
        ) : (
          <>
            {active.length > 0 && (
              <div className="space-y-2 mb-8">
                <h2 className="text-sm font-medium text-gray-400 mb-2">Active ({active.length})</h2>
                {active.map((r) => (
                  <div
                    key={r.id}
                    className={`bg-gray-900/80 border rounded-xl p-4 group ${selected.has(r.id) ? "border-blue-500/50" : "border-gray-800/60"}`}
                    onClick={selectMode ? () => toggleSelect(r.id) : undefined}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        {selectMode && (
                          <input
                            type="checkbox"
                            checked={selected.has(r.id)}
                            onChange={() => toggleSelect(r.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="mt-1 accent-blue-600"
                          />
                        )}
                        <div>
                          <span className="font-medium">{r.title}</span>
                          <div className="flex items-center gap-2 mt-1">
                            <span
                              className={`text-xs ${isPast(r.remindAt) ? "text-red-400" : "text-gray-400"}`}
                            >
                              {formatDate(r.remindAt)}
                            </span>
                            {isPast(r.remindAt) && (
                              <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">
                                overdue
                              </span>
                            )}
                          </div>
                          {r.description && (
                            <p className="text-xs text-gray-500 mt-1">{r.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition">
                        <button
                          type="button"
                          onClick={() => snooze(r.id, 60)}
                          className="text-[10px] text-gray-500 hover:text-yellow-400 transition px-1.5 py-0.5 rounded bg-gray-800"
                          title="Snooze 1 hour"
                        >
                          1h
                        </button>
                        <button
                          type="button"
                          onClick={() => snooze(r.id, 1440)}
                          className="text-[10px] text-gray-500 hover:text-yellow-400 transition px-1.5 py-0.5 rounded bg-gray-800"
                          title="Snooze 1 day"
                        >
                          1d
                        </button>
                        <button
                          type="button"
                          onClick={() => dismiss(r.id)}
                          className="text-xs text-gray-500 hover:text-green-400 transition"
                        >
                          Done
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(r.id)}
                          className="text-xs text-gray-500 hover:text-red-400 transition"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {dismissed.length > 0 && (
              <div className="space-y-2">
                <h2 className="text-sm font-medium text-gray-500 mb-2">
                  Dismissed ({dismissed.length})
                </h2>
                {dismissed.map((r) => (
                  <div
                    key={r.id}
                    className={`bg-gray-900/50 border rounded-lg p-4 opacity-60 group ${selected.has(r.id) ? "border-blue-500/50" : "border-gray-800/50"}`}
                    onClick={selectMode ? () => toggleSelect(r.id) : undefined}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        {selectMode && (
                          <input
                            type="checkbox"
                            checked={selected.has(r.id)}
                            onChange={() => toggleSelect(r.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="mt-1 accent-blue-600"
                          />
                        )}
                        <div>
                          <span className="font-medium line-through">{r.title}</span>
                          <p className="text-xs text-gray-500 mt-1">{formatDate(r.remindAt)}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => remove(r.id)}
                        className="text-xs text-gray-600 hover:text-red-400 transition opacity-0 group-hover:opacity-100"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </AuthGuard>
  );
}
