"use client";

import { useEffect, useState } from "react";
import AuthGuard from "../../components/auth-guard";
import { useToast } from "../../components/toast";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../lib/auth";

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  plan: string;
  stripeId: string | null;
  createdAt: string;
  messageCount: number;
  _count: { conversations: number; tasks: number };
}

interface Stats {
  totalUsers: number;
  totalConversations: number;
  monthlyMessages: number;
  planDistribution: Record<string, number>;
}

interface OpsMetrics {
  window: string;
  tools: { executed: number; errors: number; skipped: number; successRate: number };
  approvals: {
    proposed: number;
    approved: number;
    rejected: number;
    pending: number;
    approvalRate: number;
  };
  notifications: { sent: number; read: number; readRate: number };
  activeUsers: { dau: number; wau: number; mau: number };
  tokens: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
  };
  recentErrors: Array<{
    summary: string;
    createdAt: string;
    userId: string;
    tool: string | null;
  }>;
}

interface PerfSnapshot {
  routes: Array<{
    route: string;
    count: number;
    errorCount: number;
    p50: number;
    p95: number;
    p99: number;
    max: number;
  }>;
  capturedAt: string;
}

interface EvalReport {
  summary: {
    total: number;
    passed: number;
    failed: number;
    passRate: number;
    failures: Array<{ id: string; name: string; severity: string; message: string }>;
  };
  results: Array<{
    id: string;
    name: string;
    description: string;
    category: string;
    severity: string;
    passed: boolean;
    message: string | null;
  }>;
  runAt: string;
}

type SectionError = { endpoint: string; message: string };

