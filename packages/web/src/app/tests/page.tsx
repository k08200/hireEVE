"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";

interface TestRun {
  id: string;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";
  score: number | null;
  passCount: number | null;
  failCount: number | null;
  warnCount: number | null;
  scenarioCount: number;
  createdAt: string;
  agent: { name: string };
}

const statusColors: Record<string, string> = {
  QUEUED: "text-yellow-400",
  RUNNING: "text-blue-400",
  COMPLETED: "text-green-400",
  FAILED: "text-red-400",
};

export default function TestsPage() {
  const [tests, setTests] = useState<TestRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ tests: TestRun[]; total: number }>("/api/tests")
      .then((data) => setTests(data.tests))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="max-w-4xl mx-auto px-6 py-12">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Test Runs</h1>
        <Link
          href="/tests/new"
          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-medium transition"
        >
          + Run Test
        </Link>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : tests.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <p className="text-lg mb-2">No test runs yet</p>
          <p>Run your first test to see results here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tests.map((test) => (
            <Link
              key={test.id}
              href={`/tests/${test.id}`}
              className="block bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-600 transition"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">{test.agent.name}</p>
                  <p className={`text-sm mt-1 ${statusColors[test.status]}`}>{test.status}</p>
                </div>
                <div className="text-right">
                  {test.score !== null ? (
                    <p className="text-2xl font-bold">{test.score}</p>
                  ) : (
                    <p className="text-2xl font-bold text-gray-600">—</p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    {test.passCount ?? 0}P / {test.failCount ?? 0}F / {test.warnCount ?? 0}W
                  </p>
                </div>
              </div>
              <p className="text-xs text-gray-600 mt-3">
                {new Date(test.createdAt).toLocaleString()} · {test.scenarioCount} scenarios
              </p>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
