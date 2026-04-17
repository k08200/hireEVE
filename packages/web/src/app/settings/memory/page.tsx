"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";
import { captureClientError } from "../../../lib/sentry";

interface Memory {
  id: string;
  type: string;
  key: string;
  content: string;
  source?: string;
  confidence: number;
  updatedAt: string;
}

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  PREFERENCE: { label: "Preference", color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  FACT: { label: "Fact", color: "text-purple-400 bg-purple-500/10 border-purple-500/20" },
  DECISION: { label: "Decision", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  CONTEXT: { label: "Context", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  FEEDBACK: { label: "Feedback", color: "text-rose-400 bg-rose-500/10 border-rose-500/20" },
};

export default function MemoryPage() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [stats, setStats] = useState<{ total: number; byType: { type: string; _count: number }[] }>(
    { total: 0, byType: [] },
  );

  const load = () => {
    const params = new URLSearchParams();
    if (filter !== "all") params.set("type", filter);
    if (search) params.set("search", search);
    apiFetch<{ memories: Memory[] }>(`/api/memories?${params}`)
      .then((d) => setMemories(d.memories))
      .catch((err) => captureClientError(err, { scope: "memory.load-list" }));
    apiFetch<{ total: number; byType: { type: string; _count: number }[] }>("/api/memories/stats")
      .then(setStats)
      .catch((err) => captureClientError(err, { scope: "memory.load-stats" }));
  };

  useEffect(() => {
    load();
  }, [filter, search]);

  const deleteMemory = async (id: string) => {
    await apiFetch(`/api/memories/${id}`, { method: "DELETE" });
    setMemories((prev) => prev.filter((m) => m.id !== id));
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-xl font-semibold text-gray-200 mb-1">EVE&apos;s Memory</h1>
      <p className="text-sm text-gray-500 mb-6">
        Things EVE remembers about you across conversations. You can review and delete any memory.
      </p>

      {/* Stats */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`px-3 py-1.5 text-xs rounded-lg transition border ${
            filter === "all"
              ? "bg-white text-gray-900 border-white"
              : "text-gray-400 bg-gray-800/50 border-gray-800 hover:bg-gray-800"
          }`}
        >
          All ({stats.total})
        </button>
        {Object.entries(TYPE_LABELS).map(([type, { label, color }]) => {
          const count = stats.byType.find((b) => b.type === type)?._count || 0;
          return (
            <button
              key={type}
              type="button"
              onClick={() => setFilter(type)}
              className={`px-3 py-1.5 text-xs rounded-lg transition border ${
                filter === type
                  ? `${color} border-current`
                  : "text-gray-400 bg-gray-800/50 border-gray-800 hover:bg-gray-800"
              }`}
            >
              {label} ({count})
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search memories..."
          className="w-full bg-gray-900/50 border border-gray-800/60 rounded-xl px-4 py-2.5 text-sm text-gray-300 placeholder-gray-600 focus:outline-none focus:border-gray-600 transition"
        />
      </div>

      {/* Memory list */}
      <div className="space-y-3">
        {memories.map((m) => {
          const typeInfo = TYPE_LABELS[m.type] || {
            label: m.type,
            color: "text-gray-400 bg-gray-500/10",
          };
          return (
            <div
              key={m.id}
              className="bg-gray-900/60 border border-gray-800/50 rounded-xl p-4 group"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className={`inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full border ${typeInfo.color}`}
                    >
                      {typeInfo.label}
                    </span>
                    <span className="text-[12px] text-gray-500 font-mono">{m.key}</span>
                  </div>
                  <p className="text-sm text-gray-200 leading-relaxed">{m.content}</p>
                  <p className="text-[11px] text-gray-600 mt-2">
                    Updated: {new Date(m.updatedAt).toLocaleDateString("ko-KR")}
                    {m.source && ` • Source: ${m.source}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => deleteMemory(m.id)}
                  className="p-1.5 rounded-md text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition opacity-0 group-hover:opacity-100"
                  title="Delete memory"
                >
                  <svg
                    aria-hidden="true"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            </div>
          );
        })}

        {memories.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500 text-sm mb-1">No memories yet</p>
            <p className="text-gray-600 text-xs">
              EVE will automatically remember important things as you chat
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
