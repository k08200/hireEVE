"use client";

import { useEffect, useState } from "react";
import { useConfirm } from "../../components/confirm-dialog";
import { Markdown } from "../../components/markdown";
import { ListSkeleton } from "../../components/skeleton";
import { useToast } from "../../components/toast";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Note {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
}

export default function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Note | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const { toast } = useToast();
  const { confirm } = useConfirm();

  const loadNotes = () => {
    const params = new URLSearchParams({ userId: "demo-user" });
    if (search) params.set("search", search);

    fetch(`${API_BASE}/api/notes?${params}`)
      .then((r) => r.json())
      .then((data) => setNotes(data.notes || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadNotes();
  }, [search]);

  const startEdit = (note: Note) => {
    setEditing(note);
    setEditTitle(note.title);
    setEditContent(note.content);
    setPreviewing(false);
  };

  const saveNote = async () => {
    if (!editing) return;
    await fetch(`${API_BASE}/api/notes/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: editTitle, content: editContent }),
    });
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
      title: "Delete Note / 메모 삭제",
      message: "Are you sure? This cannot be undone. / 정말 삭제하시겠습니까?",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    await fetch(`${API_BASE}/api/notes/${noteId}`, { method: "DELETE" });
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
    toast("Note deleted", "info");
  };

  const createNote = async () => {
    const res = await fetch(`${API_BASE}/api/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "demo-user", title: "New Note", content: "" }),
    });
    const note = await res.json();
    startEdit(note);
    loadNotes();
  };

  return (
    <main className="max-w-3xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Notes</h1>
          <p className="text-gray-400 text-sm mt-1">Quick memos — ask EVE to take notes in chat</p>
        </div>
        <button
          onClick={createNote}
          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
        >
          + New Note
        </button>
      </div>

      <div className="mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search notes... / 메모 검색..."
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition placeholder-gray-500"
        />
      </div>

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-lg">
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm font-medium mb-3 focus:outline-none focus:border-blue-500"
              placeholder="Title"
            />
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
            {previewing ? (
              <div className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-sm min-h-[15rem] max-h-[20rem] overflow-y-auto mb-4">
                {editContent ? (
                  <Markdown content={editContent} />
                ) : (
                  <p className="text-gray-500 italic">
                    Nothing to preview / 미리볼 내용이 없습니다
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
                onClick={() => setEditing(null)}
                className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white transition"
              >
                Cancel
              </button>
              <button
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
            Tell EVE: &quot;메모 해줘&quot; or click + New Note
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {notes.map((note) => (
            <div
              key={note.id}
              className="bg-gray-900 border border-gray-800 rounded-lg p-4 cursor-pointer hover:border-gray-600 transition group"
              onClick={() => startEdit(note)}
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-medium text-sm truncate flex-1">{note.title}</h3>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteNote(note.id);
                  }}
                  className="text-gray-600 hover:text-red-400 text-sm transition shrink-0 ml-2 opacity-0 group-hover:opacity-100"
                >
                  ✕
                </button>
              </div>
              <p className="text-xs text-gray-400 line-clamp-3">{note.content || "Empty note"}</p>
              <p className="text-xs text-gray-600 mt-2">
                {new Date(note.updatedAt).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
