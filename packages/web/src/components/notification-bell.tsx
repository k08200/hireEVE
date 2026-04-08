"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/api";
import { useWebSocket } from "./use-websocket";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  conversationId?: string;
}

function formatRelative(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const typeIcon: Record<string, string> = {
  reminder: "🔔",
  calendar: "📅",
  email: "📧",
  task: "✅",
  meeting: "🎥",
  briefing: "📋",
  insight: "🤖",
};

function isAgentNotification(title: string): boolean {
  return title.startsWith("[EVE]");
}

export default function NotificationBell({ userId }: { userId: string }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [flash, setFlash] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { connected, on, connectedClients } = useWebSocket(userId);

  // Click outside / Escape to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", escHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", escHandler);
    };
  }, [open]);

  // Listen for real-time push notifications via WebSocket
  useEffect(() => {
    const unsub = on("notification", (payload) => {
      const notif = payload as unknown as Notification;

      // System event: trigger sidebar refresh
      if (notif.type === "system" && notif.title === "conversations-updated") {
        window.dispatchEvent(new Event("conversations-updated"));
        return;
      }

      if (notif.id) {
        setNotifications((prev) => {
          if (prev.some((n) => n.id === notif.id)) return prev;
          return [{ ...notif, isRead: false }, ...prev];
        });
        setFlash(true);
        setTimeout(() => setFlash(false), 2000);

        // Show macOS system notification via Notification API
        if (
          typeof window !== "undefined" &&
          "Notification" in window &&
          window.Notification.permission === "granted"
        ) {
          try {
            new window.Notification(notif.title, {
              body: notif.message,
              icon: "/icon-192.svg",
              requireInteraction: true,
            });
          } catch {
            // Notification constructor failed — ignore
          }
        }
      }
    });
    return unsub;
  }, [on]);

  const fetchNotifications = () => {
    apiFetch<{ notifications: Notification[] }>("/api/notifications?limit=30")
      .then((d) => setNotifications(d.notifications || []))
      .catch(() => {});
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60_000);
    return () => clearInterval(interval);
  }, []);

  const markAsRead = (id: string) => {
    apiFetch(`/api/notifications/${id}/read`, { method: "PATCH" }).catch(() => {});
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
  };

  const markAllRead = () => {
    apiFetch("/api/notifications/read-all", { method: "PATCH" }).catch(() => {});
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  const clearAll = () => {
    apiFetch("/api/notifications", { method: "DELETE" }).catch(() => {});
    setNotifications([]);
    setOpen(false);
  };

  const discussWithEve = async (n: Notification) => {
    try {
      // If the notification has a linked conversation (from propose_action), go directly there
      if (n.conversationId) {
        setOpen(false);
        router.push(`/chat/${n.conversationId}`);
        return;
      }

      // Otherwise create a new conversation about this notification
      const convo = await apiFetch<{ id: string }>("/api/chat/conversations", {
        method: "POST",
        body: JSON.stringify({
          initialMessage: `Tell me more about: ${n.title}\n\n${n.message}`,
        }),
      });
      setOpen(false);
      router.push(`/chat/${convo.id}`);
    } catch {
      // silently fail
    }
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const tabCount = connectedClients.filter((c) => c.type === "web").length;

  return (
    <div className="relative flex items-center gap-2" ref={containerRef}>
      {/* Connection indicator */}
      <span
        className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-green-400" : "bg-gray-600"}`}
        title={connected ? `Connected${tabCount > 1 ? ` (${tabCount} tabs)` : ""}` : "Disconnected"}
      />

      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`relative text-gray-400 hover:text-white transition p-1 ${flash ? "animate-bounce" : ""}`}
        aria-label="Notifications"
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
          aria-hidden="true"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-[min(20rem,calc(100vw-2rem))] bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Notifications</span>
              {connected && (
                <span className="text-[10px] text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded">
                  live
                </span>
              )}
              {unreadCount > 0 && (
                <span className="text-[10px] text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded">
                  {unreadCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="text-xs text-gray-500 hover:text-blue-400 transition"
                >
                  Read all
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-xs text-gray-500 hover:text-red-400 transition"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="text-center text-gray-500 text-sm py-6">No notifications</p>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => !n.isRead && markAsRead(n.id)}
                  onKeyDown={(e) => e.key === "Enter" && !n.isRead && markAsRead(n.id)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-800/50 hover:bg-gray-800/50 transition cursor-pointer ${
                    !n.isRead ? "bg-blue-600/5" : ""
                  } ${isAgentNotification(n.title) ? "border-l-2 border-l-cyan-500/60" : ""}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm">
                      {isAgentNotification(n.title) ? "🤖" : typeIcon[n.type] || "📌"}
                    </span>
                    <span
                      className={`text-sm truncate ${!n.isRead ? "font-semibold" : "text-gray-300"} ${isAgentNotification(n.title) ? "text-cyan-300" : ""}`}
                    >
                      {n.title}
                    </span>
                    {isAgentNotification(n.title) && (
                      <span className="text-[9px] text-cyan-400 bg-cyan-400/10 px-1 py-0.5 rounded shrink-0">
                        AI
                      </span>
                    )}
                    {!n.isRead && (
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0 ml-auto" />
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-1 line-clamp-2 ml-6">{n.message}</p>
                  <div className="flex items-center gap-2 mt-1 ml-6">
                    <p className="text-[10px] text-gray-600">{formatRelative(n.createdAt)}</p>
                    {isAgentNotification(n.title) && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          discussWithEve(n);
                        }}
                        className="text-[10px] text-cyan-400 hover:text-cyan-300 cursor-pointer hover:underline"
                      >
                        {n.conversationId ? "View →" : "Discuss →"}
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
          {tabCount > 1 && (
            <div className="px-4 py-2 border-t border-gray-800 text-[10px] text-gray-500">
              {tabCount} tabs connected
            </div>
          )}
        </div>
      )}
    </div>
  );
}