function AdminDashboard() {
  const { user, token } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [ops, setOps] = useState<OpsMetrics | null>(null);
  const [perf, setPerf] = useState<PerfSnapshot | null>(null);
  const [evalData, setEvalData] = useState<EvalReport | null>(null);
  const [evalLoading, setEvalLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<SectionError[]>([]);
  const [tab, setTab] = useState<"ops" | "users">("ops");

  useEffect(() => {
    if (!token) return;
    // allSettled — partial failures (e.g. one endpoint 404 on an older deploy)
    // must not blow up the whole page. Each section degrades independently.
    Promise.allSettled([
      apiFetch<{ users: UserRow[] }>("/api/admin/users"),
      apiFetch<Stats>("/api/admin/stats"),
      apiFetch<OpsMetrics>("/api/admin/ops"),
      apiFetch<PerfSnapshot>("/api/admin/perf"),
    ])
      .then(([usersRes, statsRes, opsRes, perfRes]) => {
        const failed: SectionError[] = [];

        if (usersRes.status === "fulfilled") setUsers(usersRes.value.users);
        else failed.push({ endpoint: "/api/admin/users", message: errMsg(usersRes.reason) });

        if (statsRes.status === "fulfilled") setStats(statsRes.value);
        else failed.push({ endpoint: "/api/admin/stats", message: errMsg(statsRes.reason) });

        if (opsRes.status === "fulfilled") setOps(opsRes.value);
        else failed.push({ endpoint: "/api/admin/ops", message: errMsg(opsRes.reason) });

        if (perfRes.status === "fulfilled") setPerf(perfRes.value);
        else failed.push({ endpoint: "/api/admin/perf", message: errMsg(perfRes.reason) });

        setErrors(failed);
        if (failed.length > 0 && failed.length < 4) {
          toast(`${failed.length} admin section(s) failed to load`, "error");
        } else if (failed.length === 4) {
          toast("Admin endpoints unreachable — check API deploy", "error");
        }
      })
      .finally(() => setLoading(false));
  }, [token, toast]);

  const updateUser = async (id: string, data: { plan?: string; role?: string }) => {
    try {
      const updated = await apiFetch<UserRow>(`/api/admin/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...updated } : u)));
      toast("Updated", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed", "error");
    }
  };

  const runEval = async () => {
    setEvalLoading(true);
    try {
      const data = await apiFetch<EvalReport>("/api/admin/eval");
      setEvalData(data);
      const summary = data.summary;
      if (summary.failed === 0) {
        toast(`All ${summary.total} eval scenarios passed`, "success");
      } else {
        toast(`${summary.failed}/${summary.total} eval scenarios failed`, "error");
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Eval failed", "error");
    } finally {
      setEvalLoading(false);
    }
  };

  const deleteUser = async (id: string, email: string) => {
    if (!confirm(`Delete ${email} and all their data?`)) return;
    try {
      await apiFetch(`/api/admin/users/${id}`, { method: "DELETE" });
      setUsers((prev) => prev.filter((u) => u.id !== id));
      toast("User deleted", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed", "error");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (user?.role !== "ADMIN") {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        Admin access required
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      {errors.length > 0 && (
        <div className="border border-amber-700/50 bg-amber-950/30 rounded-lg p-3 text-xs space-y-1">
          <p className="font-medium text-amber-300">Some sections failed to load</p>
          {errors.map((e) => (
            <p key={e.endpoint} className="text-amber-400/80 font-mono">
              {e.endpoint} — {e.message}
            </p>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Admin Dashboard</h1>
        <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1">
          <button
            type="button"
            onClick={() => setTab("ops")}
            className={`px-3 py-1 text-xs rounded ${tab === "ops" ? "bg-gray-800 text-white" : "text-gray-500 hover:text-gray-300"}`}
          >
            Ops
          </button>
          <button
            type="button"
            onClick={() => setTab("users")}
            className={`px-3 py-1 text-xs rounded ${tab === "users" ? "bg-gray-800 text-white" : "text-gray-500 hover:text-gray-300"}`}
          >
            Users
          </button>
        </div>
      </div>

      {/* Agent Eval Harness */}
      <section className="border border-gray-800 rounded-lg p-4 bg-gray-900/50">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-medium text-white">Agent Decision Eval</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Regression checks for tool risk, dedup, and plan gating logic
            </p>
          </div>
          <button
            type="button"
            onClick={runEval}
            disabled={evalLoading}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {evalLoading ? "Running..." : "Run eval"}
          </button>
        </div>
        {evalData && (
          <div className="space-y-2">
            <div className="flex items-center gap-4 text-xs">
              <span className="text-gray-400">
                {evalData.summary.passed}/{evalData.summary.total} passed
              </span>
              <span
                className={`font-medium ${evalData.summary.failed === 0 ? "text-emerald-400" : "text-red-400"}`}
              >
                {(evalData.summary.passRate * 100).toFixed(0)}% pass rate
              </span>
              <span className="text-gray-600">
                {new Date(evalData.runAt).toLocaleString("ko-KR")}
              </span>
            </div>
            <div className="space-y-1">
              {evalData.results.map((r) => (
                <div
                  key={r.id}
                  className={`flex items-start gap-2 text-xs p-2 rounded ${
                    r.passed ? "bg-gray-900/50" : "bg-red-950/30 border border-red-900/50"
                  }`}
                >
                  <span
                    className={`shrink-0 w-4 h-4 rounded-full flex items-center justify-center ${
                      r.passed ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
                    }`}
                  >
                    {r.passed ? "✓" : "✕"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-gray-500">{r.id}</span>
                      <span className="text-gray-300">{r.name}</span>
                      <span className="text-[10px] text-gray-600 uppercase">[{r.severity}]</span>
                    </div>
                    {!r.passed && r.message && <p className="text-red-400 mt-0.5">{r.message}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Users" value={stats.totalUsers} />
          <StatCard label="Conversations" value={stats.totalConversations} />
          <StatCard label="Messages (this month)" value={stats.monthlyMessages} />
          <StatCard
            label="Plan Distribution"
            value={Object.entries(stats.planDistribution)
              .map(([k, v]) => `${k}: ${v}`)
              .join(", ")}
          />
        </div>
      )}

      {tab === "ops" && ops && (
        <div className="space-y-6">
          <section>
            <h2 className="text-sm font-medium text-gray-400 mb-3">Tool Execution (last 7d)</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                label="Success Rate"
                value={`${(ops.tools.successRate * 100).toFixed(1)}%`}
              />
              <StatCard label="Executed" value={ops.tools.executed} />
              <StatCard label="Errors" value={ops.tools.errors} />
              <StatCard label="Skipped (dedup)" value={ops.tools.skipped} />
            </div>
          </section>

          <section>
            <h2 className="text-sm font-medium text-gray-400 mb-3">Approval Flow (last 7d)</h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <StatCard
                label="Approval Rate"
                value={`${(ops.approvals.approvalRate * 100).toFixed(1)}%`}
              />
              <StatCard label="Proposed" value={ops.approvals.proposed} />
              <StatCard label="Approved" value={ops.approvals.approved} />
              <StatCard label="Rejected" value={ops.approvals.rejected} />
              <StatCard label="Pending" value={ops.approvals.pending} />
            </div>
          </section>

          <section>
            <h2 className="text-sm font-medium text-gray-400 mb-3">Active Users & Notifications</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="DAU" value={ops.activeUsers.dau} />
              <StatCard label="WAU" value={ops.activeUsers.wau} />
              <StatCard label="MAU" value={ops.activeUsers.mau} />
              <StatCard
                label="Notif Read Rate"
                value={`${(ops.notifications.readRate * 100).toFixed(1)}%`}
              />
            </div>
          </section>

          <section>
            <h2 className="text-sm font-medium text-gray-400 mb-3">Token Usage (last 7d)</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                label="Estimated Cost"
                value={`$${ops.tokens.estimatedCostUsd.toFixed(2)}`}
              />
              <StatCard label="Prompt Tokens" value={ops.tokens.promptTokens.toLocaleString()} />
              <StatCard
                label="Completion Tokens"
                value={ops.tokens.completionTokens.toLocaleString()}
              />
              <StatCard label="Total Tokens" value={ops.tokens.totalTokens.toLocaleString()} />
            </div>
          </section>

          {perf && perf.routes.length > 0 && (
            <section>
              <h2 className="text-sm font-medium text-gray-400 mb-3">
                Route Latency (since last restart)
              </h2>
              <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-800">
                      <th className="p-3">Route</th>
                      <th className="p-3">Count</th>
                      <th className="p-3">Errors</th>
                      <th className="p-3">p50</th>
                      <th className="p-3">p95</th>
                      <th className="p-3">p99</th>
                      <th className="p-3">Max</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perf.routes.slice(0, 20).map((r) => (
                      <tr key={r.route} className="border-b border-gray-800/50">
                        <td className="p-3 font-mono text-gray-300">{r.route}</td>
                        <td className="p-3 text-gray-400">{r.count}</td>
                        <td
                          className={`p-3 ${r.errorCount > 0 ? "text-red-400" : "text-gray-500"}`}
                        >
                          {r.errorCount}
                        </td>
                        <td className="p-3 text-gray-400">{r.p50}ms</td>
                        <td className={`p-3 ${r.p95 > 1000 ? "text-yellow-400" : "text-gray-400"}`}>
                          {r.p95}ms
                        </td>
                        <td className={`p-3 ${r.p99 > 1000 ? "text-yellow-400" : "text-gray-400"}`}>
                          {r.p99}ms
                        </td>
                        <td className={`p-3 ${r.max > 2000 ? "text-red-400" : "text-gray-400"}`}>
                          {r.max}ms
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {ops.recentErrors.length > 0 && (
            <section>
              <h2 className="text-sm font-medium text-gray-400 mb-3">Recent Errors</h2>
              <div className="bg-gray-900 border border-gray-800 rounded-lg divide-y divide-gray-800">
                {ops.recentErrors.map((e, idx) => (
                  <div key={`${e.createdAt}-${idx}`} className="p-3 text-xs">
                    <div className="flex justify-between mb-1">
                      <span className="text-red-400 font-mono">{e.tool || "unknown"}</span>
                      <span className="text-gray-600">
                        {new Date(e.createdAt).toLocaleString("ko-KR")}
                      </span>
                    </div>
                    <p className="text-gray-400 truncate">{e.summary}</p>
                    <p className="text-gray-600 mt-1">user: {e.userId.slice(0, 8)}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {tab === "users" && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-800">
                <th className="pb-2 pr-4">Email</th>
                <th className="pb-2 pr-4">Name</th>
                <th className="pb-2 pr-4">Role</th>
                <th className="pb-2 pr-4">Plan</th>
                <th className="pb-2 pr-4">Messages</th>
                <th className="pb-2 pr-4">Chats</th>
                <th className="pb-2 pr-4">Joined</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-gray-800/50">
                  <td className="py-3 pr-4 text-gray-300">{u.email}</td>
                  <td className="py-3 pr-4 text-gray-400">{u.name || "-"}</td>
                  <td className="py-3 pr-4">
                    <select
                      value={u.role}
                      onChange={(e) => updateUser(u.id, { role: e.target.value })}
                      className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs"
                    >
                      <option value="USER">USER</option>
                      <option value="ADMIN">ADMIN</option>
                    </select>
                  </td>
                  <td className="py-3 pr-4">
                    <select
                      value={u.plan}
                      onChange={(e) => updateUser(u.id, { plan: e.target.value })}
                      className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs"
                    >
                      <option value="FREE">FREE</option>
                      <option value="PRO">PRO</option>
                      <option value="ENTERPRISE">ENTERPRISE</option>
                    </select>
                  </td>
                  <td className="py-3 pr-4 text-gray-400">{u.messageCount}</td>
                  <td className="py-3 pr-4 text-gray-400">{u._count.conversations}</td>
                  <td className="py-3 pr-4 text-gray-500 text-xs">
                    {new Date(u.createdAt).toLocaleDateString("ko-KR")}
                  </td>
                  <td className="py-3">
                    {u.role !== "ADMIN" && (
                      <button
                        type="button"
                        onClick={() => deleteUser(u.id, u.email)}
                        className="text-red-500 hover:text-red-400 text-xs"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-semibold mt-1">{value}</p>
    </div>
  );
}

function errMsg(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  return String(reason);
}

export default function AdminPage() {
  return (
    <AuthGuard>
      <AdminDashboard />
    </AuthGuard>
  );
}
