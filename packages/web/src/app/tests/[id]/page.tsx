"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";

interface Evaluation {
  id: string;
  scenario: string;
  category: string;
  verdict: "PASS" | "FAIL" | "WARNING";
  reason: string | null;
  latencyMs: number | null;
}

interface TestRunDetail {
  id: string;
  status: string;
  score: number | null;
  passCount: number | null;
  failCount: number | null;
  warnCount: number | null;
  scenarioCount: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  agent: { name: string };
  evaluations: Evaluation[];
}

const verdictColors: Record<string, string> = {
  PASS: "text-green-400",
  FAIL: "text-red-400",
  WARNING: "text-yellow-400",
};

const verdictBg: Record<string, string> = {
  PASS: "bg-green-900/30",
  FAIL: "bg-red-900/30",
  WARNING: "bg-yellow-900/30",
};

export default function TestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [test, setTest] = useState<TestRunDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<TestRunDetail>(`/api/tests/${id}`)
      .then(setTest)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p className="text-center py-20 text-gray-500">Loading...</p>;
  if (!test) return <p className="text-center py-20 text-red-400">Test run not found</p>;

  return (
    <main className="max-w-4xl mx-auto px-6 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">{test.agent.name}</h1>
        <p className="text-gray-400">
          {test.status} · {new Date(test.createdAt).toLocaleString()}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        <StatCard label="Score" value={test.score !== null ? String(test.score) : "—"} />
        <StatCard label="Pass" value={String(test.passCount ?? 0)} color="text-green-400" />
        <StatCard label="Fail" value={String(test.failCount ?? 0)} color="text-red-400" />
        <StatCard label="Warning" value={String(test.warnCount ?? 0)} color="text-yellow-400" />
      </div>

      <h2 className="text-xl font-semibold mb-4">Evaluations</h2>
      {test.evaluations.length === 0 ? (
        <p className="text-gray-500">No evaluations yet.</p>
      ) : (
        <div className="space-y-2">
          {test.evaluations.map((ev) => (
            <div
              key={ev.id}
              className={`border border-gray-800 rounded-lg p-4 ${verdictBg[ev.verdict]}`}
            >
              <div className="flex items-center justify-between mb-1">
                <p className="font-medium">{ev.scenario}</p>
                <span className={`text-sm font-semibold ${verdictColors[ev.verdict]}`}>
                  {ev.verdict}
                </span>
              </div>
              <p className="text-sm text-gray-400">{ev.category}</p>
              {ev.reason && <p className="text-sm text-gray-300 mt-2">{ev.reason}</p>}
              {ev.latencyMs !== null && (
                <p className="text-xs text-gray-600 mt-1">{ev.latencyMs}ms</p>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color ?? ""}`}>{value}</p>
    </div>
  );
}
