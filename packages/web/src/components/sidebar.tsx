"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE, apiFetch, authHeaders } from "../lib/api";
import { useAuth } from "../lib/auth";

interface Conversation {
  id: string;
  title: string | null;
  updatedAt: string;
  _count: { messages: number };
}

interface DateGroup {
  label: string;
  items: Conversation[];
}

function groupByDate(convs: Conversation[]): DateGroup[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);
  const monthAgo = new Date(today.getTime() - 30 * 86400000);

  const groups: DateGroup[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Previous 7 Days", items: [] },
    { label: "Previous 30 Days", items: [] },
    { label: "Older", items: [] },
  ];

  for (const conv of convs) {
    const d = new Date(conv.updatedAt);
    if (d >= today) groups[0].items.push(conv);
    else if (d >= yesterday) groups[1].items.push(conv);
    else if (d >= weekAgo) groups[2].items.push(conv);
    else if (d >= monthAgo) groups[3].items.push(conv);
    else groups[4].items.push(conv);
  }

  return groups.filter((g) => g.items.length > 0);
}

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "grid" },
  { href: "/email", label: "Email", icon: "mail" },
  { href: "/tasks", label: "Tasks", icon: "check" },
  { href: "/calendar", label: "Calendar", icon: "calendar" },
  { href: "/notes", label: "Notes", icon: "file" },
  { href: "/contacts", label: "Contacts", icon: "user" },
  { href: "/reminders", label: "Reminders", icon: "bell" },
];

function NavIcon({ type, size = 16 }: { type: string; size?: number }) {
  const props = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (type) {
    case "grid":
      return (
        <svg {...props}>
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
        </svg>
      );
    case "mail":
      return (
        <svg {...props}>
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
          <polyline points="22,6 12,13 2,6" />
        </svg>
      );
    case "check":
      return (
        <svg {...props}>
          <polyline points="9 11 12 14 22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...props}>
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      );
    case "file":
      return (
        <svg {...props}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      );
    case "user":
      return (
        <svg {...props}>
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      );
    case "bell":
      return (
        <svg {...props}>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      );
    default:
      return null;
  }
}

