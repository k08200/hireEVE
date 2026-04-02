"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import AuthGuard from "../../components/auth-guard";
import { RelativeTime } from "../../components/relative-time";
import { ListSkeleton } from "../../components/skeleton";
import { useToast } from "../../components/toast";
import { useWebSocket } from "../../components/use-websocket";
import { API_BASE, apiFetch, authHeaders } from "../../lib/api";
import { useAuth } from "../../lib/auth";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

const TYPE_COLORS: Record<string, string> = {
  reminder: "bg-yellow-500/20 text-yellow-400",
  briefing: "bg-blue-500/20 text-blue-400",
  email: "bg-cyan-500/20 text-cyan-400",
  billing: "bg-red-500/20 text-red-400",
  calendar: "bg-purple-500/20 text-purple-400",
  task: "bg-green-500/20 text-green-400",
  meeting: "bg-indigo-500/20 text-indigo-400",
  insight: "bg-cyan-500/20 text-cyan-400",
};

function isAgentNotification(title: string): boolean {
  return title.startsWith("[EVE]");
}

type FilterTab = "all" | "agent" | "system";

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>("all");
  const { toast } = useToast();
  const router = useRouter();
  const { user } = useAuth();
  const { on, connected } = useWebSocket(user?.id || "");

  // Real-time: prepend new notifications from WebSocket
  useEffect(() => {
    const unsub = on("notification", (payload) => {
      const notif = payload as unknown as Notification;
      if (notif.id) {
        setNotifications((prev) => {
          if (prev.some((n) => n.id === notif.id)) return prev;
          return [{ ...notif, isRead: false }, ...prev];
        });
      }
    });
    return unsub;
  }, [on]);

  const load = () => {
    apiFetch<{ notifications: Notification[] }>("/api/notifications?limit=100")
      .then((d) => setNotifications(d.notifications || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: load on mount
  useEffect(() => {
    load();
  }, []);

  const markRead = async (id: string) => {
    await fetch(`${API_BASE}/api/notifications/${id}/read`, {
      method: "PATCH",
      headers: authHeaders(),
    });
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
  };

  const markAllRead = async () => {
    await fetch(`${API_BASE}/api/notifications/read-all`, {
      method: "PATCH",
      headers: authHeaders(),
    });
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    toast("All marked as read", "success");
  };

  const clearAll = async () => {
    await fetch(`${API_BASE}/api/notifications`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    setNotifications([]);
    toast("Notifications cleared", "info");
  };

  const discussWithEve = async (n: Notification) => {
    try {
      const convo = await apiFetch<{ id: string }>("/api/chat/conversations", {
        method: "POST",
        body: JSON.stringify({
          initialMessage: `[EVE 알림에 대해 이야기하고 싶어요]\n\n제목: ${n.title}\n내용: ${n.message}\n\n이 알림에 대해 더 자세히 알려주세요.`,
        }),
      });
      router.push(`/chat/${convo.id}`);
    } catch {
      toast("대화 생성에 실패했습니다", "error");
    }
  };

  const filtered = notifications.filter((n) => {
    if (filter === "agent") return isAgentNotification(n.title);
    if (filter === "system") return !isAgentNotification(n.title);
    return true;
  });
  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const agentCount = notifications.filter((n) => isAgentNotification(n.title)).length;

  return (
    <AuthGuard>
      <main className="max-w-3xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">Notifications</h1>
              {connected && (
                <span className="text-[10px] text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded">
                  live
                </span>
              )}
            </div>
            <p className="text-gray-400 text-sm mt-1">
              {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
            </p>
          </div>
          {notifications.length > 0 && (
            <div className="flex gap-2">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="text-sm text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-lg transition border border-gray-700"
                >
                  Mark all read
                </button>
              )}
              <button
                type="button"
                onClick={clearAll}
                className="text-sm text-gray-500 hover:text-red-400 bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-lg transition border border-gray-700"
              >
                Clear all
              </button>
            </div>
          )}
        </div>

        {/* Filter Tabs */}
        {!loading && notifications.length > 0 && (
          <div className="flex gap-1 mb-6 bg-gray-900/60 p-1 rounded-lg w-fit">
            {([
              { key: "all" as FilterTab, label: "전체", count: notifications.length },
              { key: "agent" as FilterTab, label: "🤖 EVE", count: agentCount },
              { key: "system" as FilterTab, label: "시스템", count: notifications.length - agentCount },
            ]).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilter(tab.key)}
                className={`text-xs px-3 py-1.5 rounded-md transition ${
                  filter === tab.key
                    ? "bg-gray-700 text-white"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span className="ml-1.5 text-[10px] opacity-60">{tab.count}</span>
                )}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <ListSkeleton count={5} />
        ) : filtered.length === 0 && filter !== "all" ? (
          <div className="text-center py-20">
            <p className="text-gray-500 mb-2">
              {filter === "agent" ? "EVE 에이전트 알림이 없습니다" : "시스템 알림이 없습니다"}
            </p>
            <button
              type="button"
              onClick={() => setFilter("all")}
              className="text-xs text-cyan-400 hover:underline"
            >
              전체 보기
            </button>
          </div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-500 mb-2">No notifications</p>
            <p className="text-gray-600 text-sm">
              You&apos;ll see reminders, briefings, and alerts here
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((n) => (
              <button
                type="button"
                key={n.id}
                onClick={() => !n.isRead && markRead(n.id)}
                className={`w-full text-left rounded-xl p-4 transition group ${
                  n.isRead
                    ? "bg-gray-900/50 border border-gray-800/40 opacity-60"
                    : "bg-gray-900/80 border border-gray-800/60 hover:border-gray-700"
                } ${isAgentNotification(n.title) ? "border-l-2 border-l-cyan-500/60" : ""}`}
              >
                <div className="flex items-start gap-3">
                  {!n.isRead && (
                    <span className="w-2 h-2 bg-blue-500 rounded-full mt-1.5 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {isAgentNotification(n.title) ? (
                        <span className="text-[10px] uppercase px-1.5 py-0.5 rounded font-medium bg-cyan-500/20 text-cyan-400 flex items-center gap-1">
                          🤖 EVE
                        </span>
                      ) : (
                        <span
                          className={`text-[10px] uppercase px-1.5 py-0.5 rounded font-medium ${TYPE_COLORS[n.type] || "bg-gray-500/20 text-gray-400"}`}
                        >
                          {n.type}
                        </span>
                      )}
                      <span className={`font-medium text-sm ${isAgentNotification(n.title) ? "text-cyan-300" : ""}`}>
                        {n.title}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 line-clamp-2">{n.message}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <RelativeTime
                        date={n.createdAt}
                        className="text-[10px] text-gray-600"
                      />
                      {isAgentNotification(n.title) && (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            discussWithEve(n);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { e.stopPropagation(); discussWithEve(n); }
                          }}
                          className="text-[10px] text-cyan-400 hover:text-cyan-300 cursor-pointer hover:underline"
                        >
                          EVE와 대화 →
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </AuthGuard>
  );
}
