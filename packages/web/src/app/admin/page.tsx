"use client";

import { useEffect, useState } from "react";
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

export default function AdminPage() {
  const { user, token } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    if (!token) return;
    Promise.all([
      apiFetch<{ users: UserRow[] }>("/api/admin/users", { headers }),
      apiFetch<Stats>("/api/admin/stats", { headers }),
    ])
      .then(([usersData, statsData]) => {
        setUsers(usersData.users);
        setStats(statsData);
      })
      .catch((err) => {
        toast(err instanceof Error ? err.message : "Failed to load", "error");
      })
      .finally(() => setLoading(false));
  }, [token]);

  const updateUser = async (id: string, data: { plan?: string; role?: string }) => {
    try {
      const updated = await apiFetch<UserRow>(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(data),
      });
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...updated } : u)));
      toast("Updated", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed", "error");
    }
  };

  const deleteUser = async (id: string, email: string) => {
    if (!confirm(`Delete ${email} and all their data?`)) return;
    try {
      await apiFetch(`/api/admin/users/${id}`, { method: "DELETE", headers });
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

  if (user?.plan !== "ENTERPRISE") {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        Admin access required
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <h1 className="text-xl font-bold">Admin Dashboard</h1>

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

      {/* Users Table */}
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
                    <option value="TEAM">TEAM</option>
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
