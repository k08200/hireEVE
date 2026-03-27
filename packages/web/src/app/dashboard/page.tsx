"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RelativeTime } from "../../components/relative-time";
import { DashboardSkeleton, ListSkeleton } from "../../components/skeleton";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Stats {
  tasks: { total: number; done: number; overdue: number };
  notes: number;
  contacts: number;
  reminders: { active: number; dismissed: number };
  notifications: number;
}

interface Activity {
  type: "task" | "note" | "reminder" | "conversation";
  title: string;
  status: string | null;
  createdAt: string;
}

const typeLabels: Record<string, string> = {
  task: "Task",
  note: "Note",
  reminder: "Reminder",
  conversation: "Chat",
};

const typeColors: Record<string, string> = {
  task: "bg-blue-500/20 text-blue-400",
  note: "bg-green-500/20 text-green-400",
  reminder: "bg-yellow-500/20 text-yellow-400",
  conversation: "bg-purple-500/20 text-purple-400",
};

function getGreeting(): { text: string; textKr: string } {
  const hour = new Date().getHours();
  if (hour < 6) return { text: "Working late", textKr: "늦은 밤이에요" };
  if (hour < 12) return { text: "Good morning", textKr: "좋은 아침이에요" };
  if (hour < 18) return { text: "Good afternoon", textKr: "좋은 오후예요" };
  return { text: "Good evening", textKr: "좋은 저녁이에요" };
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");

  useEffect(() => {
    const userId = "demo-user";
    Promise.all([
      fetch(`${API_BASE}/api/tasks?userId=${userId}`)
        .then((r) => r.json())
        .catch(() => ({ tasks: [] })),
      fetch(`${API_BASE}/api/notes?userId=${userId}`)
        .then((r) => r.json())
        .catch(() => ({ notes: [] })),
      fetch(`${API_BASE}/api/contacts?userId=${userId}`)
        .then((r) => r.json())
        .catch(() => ({ contacts: [] })),
      fetch(`${API_BASE}/api/reminders?userId=${userId}`)
        .then((r) => r.json())
        .catch(() => ({ reminders: [] })),
      fetch(`${API_BASE}/api/notifications?userId=${userId}`)
        .then((r) => r.json())
        .catch(() => ({ notifications: [], count: 0 })),
    ])
      .then(([taskData, noteData, contactData, reminderData, notifData]) => {
        const tasks = taskData.tasks || [];
        const now = new Date();
        setStats({
          tasks: {
            total: tasks.length,
            done: tasks.filter((t: { status: string }) => t.status === "DONE").length,
            overdue: tasks.filter(
              (t: { status: string; dueDate?: string }) =>
                t.status !== "DONE" && t.dueDate && new Date(t.dueDate) < now,
            ).length,
          },
          notes: (noteData.notes || []).length,
          contacts: (contactData.contacts || []).length,
          reminders: {
            active: (reminderData.reminders || []).filter(
              (r: { status: string }) => r.status !== "DISMISSED",
            ).length,
            dismissed: (reminderData.reminders || []).filter(
              (r: { status: string }) => r.status === "DISMISSED",
            ).length,
          },
          notifications: notifData.count || 0,
        });
      })
      .finally(() => setLoading(false));

    fetch(`${API_BASE}/api/activity?userId=demo-user`)
      .then((r) => r.json())
      .then((d) => setActivity(d.activity || []))
      .catch(() => {});

    // Load profile name from localStorage
    try {
      const stored = localStorage.getItem("eve-profile");
      if (stored) {
        const profile = JSON.parse(stored);
        if (profile.name) setUserName(profile.name);
      }
    } catch {
      // ignore
    }
  }, []);

  const isEmpty =
    stats &&
    stats.tasks.total === 0 &&
    stats.notes === 0 &&
    stats.contacts === 0 &&
    stats.reminders.active === 0;

  const cards = stats
    ? [
        {
          label: "Tasks",
          value: `${stats.tasks.done}/${stats.tasks.total}`,
          sub: stats.tasks.overdue > 0 ? `${stats.tasks.overdue} overdue` : "All on track",
          href: "/tasks",
          color: stats.tasks.overdue > 0 ? "text-red-400" : "text-green-400",
        },
        {
          label: "Notes",
          value: stats.notes.toString(),
          sub: "Total memos",
          href: "/notes",
          color: "text-blue-400",
        },
        {
          label: "Contacts",
          value: stats.contacts.toString(),
          sub: "People in network",
          href: "/contacts",
          color: "text-purple-400",
        },
        {
          label: "Reminders",
          value: stats.reminders.active.toString(),
          sub: `${stats.reminders.dismissed} completed`,
          href: "/reminders",
          color: "text-yellow-400",
        },
        {
          label: "Notifications",
          value: stats.notifications.toString(),
          sub: "Pending alerts",
          href: "/chat",
          color: stats.notifications > 0 ? "text-red-400" : "text-gray-400",
        },
      ]
    : [];

  const greeting = getGreeting();

  return (
    <main className="max-w-4xl mx-auto px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">
          {greeting.text}
          {userName ? `, ${userName}` : ""}
        </h1>
        <p className="text-gray-400 text-sm mt-1">
          {greeting.textKr} — Overview of your workspace / 워크스페이스 현황
        </p>
      </div>

      {loading ? (
        <>
          <DashboardSkeleton />
          <div className="mt-10">
            <ListSkeleton count={3} />
          </div>
        </>
      ) : isEmpty ? (
        <div className="py-8">
          <div className="text-center mb-10">
            <h2 className="text-xl font-bold mb-2">Welcome to EVE / EVE에 오신 걸 환영합니다</h2>
            <p className="text-gray-400 text-sm max-w-md mx-auto">
              Get started by trying one of these. / 아래에서 시작해보세요.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-2xl mx-auto">
            {[
              {
                href: "/chat",
                title: "Chat with EVE",
                desc: "Ask anything — email, scheduling, research",
                descKr: "EVE에게 뭐든 물어보세요",
                color:
                  "from-blue-600/20 to-blue-800/10 border-blue-500/30 hover:border-blue-400/50",
              },
              {
                href: "/tasks",
                title: "Create a Task",
                desc: "Track your to-dos and priorities",
                descKr: "할 일과 우선순위를 관리하세요",
                color:
                  "from-green-600/20 to-green-800/10 border-green-500/30 hover:border-green-400/50",
              },
              {
                href: "/notes",
                title: "Write a Note",
                desc: "Capture ideas and memos",
                descKr: "아이디어와 메모를 기록하세요",
                color:
                  "from-purple-600/20 to-purple-800/10 border-purple-500/30 hover:border-purple-400/50",
              },
              {
                href: "/contacts",
                title: "Add a Contact",
                desc: "Build your network and CRM",
                descKr: "네트워크를 구축하세요",
                color:
                  "from-yellow-600/20 to-yellow-800/10 border-yellow-500/30 hover:border-yellow-400/50",
              },
              {
                href: "/reminders",
                title: "Set a Reminder",
                desc: "Never forget important things",
                descKr: "중요한 일을 잊지 마세요",
                color: "from-red-600/20 to-red-800/10 border-red-500/30 hover:border-red-400/50",
              },
              {
                href: "/settings",
                title: "Connect Integrations",
                desc: "Gmail, Calendar, Slack, Notion",
                descKr: "연동 설정",
                color:
                  "from-gray-600/20 to-gray-800/10 border-gray-500/30 hover:border-gray-400/50",
              },
            ].map((card) => (
              <Link
                key={card.href}
                href={card.href}
                className={`bg-gradient-to-br ${card.color} border rounded-xl p-5 transition`}
              >
                <h3 className="font-semibold mb-1">{card.title}</h3>
                <p className="text-sm text-gray-400">{card.desc}</p>
                <p className="text-xs text-gray-500 mt-1">{card.descKr}</p>
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-10">
            {cards.map((c) => (
              <Link
                key={c.label}
                href={c.href}
                className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-600 transition group"
              >
                <p className="text-xs text-gray-500 mb-1">{c.label}</p>
                <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
                <p className="text-[11px] text-gray-500 mt-1">{c.sub}</p>
              </Link>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
            <Link
              href="/chat"
              className="bg-gradient-to-br from-blue-600/20 to-blue-800/10 border border-blue-500/30 rounded-xl p-6 hover:border-blue-400/50 transition"
            >
              <h3 className="font-semibold mb-1">Chat with EVE</h3>
              <p className="text-sm text-gray-400">
                Ask anything — email, scheduling, research, writing
              </p>
              <p className="text-xs text-gray-500 mt-2">EVE에게 뭐든 물어보세요</p>
            </Link>
            <Link
              href="/settings"
              className="bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-gray-600 transition"
            >
              <h3 className="font-semibold mb-1">Settings & Integrations</h3>
              <p className="text-sm text-gray-400">Connect Gmail, Calendar, Slack, Notion</p>
              <p className="text-xs text-gray-500 mt-2">연동 설정</p>
            </Link>
          </div>

          {/* Activity Feed */}
          {activity.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-4">Recent Activity / 최근 활동</h2>
              <div className="space-y-2">
                {activity.map((a, i) => (
                  <div
                    key={i}
                    className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 flex items-center gap-3"
                  >
                    <span
                      className={`text-[10px] uppercase px-2 py-0.5 rounded font-medium ${typeColors[a.type]}`}
                    >
                      {typeLabels[a.type]}
                    </span>
                    <span className="text-sm flex-1 truncate">{a.title}</span>
                    {a.status && <span className="text-[10px] text-gray-500">{a.status}</span>}
                    <RelativeTime
                      date={a.createdAt}
                      className="text-[10px] text-gray-600 shrink-0"
                    />
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
