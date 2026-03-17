"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";

interface Agent {
  id: string;
  name: string;
}

export default function NewTestPage() {
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentId, setAgentId] = useState("");
  const [scenarioCount, setScenarioCount] = useState(100);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<{ agents: Agent[] }>("/api/agents")
      .then((data) => {
        setAgents(data.agents);
        if (data.agents.length > 0) setAgentId(data.agents[0].id);
      })
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      // TODO: replace hardcoded userId with auth
      const result = await apiFetch<{ id: string }>("/api/tests", {
        method: "POST",
        body: JSON.stringify({
          agentId,
          userId: "demo-user",
          scenarioCount,
        }),
      });
      router.push(`/tests/${result.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create test");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="max-w-xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-bold mb-8">Run Test</h1>

      {agents.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="mb-4">No agents registered. Register an agent first.</p>
          <a
            href="/agents/new"
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg"
          >
            Register Agent
          </a>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Agent</label>
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500"
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Scenario Count</label>
            <input
              type="number"
              min={1}
              max={1000}
              value={scenarioCount}
              onChange={(e) => setScenarioCount(Number(e.target.value))}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white py-3 rounded-lg font-medium transition"
          >
            {submitting ? "Starting..." : "Start Test Run"}
          </button>
        </form>
      )}
    </main>
  );
}
