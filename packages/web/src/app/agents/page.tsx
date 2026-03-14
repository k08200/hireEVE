"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "../../lib/api";

interface Agent {
  id: string;
  name: string;
  endpoint: string;
  createdAt: string;
  _count?: { testRuns: number };
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ agents: Agent[]; total: number }>("/api/agents")
      .then((data) => setAgents(data.agents))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="max-w-4xl mx-auto px-6 py-12">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Agents</h1>
        <Link
          href="/agents/new"
          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-medium transition"
        >
          + Register Agent
        </Link>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : agents.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <p className="text-lg mb-2">No agents registered yet</p>
          <p>Register your first AI agent to start testing.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {agents.map((agent) => (
            <Link
              key={agent.id}
              href={`/agents/${agent.id}`}
              className="block bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-600 transition"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-lg">{agent.name}</p>
                  <p className="text-sm text-gray-500 mt-1">{agent.endpoint}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-400">
                    {agent._count?.testRuns ?? 0} tests
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    {new Date(agent.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
