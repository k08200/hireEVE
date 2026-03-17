"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";

interface Conversation {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  messages: { content: string }[];
  _count: { messages: number };
}

export default function ChatListPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [gmailConnected, setGmailConnected] = useState(false);
  const router = useRouter();

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  useEffect(() => {
    apiFetch<{ conversations: Conversation[] }>("/api/chat/conversations?userId=demo-user")
      .then((data) => setConversations(data.conversations))
      .catch(() => {})
      .finally(() => setLoading(false));

    fetch(`${API_BASE}/api/auth/google/status`)
      .then((r) => r.json())
      .then((data) => setGmailConnected(data.connected))
      .catch(() => {});
  }, [API_BASE]);

  const createConversation = async () => {
    const conv = await apiFetch<Conversation>("/api/chat/conversations", {
      method: "POST",
      body: JSON.stringify({ userId: "demo-user" }),
    });
    router.push(`/chat/${conv.id}`);
  };

  const deleteConversation = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await fetch(`${API_BASE}/api/chat/conversations/${id}`, { method: "DELETE" });
    setConversations((prev) => prev.filter((c) => c.id !== id));
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
              Connect Gmail
            </a>
          ) : (
            <span className="flex items-center text-sm text-green-400 px-3">Gmail connected</span>
          )}
          <button
            onClick={createConversation}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
          >
            + New chat
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : conversations.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-gray-500 mb-4">No conversations yet</p>
          <button
            onClick={createConversation}
            className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-lg font-medium transition"
          >
            Start chatting with EVE
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => router.push(`/chat/${conv.id}`)}
              className="w-full text-left bg-gray-900 border border-gray-800 hover:border-gray-600 rounded-lg p-4 transition"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{conv.title || "New conversation"}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">{conv._count.messages} messages</span>
                  <span
                    onClick={(e) => deleteConversation(e, conv.id)}
                    className="text-gray-600 hover:text-red-400 text-sm px-1 transition"
                  >
                    ✕
                  </span>
                </div>
              </div>
              {conv.messages[0] && (
                <p className="text-sm text-gray-400 mt-1 truncate">{conv.messages[0].content}</p>
              )}
              <p className="text-xs text-gray-600 mt-2">
                {new Date(conv.updatedAt).toLocaleString()}
              </p>
            </button>
          ))}
        </div>
      )}
    </main>
  );
}
