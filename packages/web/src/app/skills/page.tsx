"use client";

import { useCallback, useEffect, useState } from "react";
import AuthGuard from "../../components/auth-guard";
import { useConfirm } from "../../components/confirm-dialog";
import { ListSkeleton } from "../../components/skeleton";
import { useToast } from "../../components/toast";
import { apiFetch } from "../../lib/api";

interface Skill {
  id: string;
  name: string;
  description: string;
  prompt: string;
  updatedAt: string;
}

function extractVariables(prompt: string): string[] {
  const matches = prompt.match(/\{\{(\w+)\}\}/g);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.slice(2, -2)))];
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", prompt: "" });
  const [editing, setEditing] = useState<Skill | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { toast } = useToast();
  const { confirm } = useConfirm();

  const loadSkills = useCallback(() => {
    apiFetch<{ skills: Skill[] }>("/api/skills")
      .then((data) => setSkills(data.skills || []))
      .catch(() => toast("Failed to load skills", "error"))
      .finally(() => setLoading(false));
  }, [toast]);

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  const handleCreate = async () => {
    if (!form.name.trim() || !form.prompt.trim()) {
      toast("Name and prompt are required", "error");
      return;
    }
    try {
      await apiFetch("/api/skills", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setForm({ name: "", description: "", prompt: "" });
      setShowForm(false);
      loadSkills();
      toast("Skill created", "success");
    } catch {
      toast("Failed to create skill", "error");
    }
  };

  const handleUpdate = async () => {
    if (!editing) return;
    try {
      // Delete old, create new (API uses memory upsert by key)
      await apiFetch(`/api/skills/${editing.id}`, { method: "DELETE" });
      await apiFetch("/api/skills", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setEditing(null);
      setForm({ name: "", description: "", prompt: "" });
      setShowForm(false);
      loadSkills();
      toast("Skill updated", "success");
    } catch {
      toast("Failed to update skill", "error");
    }
  };

  const handleDelete = async (skill: Skill) => {
    const ok = await confirm({
      title: "Delete Skill",
      message: `Delete "${skill.name}"? This cannot be undone.`,
    });
    if (!ok) return;
    try {
      await apiFetch(`/api/skills/${skill.id}`, { method: "DELETE" });
      loadSkills();
      toast("Skill deleted", "success");
    } catch {
      toast("Failed to delete skill", "error");
    }
  };

  const startEdit = (skill: Skill) => {
    setEditing(skill);
    setForm({
      name: skill.name,
      description: skill.description,
      prompt: skill.prompt,
    });
    setShowForm(true);
  };

  const cancelForm = () => {
    setEditing(null);
    setForm({ name: "", description: "", prompt: "" });
    setShowForm(false);
  };

  const variables = extractVariables(form.prompt);

  return (
    <AuthGuard>
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-white">Skills</h1>
            <p className="text-sm text-gray-500 mt-1">Reusable workflows EVE can run for you</p>
          </div>
          {!showForm && (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-white/10 text-white hover:bg-white/15 transition"
            >
              + New Skill
            </button>
          )}
        </div>

        {/* Create / Edit Form */}
        {showForm && (
          <div className="mb-6 p-4 rounded-xl bg-gray-900 border border-gray-800">
            <h2 className="text-sm font-medium text-gray-300 mb-3">
              {editing ? "Edit Skill" : "New Skill"}
            </h2>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Skill name (e.g. Weekly Report)"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-gray-600"
              />
              <input
                type="text"
                placeholder="Description (optional)"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-gray-600"
              />
              <textarea
                placeholder={
                  "Prompt template — use {{variable}} for dynamic values\n\nExample: Summarize tasks for {{week}} and send to {{recipient}}"
                }
                value={form.prompt}
                onChange={(e) => setForm({ ...form, prompt: e.target.value })}
                rows={5}
                className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-gray-600 resize-none"
              />
              {variables.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {variables.map((v) => (
                    <span
                      key={v}
                      className="px-2 py-0.5 text-xs rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20"
                    >
                      {`{{${v}}}`}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={editing ? handleUpdate : handleCreate}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-white text-black hover:bg-gray-200 transition"
                >
                  {editing ? "Update" : "Create"}
                </button>
                <button
                  type="button"
                  onClick={cancelForm}
                  className="px-4 py-2 text-sm font-medium rounded-lg text-gray-400 hover:text-white transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Skills List */}
        {loading ? (
          <ListSkeleton />
        ) : skills.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="text-lg mb-1">No skills yet</p>
            <p className="text-sm">
              Create a skill to save a reusable workflow. EVE can run it anytime.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {skills.map((skill) => {
              const vars = extractVariables(skill.prompt);
              const isExpanded = expandedId === skill.id;
              return (
                <div
                  key={skill.id}
                  className="p-4 rounded-xl bg-gray-900 border border-gray-800 hover:border-gray-700 transition"
                >
                  <div className="flex items-start justify-between">
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : skill.id)}
                      className="text-left flex-1 min-w-0"
                    >
                      <h3 className="text-sm font-medium text-white truncate">{skill.name}</h3>
                      {skill.description && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate">{skill.description}</p>
                      )}
                      {vars.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {vars.map((v) => (
                            <span
                              key={v}
                              className="px-1.5 py-0.5 text-[10px] rounded-full bg-gray-800 text-gray-400 border border-gray-700"
                            >
                              {v}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                    <div className="flex gap-1 ml-3 shrink-0">
                      <button
                        type="button"
                        onClick={() => startEdit(skill)}
                        className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition"
                        title="Edit"
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(skill)}
                        className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-gray-800 transition"
                        title="Delete"
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  {isExpanded && (
                    <pre className="mt-3 p-3 text-xs text-gray-400 bg-gray-800/50 rounded-lg overflow-x-auto whitespace-pre-wrap">
                      {skill.prompt}
                    </pre>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
