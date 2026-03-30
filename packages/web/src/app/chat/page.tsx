"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import AuthGuard from "../../components/auth-guard";
import { useConfirm } from "../../components/confirm-dialog";
import { RelativeTime } from "../../components/relative-time";
import { ListSkeleton } from "../../components/skeleton";
import { useToast } from "../../components/toast";
import { API_BASE, apiFetch, authHeaders } from "../../lib/api";

interface Conversation {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  messages: { content: string }[];
  _count: { messages: number };
}

export default function ChatListPage() {
  return (
    <AuthGuard>
      <Suspense>
        <ChatListContent />
      </Suspense>
    </AuthGuard>
  );
}

function ChatListContent() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "messages">("recent");
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const prefillHandled = useRef(false);

  // Handle ?prefill= parameter (from Email "Ask EVE to Reply" etc.)
  useEffect(() => {
    if (prefillHandled.current) return;
    const prefill = searchParams.get("prefill");
    if (!prefill) return;
    prefillHandled.current = true;

    (async () => {
      try {
        const conv = await apiFetch<{ id: string }>("/api/chat/conversations", {
          method: "POST",
          body: JSON.stringify({}),
        });
        // Navigate to the conversation — the prefill text will be sent as the first message
        router.push(`/chat/${conv.id}?prefill=${encodeURIComponent(prefill)}`);
      } catch {
        toast("Failed to create conversation", "error");
      }
    })();
  }, [searchParams, router, toast]);

  // Load pinned conversations from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("eve-pinned-chats");
      if (stored) setPinnedIds(new Set(JSON.parse(stored)));
    } catch {
      // ignore
    }
  }, []);

  const togglePin = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        toast("Unpinned", "info");
      } else {
        next.add(id);
        toast("Pinned to top", "success");
      }
      localStorage.setItem("eve-pinned-chats", JSON.stringify([...next]));
      return next;
    });
  };

  useEffect(() => {
    apiFetch<{ conversations: Conversation[] }>("/api/chat/conversations")
      .then((data) => setConversations(data.conversations))
      .catch(() => {})
      .finally(() => setLoading(false));

    fetch(`${API_BASE}/api/auth/google/status`)
      .then((r) => r.json())
      .then((data) => setGmailConnected(data.connected))
      .catch(() => {});
  }, [API_BASE]);

  const createConversation = async () => {
    try {
      const conv = await apiFetch<Conversation>("/api/chat/conversations", {
        method: "POST",
        body: JSON.stringify({}),
      });
      router.push(`/chat/${conv.id}`);
    } catch (err) {
      toast(`Failed to create chat: ${err instanceof Error ? err.message : "Unknown error"}`, "error");
    }
  };

  const deleteConversation = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      const ok = await confirm({
        title: "Delete Conversation / 대화 삭제",
        message: "All messages will be lost. / 모든 메시지가 삭제됩니다.",
        confirmLabel: "Delete",
        danger: true,
      });
      if (!ok) return;
      await fetch(`${API_BASE}/api/chat/conversations/${id}`, { method: "DELETE", headers: authHeaders() });
      setConversations((prev) => prev.filter((c) => c.id !== id));
      toast("Conversation deleted", "info");
    } catch (err) {
      toast(`Delete failed: ${err instanceof Error ? err.message : "Unknown error"}`, "error");
    }
  };

  const startRename = (e: React.MouseEvent, conv: Conversation) => {
    e.stopPropagation();
    setEditingId(conv.id);
    setEditTitle(conv.title || "");
  };

  const saveRename = async (e: React.FormEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    await fetch(`${API_BASE}/api/chat/conversations/${id}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ title: editTitle }),
    });
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title: editTitle } : c)));
    setEditingId(null);
  };

  return (
    <main className="max-w-3xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Conversations</h1>
          <p className="text-gray-400 text-sm mt-1">Your chats with EVE</p>
        </div>
        <div className="flex gap-2">
          {!gmailConnected ? (
            <a
              href={`${API_BASE}/api/auth/google`}
              className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition border border-gray-700"
            >
              Connect Google
            </a>
          ) : (
            <span className="flex items-center text-sm text-green-400 px-3">Google connected</span>
          )}
          <button
            onClick={createConversation}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
          >
            + New chat
          </button>
        </div>
      </div>

      {/* Search & Sort */}
      {conversations.length > 0 && (
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations... / 대화 검색..."
            className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition placeholder-gray-500"
          />
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setSortBy("recent")}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition ${sortBy === "recent" ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"}`}
              title="Sort by recent / 최신순"
            >
              Recent
            </button>
            <button
              type="button"
              onClick={() => setSortBy("messages")}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition ${sortBy === "messages" ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"}`}
              title="Sort by message count / 메시지 수"
            >
              Most
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <ListSkeleton count={3} />
      ) : conversations.length === 0 ? (
        <div className="py-12">
          <div className="text-center mb-10">
            <div className="text-4xl mb-3">👋</div>
            <h2 className="text-xl font-bold mb-2">Welcome to EVE / EVE에 오신 걸 환영합니다</h2>
            <p className="text-gray-400 text-sm max-w-md mx-auto">
              Your AI employee is ready. Here&apos;s what EVE can do for you.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8 max-w-lg mx-auto">
            {[
              { icon: "📧", label: "Email", desc: "Read, send, classify" },
              { icon: "📅", label: "Calendar", desc: "Events, conflicts" },
              { icon: "✅", label: "Tasks", desc: "Create, track, remind" },
              { icon: "📝", label: "Notes", desc: "Memos, reports" },
              { icon: "👤", label: "Contacts", desc: "CRM, tags" },
              { icon: "🔍", label: "Web Search", desc: "Research anything" },
            ].map((f) => (
              <div
                key={f.label}
                className="bg-gray-900 border border-gray-800 rounded-lg p-3 flex items-center gap-3"
              >
                <span className="text-xl">{f.icon}</span>
                <div>
                  <p className="text-sm font-medium">{f.label}</p>
                  <p className="text-xs text-gray-500">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="text-center">
            <button
              type="button"
              onClick={createConversation}
              className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-lg font-medium transition"
            >
              Start chatting with EVE / EVE와 대화 시작
            </button>
            <p className="text-gray-600 text-xs mt-3">Cmd+N to start anytime</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {conversations
            .filter((c) => {
              if (!search) return true;
              const q = search.toLowerCase();
              return (
                (c.title || "").toLowerCase().includes(q) ||
                (c.messages[0]?.content || "").toLowerCase().includes(q)
              );
            })
            .sort((a, b) => {
              const aPinned = pinnedIds.has(a.id) ? 1 : 0;
              const bPinned = pinnedIds.has(b.id) ? 1 : 0;
              if (aPinned !== bPinned) return bPinned - aPinned;
              if (sortBy === "messages") return b._count.messages - a._count.messages;
              return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
            })
            .map((conv) => (
              <div
                key={conv.id}
                onClick={() => !editingId && router.push(`/chat/${conv.id}`)}
                className="w-full text-left bg-gray-900 border border-gray-800 hover:border-gray-600 rounded-lg p-4 transition cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  {editingId === conv.id ? (
                    <form
                      onSubmit={(e) => saveRename(e, conv.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 mr-2"
                    >
                      <input
                        autoFocus
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onBlur={() => setEditingId(null)}
                        className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm w-full focus:outline-none focus:border-blue-500"
                      />
                    </form>
                  ) : (
                    <span className="font-medium truncate flex-1">
                      {conv.title || "New conversation"}
                    </span>
                  )}
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-xs text-gray-500 mr-1">
                      {conv._count.messages} messages
                    </span>
                    <span
                      onClick={(e) => togglePin(e, conv.id)}
                      className={`text-xs px-1 transition cursor-pointer ${pinnedIds.has(conv.id) ? "text-yellow-400" : "text-gray-600 hover:text-yellow-400"}`}
                      title={pinnedIds.has(conv.id) ? "Unpin" : "Pin to top"}
                    >
                      {pinnedIds.has(conv.id) ? "★" : "☆"}
                    </span>
                    <span
                      onClick={(e) => startRename(e, conv)}
                      className="text-gray-600 hover:text-blue-400 text-xs px-1 transition cursor-pointer"
                      title="Rename"
                    >
                      ✎
                    </span>
                    <span
                      onClick={(e) => deleteConversation(e, conv.id)}
                      className="text-gray-600 hover:text-red-400 text-sm px-1 transition cursor-pointer"
                      title="Delete"
                    >
                      ✕
                    </span>
                  </div>
                </div>
                {conv.messages[0] && editingId !== conv.id && (
                  <p className="text-sm text-gray-400 mt-1 truncate">{conv.messages[0].content}</p>
                )}
                <RelativeTime date={conv.updatedAt} className="text-xs text-gray-600 mt-2 block" />
              </div>
            ))}
        </div>
      )}
    </main>
  );
}
