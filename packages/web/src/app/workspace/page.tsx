"use client";

import { useEffect, useState } from "react";
import AuthGuard from "../../components/auth-guard";
import { useToast } from "../../components/toast";
import { apiFetch } from "../../lib/api";

interface Workspace {
  id: string;
  name: string;
  slug: string;
  role: string;
  memberCount: number;
  plan: string;
}

interface Member {
  id: string;
  userId: string;
  name: string | null;
  email: string;
  role: string;
  joinedAt: string;
}

export default function WorkspacePage() {
  return (
    <AuthGuard>
      <WorkspaceContent />
    </AuthGuard>
  );
}

function WorkspaceContent() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const { toast } = useToast();

  const loadWorkspaces = async () => {
    try {
      const data = await apiFetch<{ workspaces: Workspace[] }>("/api/workspaces");
      setWorkspaces(data.workspaces);
      if (data.workspaces.length > 0 && !selectedId) {
        setSelectedId(data.workspaces[0].id);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const loadMembers = async (wsId: string) => {
    try {
      const data = await apiFetch<{ members: Member[] }>(`/api/workspaces/${wsId}/members`);
      setMembers(data.members);
    } catch {
      setMembers([]);
    }
  };

  useEffect(() => {
    loadWorkspaces();
  }, []);

  useEffect(() => {
    if (selectedId) loadMembers(selectedId);
  }, [selectedId]);

  const createWorkspace = async () => {
    if (!newName.trim()) return;
    try {
      const ws = await apiFetch<Workspace>("/api/workspaces", {
        method: "POST",
        body: JSON.stringify({ name: newName.trim() }),
      });
      setWorkspaces((prev) => [...prev, { ...ws, memberCount: 1, plan: "FREE" }]);
      setSelectedId(ws.id);
      setNewName("");
      setCreating(false);
      toast("Workspace created", "success");
    } catch {
      toast("Failed to create workspace", "error");
    }
  };

  const inviteMember = async () => {
    if (!inviteEmail.trim() || !selectedId) return;
    try {
      await apiFetch(`/api/workspaces/${selectedId}/invite`, {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail.trim() }),
      });
      setInviteEmail("");
      loadMembers(selectedId);
      toast("Member invited", "success");
    } catch (err) {
      toast(
        err instanceof Error ? err.message.replace("API 404: ", "") : "Failed to invite",
        "error",
      );
    }
  };

  const removeMember = async (memberId: string) => {
    if (!selectedId) return;
    try {
      await apiFetch(`/api/workspaces/${selectedId}/members/${memberId}`, {
        method: "DELETE",
      });
      loadMembers(selectedId);
      toast("Member removed", "success");
    } catch {
      toast("Failed to remove member", "error");
    }
  };

  const deleteWorkspace = async () => {
    if (!selectedId) return;
    try {
      await apiFetch(`/api/workspaces/${selectedId}`, { method: "DELETE" });
      setWorkspaces((prev) => prev.filter((w) => w.id !== selectedId));
      setSelectedId(workspaces.length > 1 ? workspaces[0].id : null);
      setMembers([]);
      toast("Workspace deleted", "success");
    } catch {
      toast("Failed to delete workspace", "error");
    }
  };

  const selected = workspaces.find((w) => w.id === selectedId);

  if (loading) {
    return (
      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-800 rounded w-48" />
          <div className="h-4 bg-gray-800 rounded w-72" />
          <div className="h-40 bg-gray-800/60 rounded-xl" />
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-4xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Workspaces</h1>
          <p className="text-gray-400 text-sm mt-1">
            Manage team workspaces
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition"
        >
          New Workspace
        </button>
      </div>

      {/* Create dialog */}
      {creating && (
        <div className="bg-gray-900/80 border border-gray-800/60 rounded-xl p-4 mb-6">
          <h3 className="text-sm font-medium mb-3">Create Workspace</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Workspace name..."
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              onKeyDown={(e) => e.key === "Enter" && createWorkspace()}
            />
            <button
              type="button"
              onClick={createWorkspace}
              className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => {
                setCreating(false);
                setNewName("");
              }}
              className="text-sm text-gray-400 hover:text-white px-3 py-2 rounded-lg transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {workspaces.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-gray-500 mb-4">No workspaces yet</p>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="text-sm text-blue-400 hover:text-blue-300 transition"
          >
            Create your first workspace
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Workspace list */}
          <div className="space-y-2">
            {workspaces.map((ws) => (
              <button
                type="button"
                key={ws.id}
                onClick={() => setSelectedId(ws.id)}
                className={`w-full text-left p-3 rounded-xl border transition ${
                  selectedId === ws.id
                    ? "bg-blue-500/10 border-blue-500/30 text-white"
                    : "bg-gray-900/80 border-gray-800/60 text-gray-300 hover:bg-gray-800/60"
                }`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-sm">{ws.name}</h3>
                  <span className="text-[10px] bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded uppercase">
                    {ws.role}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                  <span>
                    {ws.memberCount} member{ws.memberCount !== 1 ? "s" : ""}
                  </span>
                  <span>{ws.plan}</span>
                </div>
              </button>
            ))}
          </div>

          {/* Selected workspace details */}
          {selected && (
            <div className="lg:col-span-2 space-y-6">
              {/* Info card */}
              <div className="bg-gray-900/80 border border-gray-800/60 rounded-xl p-5">
                <h2 className="text-lg font-semibold">{selected.name}</h2>
                <p className="text-xs text-gray-500 mt-1">
                  Slug: {selected.slug} &middot; Plan: {selected.plan}
                </p>
              </div>

              {/* Members */}
              <div className="bg-gray-900/80 border border-gray-800/60 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-medium text-sm">Members ({members.length})</h3>
                </div>

                {/* Invite */}
                {(selected.role === "OWNER" || selected.role === "ADMIN") && (
                  <div className="flex gap-2 mb-4">
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="Invite by email..."
                      className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                      onKeyDown={(e) => e.key === "Enter" && inviteMember()}
                    />
                    <button
                      type="button"
                      onClick={inviteMember}
                      className="text-sm bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 px-4 py-2 rounded-lg transition"
                    >
                      Invite
                    </button>
                  </div>
                )}

                <div className="space-y-2">
                  {members.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between py-2 border-b border-gray-800/40 last:border-0"
                    >
                      <div>
                        <p className="text-sm font-medium">{m.name || m.email}</p>
                        <p className="text-xs text-gray-500">{m.email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded uppercase">
                          {m.role}
                        </span>
                        {m.role !== "OWNER" &&
                          (selected.role === "OWNER" || selected.role === "ADMIN") && (
                            <button
                              type="button"
                              onClick={() => removeMember(m.id)}
                              className="text-xs text-red-400/60 hover:text-red-400 transition"
                            >
                              Remove
                            </button>
                          )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Danger zone */}
              {selected.role === "OWNER" && (
                <div className="bg-gray-900/80 border border-red-900/30 rounded-xl p-5">
                  <h3 className="text-sm font-medium text-red-400 mb-2">Danger Zone</h3>
                  <p className="text-xs text-gray-500 mb-3">
                    Deleting a workspace removes all members. This cannot be undone.
                  </p>
                  <button
                    type="button"
                    onClick={deleteWorkspace}
                    className="text-xs bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-600/30 px-3 py-1.5 rounded-lg transition"
                  >
                    Delete Workspace
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
