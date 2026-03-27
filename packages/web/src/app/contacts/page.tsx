"use client";

import { useEffect, useState } from "react";
import { useConfirm } from "../../components/confirm-dialog";
import { ListSkeleton } from "../../components/skeleton";
import { useToast } from "../../components/toast";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const TAG_COLORS = [
  "bg-blue-500/20 text-blue-400",
  "bg-green-500/20 text-green-400",
  "bg-purple-500/20 text-purple-400",
  "bg-yellow-500/20 text-yellow-400",
  "bg-pink-500/20 text-pink-400",
  "bg-cyan-500/20 text-cyan-400",
  "bg-orange-500/20 text-orange-400",
  "bg-red-500/20 text-red-400",
];

function tagColor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

const AVATAR_COLORS = [
  "bg-blue-600",
  "bg-green-600",
  "bg-purple-600",
  "bg-yellow-600",
  "bg-pink-600",
  "bg-cyan-600",
  "bg-orange-600",
  "bg-red-600",
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

interface Contact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  role: string | null;
  notes: string | null;
  tags: string | null;
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    role: "",
    notes: "",
    tags: "",
  });
  const [editing, setEditing] = useState<Contact | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    role: "",
    notes: "",
    tags: "",
  });

  const loadContacts = () => {
    const params = new URLSearchParams({ userId: "demo-user" });
    if (search) params.set("search", search);
    fetch(`${API_BASE}/api/contacts?${params}`)
      .then((r) => r.json())
      .then((d) => setContacts(d.contacts || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadContacts();
  }, [search]);

  const createContact = async () => {
    await fetch(`${API_BASE}/api/contacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "demo-user", ...form }),
    });
    setShowForm(false);
    setForm({ name: "", email: "", phone: "", company: "", role: "", notes: "", tags: "" });
    loadContacts();
    toast("Contact added", "success");
  };

  const startEdit = (c: Contact) => {
    setEditing(c);
    setEditForm({
      name: c.name,
      email: c.email || "",
      phone: c.phone || "",
      company: c.company || "",
      role: c.role || "",
      notes: c.notes || "",
      tags: c.tags || "",
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    await fetch(`${API_BASE}/api/contacts/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    setEditing(null);
    loadContacts();
    toast("Contact updated", "success");
  };

  // Escape key closes modals
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (editing) setEditing(null);
        else if (showForm) setShowForm(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editing, showForm]);

  // Collect all unique tags for filter bar
  const allTags = Array.from(
    new Set(
      contacts
        .flatMap((c) => (c.tags ? c.tags.split(",").map((t) => t.trim()) : []))
        .filter(Boolean),
    ),
  ).sort();

  const filteredContacts = tagFilter
    ? contacts.filter(
        (c) =>
          c.tags &&
          c.tags
            .split(",")
            .map((t) => t.trim())
            .includes(tagFilter),
      )
    : contacts;

  const deleteContact = async (id: string) => {
    const ok = await confirm({
      title: "Delete Contact / 연락처 삭제",
      message: "Are you sure? This cannot be undone. / 정말 삭제하시겠습니까?",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    await fetch(`${API_BASE}/api/contacts/${id}`, { method: "DELETE" });
    setContacts((prev) => prev.filter((c) => c.id !== id));
    toast("Contact deleted", "info");
  };

  return (
    <main className="max-w-3xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Contacts</h1>
          <p className="text-gray-400 text-sm mt-1">People in your network</p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
        >
          + Add Contact
        </button>
      </div>

      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search contacts... / 연락처 검색..."
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition placeholder-gray-500"
        />
      </div>

      {/* Tag filter bar */}
      {allTags.length > 0 && (
        <div className="flex gap-1 mb-6 flex-wrap">
          <button
            type="button"
            onClick={() => setTagFilter(null)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              tagFilter === null
                ? "bg-blue-600 text-white"
                : "bg-gray-800 text-gray-400 hover:text-white"
            }`}
          >
            All
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                tagFilter === tag
                  ? "bg-blue-600 text-white"
                  : `bg-gray-800 text-gray-400 hover:text-white`
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {showForm && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-6 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              placeholder="Name *"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
            <input
              placeholder="Email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
            <input
              placeholder="Phone"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
            <input
              placeholder="Company"
              value={form.company}
              onChange={(e) => setForm({ ...form, company: e.target.value })}
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
            <input
              placeholder="Role / Title"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
            <input
              placeholder="Tags (comma-separated)"
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <textarea
            placeholder="Notes"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm resize-none focus:outline-none focus:border-blue-500"
          />
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-3 py-1.5 text-sm text-gray-400 hover:text-white transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={createContact}
              disabled={!form.name}
              className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white px-4 py-1.5 rounded text-sm font-medium transition"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-lg">
            <h3 className="font-semibold mb-4">Edit Contact / 연락처 수정</h3>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <input
                placeholder="Name *"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              />
              <input
                placeholder="Email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              />
              <input
                placeholder="Phone"
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              />
              <input
                placeholder="Company"
                value={editForm.company}
                onChange={(e) => setEditForm({ ...editForm, company: e.target.value })}
                className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              />
              <input
                placeholder="Role / Title"
                value={editForm.role}
                onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              />
              <input
                placeholder="Tags (comma-separated)"
                value={editForm.tags}
                onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })}
                className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <textarea
              placeholder="Notes"
              value={editForm.notes}
              onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
              rows={2}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm resize-none focus:outline-none focus:border-blue-500 mb-4"
            />
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
                onClick={saveEdit}
                disabled={!editForm.name}
                className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <ListSkeleton count={4} />
      ) : contacts.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-gray-500 mb-2">No contacts yet</p>
          <p className="text-gray-600 text-sm">Tell EVE: &quot;연락처 저장해줘&quot;</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredContacts.map((c) => (
            <div
              key={c.id}
              className="bg-gray-900 border border-gray-800 rounded-lg p-4 group cursor-pointer hover:border-gray-600 transition"
              onClick={() => startEdit(c)}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`w-10 h-10 rounded-full ${avatarColor(c.name)} flex items-center justify-center text-white text-sm font-bold shrink-0`}
                >
                  {initials(c.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{c.name}</span>
                    {c.company && <span className="text-xs text-gray-500">@ {c.company}</span>}
                    {c.role && <span className="text-xs text-gray-600">{c.role}</span>}
                  </div>
                  <div className="flex gap-4 mt-1">
                    {c.email && <span className="text-xs text-gray-400">{c.email}</span>}
                    {c.phone && <span className="text-xs text-gray-400">{c.phone}</span>}
                  </div>
                  {c.notes && <p className="text-xs text-gray-500 mt-1 truncate">{c.notes}</p>}
                  {c.tags && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {c.tags.split(",").map((t) => (
                        <span
                          key={t.trim()}
                          className={`text-[10px] px-2 py-0.5 rounded-full ${tagColor(t.trim())}`}
                        >
                          {t.trim()}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteContact(c.id);
                  }}
                  className="text-gray-600 hover:text-red-400 text-sm transition shrink-0 opacity-0 group-hover:opacity-100"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
