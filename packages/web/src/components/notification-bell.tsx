"use client";

import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Notification {
  id: string;
  type: "reminder" | "calendar" | "email" | "task";
  title: string;
  message: string;
  createdAt: string;
}

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  const fetchNotifications = () => {
    fetch(`${API_BASE}/api/notifications?userId=demo-user`)
      .then((r) => r.json())
      .then((d) => setNotifications(d.notifications || []))
      .catch(() => {});
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 15_000);
    return () => clearInterval(interval);
  }, []);

  const clearAll = () => {
    fetch(`${API_BASE}/api/notifications?userId=demo-user`, { method: "DELETE" })
      .then(() => {
        setNotifications([]);
        setOpen(false);
      })
      .catch(() => {});
  };

  const count = notifications.length;

  const typeIcon: Record<string, string> = {
    reminder: "bell",
    calendar: "cal",
    email: "mail",
    task: "task",
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative text-gray-400 hover:text-white transition p-1"
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
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {count > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800">
            <span className="text-sm font-medium">Notifications</span>
            {count > 0 && (
              <button
                onClick={clearAll}
                className="text-xs text-gray-500 hover:text-red-400 transition"
              >
                Clear all
              </button>
            )}
          </div>
          <div className="max-h-72 overflow-y-auto">
            {count === 0 ? (
              <p className="text-center text-gray-500 text-sm py-6">No notifications</p>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className="px-4 py-3 border-b border-gray-800/50 hover:bg-gray-800/50 transition"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded">
                      {typeIcon[n.type] || n.type}
                    </span>
                    <span className="text-sm font-medium truncate">{n.title}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1 line-clamp-2">{n.message}</p>
                  <p className="text-[10px] text-gray-600 mt-1">
                    {new Date(n.createdAt).toLocaleString()}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
