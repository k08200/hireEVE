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
}

function formatRelative(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "방금";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
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
      if (notif.id) {
        setNotifications((prev) => {
          if (prev.some((n) => n.id === notif.id)) return prev;
          return [{ ...notif, isRead: false }, ...prev];
        });
        setFlash(true);
        setTimeout(() => setFlash(false), 2000);
      }
    });
    return unsub;
  }, [on]);

  const fetchNotifications = () => {
    apiFetch<{ notifications: Notification[] }>("/api/notifications?limit=30")
      .then((d) => setNotifications(d.notifications || []))
      .catch(() => {});
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: fetch on mount and reconnect
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, connected ? 60_000 : 15_000);
    return () => clearInterval(interval);
  }, [connected]);

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
      const convo = await apiFetch<{ id: string }>("/api/chat/conversations", {
        method: "POST",
        body: JSON.stringify({
          initialMessage: `[EVE 알림에 대해 이야기하고 싶어요]\n\n제목: ${n.title}\n내용: ${n.message}\n\n이 알림에 대해 더 자세히 알려주세요.`,
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
        <div className="absolute left-0 top-full mt-2 w-80 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">알림</span>
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
                  모두 읽음
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-xs text-gray-500 hover:text-red-400 transition"
                >
                  전체 삭제
                </button>
              )}
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="text-center text-gray-500 text-sm py-6">알림이 없습니다</p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => !n.isRead && markAsRead(n.id)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-800/50 hover:bg-gray-800/50 transition ${
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
                        EVE와 대화 →
                      </button>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
          {tabCount > 1 && (
            <div className="px-4 py-2 border-t border-gray-800 text-[10px] text-gray-500">
              {tabCount}개 탭 연결 — 실시간 동기화
            </div>
          )}
        </div>
      )}
    </div>
  );
}
