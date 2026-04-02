"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";

interface UsageStats {
  period: string;
  since: string;
  summary: {
    totalTokens: number;
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalCost: number;
    messageCount: number;
  };
  daily: { date: string; tokens: number; cost: number; messages: number }[];
}

interface ConvUsage {
  conversationId: string;
  title: string;
  totalTokens: number;
  estimatedCost: number;
  messageCount: number;
}

export default function UsagePage() {
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [convUsages, setConvUsages] = useState<ConvUsage[]>([]);
  const [period, setPeriod] = useState("month");

  useEffect(() => {
    apiFetch<UsageStats>(`/api/usage?period=${period}`)
      .then(setStats)
      .catch(() => {});
    apiFetch<{ conversations: ConvUsage[] }>("/api/usage/conversations")
      .then((d) => setConvUsages(d.conversations))
      .catch(() => {});
  }, [period]);

  const formatTokens = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-xl font-semibold text-gray-200 mb-1">Token Usage</h1>
      <p className="text-sm text-gray-500 mb-6">
        Track your AI token consumption and estimated costs
      </p>

      {/* Period selector */}
      <div className="flex gap-2 mb-6">
        {[
          { value: "week", label: "This Week" },
          { value: "month", label: "This Month" },
          { value: "all", label: "All Time" },
        ].map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => setPeriod(p.value)}
            className={`px-3 py-1.5 text-xs rounded-lg transition ${
              period === p.value
                ? "bg-white text-gray-900"
                : "text-gray-400 bg-gray-800/50 hover:bg-gray-800"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {stats && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            <div className="bg-gray-900/60 border border-gray-800/50 rounded-xl p-4">
              <p className="text-[11px] text-gray-500 mb-1">Total Tokens</p>
              <p className="text-lg font-semibold text-gray-200">
                {formatTokens(stats.summary.totalTokens)}
              </p>
            </div>
            <div className="bg-gray-900/60 border border-gray-800/50 rounded-xl p-4">
              <p className="text-[11px] text-gray-500 mb-1">Messages</p>
              <p className="text-lg font-semibold text-gray-200">{stats.summary.messageCount}</p>
            </div>
            <div className="bg-gray-900/60 border border-gray-800/50 rounded-xl p-4">
              <p className="text-[11px] text-gray-500 mb-1">Est. Cost</p>
              <p className="text-lg font-semibold text-emerald-400">
                ${stats.summary.totalCost.toFixed(4)}
              </p>
            </div>
            <div className="bg-gray-900/60 border border-gray-800/50 rounded-xl p-4">
              <p className="text-[11px] text-gray-500 mb-1">Avg/Message</p>
              <p className="text-lg font-semibold text-gray-200">
                {stats.summary.messageCount > 0
                  ? formatTokens(Math.round(stats.summary.totalTokens / stats.summary.messageCount))
                  : "0"}
              </p>
            </div>
          </div>

          {/* Daily breakdown */}
          {stats.daily.length > 0 && (
            <div className="mb-8">
              <h2 className="text-sm font-medium text-gray-300 mb-3">Daily Breakdown</h2>
              <div className="bg-gray-900/60 border border-gray-800/50 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] text-gray-500 border-b border-gray-800/50">
                      <th className="text-left px-4 py-2 font-medium">Date</th>
                      <th className="text-right px-4 py-2 font-medium">Messages</th>
                      <th className="text-right px-4 py-2 font-medium">Tokens</th>
                      <th className="text-right px-4 py-2 font-medium">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.daily.map((d) => (
                      <tr key={d.date} className="border-b border-gray-800/30 last:border-0">
                        <td className="px-4 py-2 text-gray-300">{d.date}</td>
                        <td className="px-4 py-2 text-right text-gray-400">{d.messages}</td>
                        <td className="px-4 py-2 text-right text-gray-400">
                          {formatTokens(d.tokens)}
                        </td>
                        <td className="px-4 py-2 text-right text-emerald-400/80">
                          ${d.cost.toFixed(4)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Per-conversation usage */}
      {convUsages.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-gray-300 mb-3">Top Conversations by Usage</h2>
          <div className="bg-gray-900/60 border border-gray-800/50 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-gray-500 border-b border-gray-800/50">
                  <th className="text-left px-4 py-2 font-medium">Conversation</th>
                  <th className="text-right px-4 py-2 font-medium">Messages</th>
                  <th className="text-right px-4 py-2 font-medium">Tokens</th>
                  <th className="text-right px-4 py-2 font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {convUsages.map((c) => (
                  <tr key={c.conversationId} className="border-b border-gray-800/30 last:border-0">
                    <td className="px-4 py-2 text-gray-300 truncate max-w-[200px]">{c.title}</td>
                    <td className="px-4 py-2 text-right text-gray-400">{c.messageCount}</td>
                    <td className="px-4 py-2 text-right text-gray-400">
                      {formatTokens(c.totalTokens)}
                    </td>
                    <td className="px-4 py-2 text-right text-emerald-400/80">
                      ${c.estimatedCost.toFixed(4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!stats && (
        <div className="flex items-center justify-center py-20 text-gray-500">Loading...</div>
      )}
    </div>
  );
}
