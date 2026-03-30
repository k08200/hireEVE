"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AuthGuard from "../../components/auth-guard";
import { RelativeTime } from "../../components/relative-time";
import { DashboardSkeleton, ListSkeleton } from "../../components/skeleton";
import { useWebSocket } from "../../components/use-websocket";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../lib/auth";

interface Stats {
  tasks: { total: number; done: number; overdue: number };
  notes: number;
  contacts: number;
  reminders: { active: number; dismissed: number };
  notifications: number;
  emails: { total: number; unread: number; urgent: number };
  calendar: { today: number; nextEvent: string | null };
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
  return (
    <AuthGuard>
      <DashboardContent />
    </AuthGuard>
  );
}

function DashboardContent() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { connected, connectedClients } = useWebSocket(user?.id || "demo-user");

  useEffect(() => {
    Promise.all([
      apiFetch<{ tasks: { status: string; dueDate?: string }[] }>("/api/tasks").catch(() => ({
        tasks: [],
      })),
      apiFetch<{ notes: { id: string }[] }>("/api/notes").catch(() => ({ notes: [] })),
      apiFetch<{ contacts: { id: string }[] }>("/api/contacts").catch(() => ({ contacts: [] })),
      apiFetch<{ reminders: { status: string }[] }>("/api/reminders").catch(() => ({
        reminders: [],
      })),
      apiFetch<{ notifications: unknown[]; count: number }>("/api/notifications").catch(() => ({
        notifications: [],
        count: 0,
      })),
      apiFetch<{ total: number; unread: number; urgent: number }>("/api/email/stats/summary").catch(
        () => ({ total: 0, unread: 0, urgent: 0 }),
      ),
      apiFetch<{ total: number; nextEvent: { title: string } | null }>(
        "/api/calendar/today/summary",
      ).catch(() => ({ total: 0, nextEvent: null })),
    ])
      .then(
        ([
          taskData,
          noteData,
          contactData,
          reminderData,
          notifData,
          emailStats,
          calendarSummary,
        ]) => {
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
            emails: {
              total: emailStats.total || 0,
              unread: emailStats.unread || 0,
              urgent: emailStats.urgent || 0,
            },
            calendar: {
              today: calendarSummary.total || 0,
              nextEvent: calendarSummary.nextEvent?.title || null,
            },
          });
        },
      )
      .finally(() => setLoading(false));

    apiFetch<{ activity: Activity[] }>("/api/activity")
      .then((d) => setActivity(d.activity || []))
      .catch(() => {});
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
          label: "Email",
          value: stats.emails.unread.toString(),
          sub:
            stats.emails.urgent > 0
              ? `${stats.emails.urgent} urgent`
              : `${stats.emails.total} total`,
          href: "/email",
          color: stats.emails.unread > 0 ? "text-blue-400" : "text-gray-400",
        },
        {
          label: "Calendar",
          value: stats.calendar.today.toString(),
          sub: stats.calendar.nextEvent ? `Next: ${stats.calendar.nextEvent}` : "No events today",
          href: "/calendar",
          color: stats.calendar.today > 0 ? "text-purple-400" : "text-gray-400",
        },
        {
          label: "Notes",
          value: stats.notes.toString(),
          sub: "Total memos",
          href: "/notes",
          color: "text-green-400",
        },
        {
          label: "Reminders",
          value: stats.reminders.active.toString(),
          sub: `${stats.reminders.dismissed} completed`,
          href: "/reminders",
          color: "text-yellow-400",
        },
      ]
    : [];

  const greeting = getGreeting();
  const tabCount = connectedClients.filter((c) => c.type === "web").length;

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">
            {greeting.text}
            {user?.name ? `, ${user.name}` : ""}
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">{greeting.textKr}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span
            className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-green-400 animate-pulse" : "bg-gray-600"}`}
          />
          <span>{connected ? "Online" : "Connecting..."}</span>
          {tabCount > 1 && <span className="text-gray-600">({tabCount})</span>}
        </div>
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
                href: "/email",
                title: "Check Email",
                desc: "Read, classify, and reply to emails",
                descKr: "이메일 확인하기",
                color:
                  "from-cyan-600/20 to-cyan-800/10 border-cyan-500/30 hover:border-cyan-400/50",
              },
              {
                href: "/calendar",
                title: "View Calendar",
                desc: "Schedule and manage events",
                descKr: "일정 확인하기",
                color:
                  "from-purple-600/20 to-purple-800/10 border-purple-500/30 hover:border-purple-400/50",
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
                  "from-yellow-600/20 to-yellow-800/10 border-yellow-500/30 hover:border-yellow-400/50",
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
                className="bg-gray-900/80 border border-gray-800/80 rounded-xl p-4 hover:border-gray-700 transition-colors"
              >
                <p className="text-xs text-gray-500 mb-1">{c.label}</p>
                <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
                <p className="text-[11px] text-gray-500 mt-1 truncate">{c.sub}</p>
              </Link>
            ))}
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
            <Link
              href="/chat"
              className="bg-gradient-to-br from-blue-600/20 to-blue-800/10 border border-blue-500/30 rounded-xl p-5 hover:border-blue-400/50 transition"
            >
              <h3 className="font-semibold mb-1">Chat with EVE</h3>
              <p className="text-xs text-gray-400">Ask anything — email, scheduling, writing</p>
              <p className="text-xs text-gray-500 mt-2">EVE에게 뭐든 물어보세요</p>
            </Link>
            <Link
              href="/email"
              className="bg-gradient-to-br from-cyan-600/20 to-cyan-800/10 border border-cyan-500/30 rounded-xl p-5 hover:border-cyan-400/50 transition"
            >
              <h3 className="font-semibold mb-1">Email Inbox</h3>
              <p className="text-xs text-gray-400">
                {stats?.emails.unread ? `${stats.emails.unread} unread` : "All caught up"}
              </p>
              <p className="text-xs text-gray-500 mt-2">이메일 확인</p>
            </Link>
            <Link
              href="/calendar"
              className="bg-gradient-to-br from-purple-600/20 to-purple-800/10 border border-purple-500/30 rounded-xl p-5 hover:border-purple-400/50 transition"
            >
              <h3 className="font-semibold mb-1">Today&apos;s Schedule</h3>
              <p className="text-xs text-gray-400">
                {stats?.calendar.today ? `${stats.calendar.today} events` : "No events today"}
              </p>
              <p className="text-xs text-gray-500 mt-2">오늘 일정</p>
            </Link>
          </div>

          {/* Activity Feed */}
          {activity.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-400 mb-3">Recent Activity</h2>
              <div className="space-y-1.5">
                {activity.map((a, i) => (
                  <div
                    key={i}
                    className="bg-gray-900/60 border border-gray-800/60 rounded-lg px-4 py-2.5 flex items-center gap-3"
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
