"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "../../../lib/api";

interface AgentDetail {
  id: string;
  name: string;
  endpoint: string;
  createdAt: string;
  _count: { testRuns: number };
}

export default function AgentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<AgentDetail>(`/api/agents/${id}`)
      .then(setAgent)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p className="text-center py-20 text-gray-500">Loading...</p>;
  if (!agent) return <p className="text-center py-20 text-red-400">Agent not found</p>;

  return (
    <main className="max-w-4xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-bold mb-2">{agent.name}</h1>
      <p className="text-gray-400 mb-8">{agent.endpoint}</p>

      <div className="grid grid-cols-2 gap-4 mb-10">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-sm text-gray-500 mb-1">Total Tests</p>
          <p className="text-2xl font-bold">{agent._count.testRuns}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-sm text-gray-500 mb-1">Created</p>
          <p className="text-lg">{new Date(agent.createdAt).toLocaleDateString()}</p>
        </div>
      </div>

      <Link
        href={`/tests/new?agentId=${agent.id}`}
        className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-lg font-medium transition"
      >
        Run Test for this Agent
      </Link>
    </main>
  );
}
