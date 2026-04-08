"use client";

import { useCallback, useEffect, useState } from "react";
import AuthGuard from "../../components/auth-guard";
import { useConfirm } from "../../components/confirm-dialog";
import { Markdown } from "../../components/markdown";
import { RelativeTime } from "../../components/relative-time";
import { ListSkeleton } from "../../components/skeleton";
import { useToast } from "../../components/toast";
import { API_BASE, apiFetch, authHeaders } from "../../lib/api";

interface Note {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
  category?: string;
}

const CATEGORIES = [
  { key: "all", label: "All", color: "" },
  { key: "general", label: "General", color: "bg-gray-600" },
  { key: "work", label: "Work", color: "bg-blue-600" },
  { key: "idea", label: "Idea", color: "bg-purple-600" },
  { key: "meeting", label: "Meeting", color: "bg-green-600" },
  { key: "personal", label: "Personal", color: "bg-yellow-600" },
];

const CATEGORY_COLORS: Record<string, string> = {
  general: "bg-gray-600",
  work: "bg-blue-600",
  idea: "bg-purple-600",
  meeting: "bg-green-600",
  personal: "bg-yellow-600",
};

export default function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Note | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editCategory, setEditCategory] = useState("general");
  const [previewing, setPreviewing] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const { toast } = useToast();
  const { confirm } = useConfirm();

  const loadNotes = useCallback(() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);

    apiFetch<{ notes: Note[] }>(`/api/notes?${params}`)
      .then((data) => setNotes(data.notes || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [search]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const startEdit = (note: Note) => {
    setEditing(note);
    setEditTitle(note.title);
    setEditContent(note.content);
    setEditCategory(note.category || "general");
    setPreviewing(false);
  };

  const saveNote = async () => {
    if (!editing) return;
    const res = await fetch(`${API_BASE}/api/notes/${editing.id}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ title: editTitle, content: editContent, category: editCategory }),
    });
    if (!res.ok) {
      toast("Failed to save note", "error");
      return;
    }
    setEditing(null);
    loadNotes();
    toast("Note saved", "success");
  };

  // Escape key closes modal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && editing) setEditing(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editing]);

  const deleteNote = async (noteId: string) => {
    const ok = await confirm({
      title: "Delete Note",
      message: "Are you sure? This cannot be undone.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    await fetch(`${API_BASE}/api/notes/${noteId}`, { method: "DELETE", headers: authHeaders() });
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
    toast("Note deleted", "info");
  };

  const createNote = async () => {
    const res = await fetch(`${API_BASE}/api/notes`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ title: "New Note", content: "" }),
    });
    const note = await res.json();
    startEdit(note);
    loadNotes();
  };

  return (
    <AuthGuard>
      <main className="max-w-3xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Notes</h1>
            <p className="text-gray-400 text-sm mt-1">
              Quick memos — ask EVE to take notes in chat
            </p>
          </div>
          <button
            type="button"
            onClick={createNote}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
          >
            + New Note
          </button>
        </div>

        <div className="mb-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notes..."
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition placeholder-gray-500"
          />
        </div>

        {/* Category filter */}
        <div className="flex gap-1 mb-6">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              type="button"
              onClick={() => setCategoryFilter(cat.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                categoryFilter === cat.key
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:text-white"
              }`}
            >
              {cat.color && <span className={`w-2 h-2 rounded-full ${cat.color}`} />}
              {cat.label}
            </button>
          ))}
        </div>

        {/* Edit modal */}
        {editing && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-slide-up px-4">
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-lg">
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm font-medium mb-3 focus:outline-none focus:border-blue-500"
                placeholder="Title"
              />
              {/* Category selector */}
              <div className="flex gap-1 mb-3">
                {CATEGORIES.filter((c) => c.key !== "all").map((cat) => (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => setEditCategory(cat.key)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition ${
                      editCategory === cat.key
                        ? "bg-gray-700 text-white"
                        : "text-gray-500 hover:text-gray-300"
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${cat.color}`} />
                    {cat.label}
                  </button>
                ))}
              </div>
              {/* Edit / Preview toggle */}
              <div className="flex gap-1 mb-2">
                <button
                  type="button"
                  onClick={() => setPreviewing(false)}
                  className={`px-3 py-1 rounded text-xs font-medium transition ${!previewing ? "bg-gray-700 text-white" : "text-gray-500 hover:text-gray-300"}`}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewing(true)}
                  className={`px-3 py-1 rounded text-xs font-medium transition ${previewing ? "bg-gray-700 text-white" : "text-gray-500 hover:text-gray-300"}`}
                >
                  Preview
                </button>
              </div>
              <div className="flex justify-between text-[10px] text-gray-600 mb-1 px-1">
                <span>{editContent.trim() ? editContent.trim().split(/\s+/).length : 0} words</span>
                <span>{editContent.length.toLocaleString()} chars</span>
              </div>
              {previewing ? (
                <div className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-sm min-h-[15rem] max-h-[20rem] overflow-y-auto mb-4">
                  {editContent ? (
                    <Markdown content={editContent} />
                  ) : (
                    <p className="text-gray-500 italic">
                      Nothing to preview
                    </p>
                  )}
                </div>
              ) : (
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={10}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-sm resize-none mb-4 focus:outline-none focus:border-blue-500 font-mono"
                  placeholder="Write your note... (supports **bold**, *italic*, `code`, ```code blocks```)"
                />
              )}
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveNote}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ListSkeleton count={4} />
          </div>
        ) : notes.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-500 mb-2">No notes yet</p>
            <p className="text-gray-600 text-sm">
              Ask EVE to take a note, or click + New Note
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {notes
              .filter((note) => {
                if (categoryFilter === "all") return true;
                return (note.category || "general") === categoryFilter;
              })
              .map((note) => {
                const cat = note.category || "general";
                return (
                  <button
                    type="button"
                    key={note.id}
                    className="w-full text-left bg-gray-900/80 border border-gray-800/60 rounded-xl p-4 cursor-pointer hover:border-gray-600 transition group"
                    onClick={() => startEdit(note)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {CATEGORY_COLORS[cat] && (
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${CATEGORY_COLORS[cat]}`}
                          />
                        )}
                        <h3 className="font-medium text-sm truncate">{note.title}</h3>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteNote(note.id);
                        }}
                        className="text-gray-600 hover:text-red-400 text-sm transition shrink-0 ml-2 opacity-0 group-hover:opacity-100"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="text-xs text-gray-400 line-clamp-3">
                      {note.content ? (
                        <Markdown content={note.content.slice(0, 200)} />
                      ) : (
                        <span className="italic text-gray-500">Empty note</span>
                      )}
                    </div>
                    <RelativeTime
                      date={note.updatedAt}
                      className="text-xs text-gray-600 mt-2 block"
                    />
                  </button>
                );
              })}
          </div>
        )}
      </main>
    </AuthGuard>
  );
}