export default function Sidebar({
  mobileOpen,
  onMobileClose,
}: {
  mobileOpen: boolean;
  onMobileClose: () => void;
}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(() => {
    apiFetch<{ conversations: Conversation[] }>("/api/chat/conversations")
      .then((data) => setConversations(data.conversations))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Reload conversations when navigating to a chat page (new chat created)
  useEffect(() => {
    if (pathname.startsWith("/chat")) {
      loadConversations();
    }
  }, [pathname, loadConversations]);

  // Close user menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const createChat = async () => {
    try {
      const conv = await apiFetch<{ id: string }>("/api/chat/conversations", {
        method: "POST",
        body: JSON.stringify({}),
      });
      router.push(`/chat/${conv.id}`);
      onMobileClose();
    } catch {
      // ignore
    }
  };

  const deleteConversation = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      await fetch(`${API_BASE}/api/chat/conversations/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (pathname === `/chat/${id}`) {
        router.push("/chat");
      }
    } catch {
      // ignore
    }
  };

  const startRename = (e: React.MouseEvent, conv: Conversation) => {
    e.stopPropagation();
    e.preventDefault();
    setEditingId(conv.id);
    setEditTitle(conv.title || "");
  };

  const saveRename = async (e: React.FormEvent, id: string) => {
    e.preventDefault();
    await fetch(`${API_BASE}/api/chat/conversations/${id}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ title: editTitle }),
    });
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title: editTitle } : c)));
    setEditingId(null);
  };

  const activeConvId = pathname.startsWith("/chat/") ? pathname.split("/chat/")[1] : null;
  const groups = groupByDate(
    [...conversations].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    ),
  );

  const initials = user
    ? (user.name || user.email)
        .split(/[\s@]/)
        .filter(Boolean)
        .slice(0, 2)
        .map((s) => s[0].toUpperCase())
        .join("")
    : "";

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#0a0a0f] border-r border-gray-800/40">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3">
        <Link
          href="/chat"
          className="text-sm font-semibold text-gray-200 hover:text-white transition pl-1"
          onClick={onMobileClose}
        >
          EVE
        </Link>
        <button
          type="button"
          onClick={createChat}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition"
          title="New chat"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {groups.map((group) => (
          <div key={group.label} className="mb-3">
            <p className="text-[11px] font-medium text-gray-500 px-2 py-1.5">{group.label}</p>
            {group.items.map((conv) => {
              const isActive = activeConvId === conv.id;
              const isHovered = hoveredId === conv.id;
              return (
                <div
                  key={conv.id}
                  onMouseEnter={() => setHoveredId(conv.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className="relative"
                >
                  {editingId === conv.id ? (
                    <form onSubmit={(e) => saveRename(e, conv.id)} className="px-2 py-1">
                      <input
                        autoFocus
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onBlur={() => setEditingId(null)}
                        className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-gray-500"
                      />
                    </form>
                  ) : (
                    <Link
                      href={`/chat/${conv.id}`}
                      onClick={onMobileClose}
                      className={`group flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition ${
                        isActive
                          ? "bg-gray-800/80 text-white"
                          : "text-gray-400 hover:bg-gray-800/50 hover:text-gray-200"
                      }`}
                    >
                      <span className="truncate flex-1 text-[13px]">
                        {conv.title || "New conversation"}
                      </span>
                      {(isHovered || isActive) && (
                        <span className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => startRename(e, conv)}
                            className="p-0.5 text-gray-500 hover:text-gray-300 transition"
                            title="Rename"
                          >
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M12 20h9" />
                              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => deleteConversation(e, conv.id)}
                            className="p-0.5 text-gray-500 hover:text-red-400 transition"
                            title="Delete"
                          >
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        </span>
                      )}
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        ))}

        {conversations.length === 0 && (
          <p className="text-xs text-gray-600 px-3 py-4">No conversations yet</p>
        )}
      </div>

      {/* Workspace nav */}
      <div className="border-t border-gray-800/40 px-2 py-2">
        <div className="space-y-0.5">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={onMobileClose}
              className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] transition ${
                pathname.startsWith(item.href)
                  ? "bg-gray-800/80 text-white"
                  : "text-gray-500 hover:bg-gray-800/50 hover:text-gray-300"
              }`}
            >
              <NavIcon type={item.icon} size={14} />
              {item.label}
            </Link>
          ))}
        </div>
      </div>

      {/* User */}
      <div className="border-t border-gray-800/40 p-2" ref={userMenuRef}>
        {user ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowUserMenu((p) => !p)}
              className="w-full flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-gray-800/50 transition text-left"
            >
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-gray-300 truncate">{user.name || user.email}</p>
              </div>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-gray-500 shrink-0"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>

            {showUserMenu && (
              <div className="absolute bottom-full left-0 right-0 mb-1 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl shadow-black/60 z-50 py-1 animate-slide-up">
                <Link
                  href="/settings"
                  onClick={() => {
                    setShowUserMenu(false);
                    onMobileClose();
                  }}
                  className="block px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 rounded-md mx-1 transition"
                >
                  Settings
                </Link>
                <Link
                  href="/billing"
                  onClick={() => {
                    setShowUserMenu(false);
                    onMobileClose();
                  }}
                  className="block px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 rounded-md mx-1 transition"
                >
                  Billing
                </Link>
                <div className="border-t border-gray-800 my-1" />
                <button
                  type="button"
                  onClick={() => {
                    setShowUserMenu(false);
                    logout();
                  }}
                  className="w-[calc(100%-0.5rem)] text-left px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-md mx-1 transition"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        ) : (
          <Link
            href="/login"
            className="flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-400 hover:bg-gray-800/50 hover:text-white transition"
          >
            Sign in
          </Link>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:block w-[260px] h-screen shrink-0 sticky top-0">
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: click-to-close backdrop */}
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handled by Escape key */}
          <div className="fixed inset-0 bg-black/60 z-40 md:hidden" onClick={onMobileClose} />
          <aside className="fixed inset-y-0 left-0 w-[280px] z-50 md:hidden animate-slide-in-left">
            {sidebarContent}
          </aside>
        </>
      )}
    </>
  );
}
