"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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

interface WeatherData {
  location: string;
  current: {
    temperature: number;
    feelsLike: number;
    humidity: number;
    windSpeed: number;
    condition: string;
    icon: string;
  };
  forecast: Array<{
    date: string;
    maxTemp: number;
    minTemp: number;
    condition: string;
    precipitation: number;
  }>;
}

interface Activity {
  type: "task" | "note" | "reminder" | "conversation";
  title: string;
  status: string | null;
  createdAt: string;
}

interface AgentLog {
  id: string;
  action: string;
  summary: string;
  tool: string | null;
  reasoning: string | null;
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
  if (hour < 6) return { text: "Working late", textKr: "" };
  if (hour < 12) return { text: "Good morning", textKr: "" };
  if (hour < 18) return { text: "Good afternoon", textKr: "" };
  return { text: "Good evening", textKr: "" };
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
  const [agentLogs, setAgentLogs] = useState<AgentLog[]>([]);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const { user, googleConnected } = useAuth();
  const router = useRouter();
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const { connected, connectedClients, lastNotification } = useWebSocket(user?.id || "");

  // Update notification count when WebSocket notification arrives
  useEffect(() => {
    if (lastNotification) {
      setUnreadNotifs((prev) => prev + 1);
    }
  }, [lastNotification]);

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
      apiFetch<{ notifications: unknown[]; count: number; unread: number }>(
        "/api/notifications",
      ).catch(() => ({
        notifications: [],
        count: 0,
        unread: 0,
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
            notifications: notifData.unread || 0,
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
          setUnreadNotifs(notifData.unread || 0);
        },
      )
      .finally(() => setLoading(false));

    apiFetch<{ activity: Activity[] }>("/api/activity")
      .then((d) => setActivity(d.activity || []))
      .catch(() => {});

    apiFetch<{ logs: AgentLog[] }>("/api/automations/agent-logs?limit=5")
      .then((d) => setAgentLogs(d.logs || []))
      .catch(() => {});

    // Fetch weather for Seoul (default)
    const savedCity = localStorage.getItem("eve-weather-city") || "Seoul";
    fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(savedCity)}&count=1&language=en`,
    )
      .then((r) => r.json())
      .then(
        (geo: {
          results?: Array<{ latitude: number; longitude: number; name: string; country: string }>;
        }) => {
          if (!geo.results?.length) return;
          const { latitude, longitude, name, country } = geo.results[0];
          return fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=Asia/Seoul&forecast_days=3`,
          )
            .then((r) => r.json())
            .then(
              (data: {
                current: {
                  temperature_2m: number;
                  relative_humidity_2m: number;
                  apparent_temperature: number;
                  weather_code: number;
                  wind_speed_10m: number;
                };
                daily: {
                  time: string[];
                  weather_code: number[];
                  temperature_2m_max: number[];
                  temperature_2m_min: number[];
                  precipitation_sum: number[];
                };
              }) => {
                const wmo: Record<number, string> = {
                  0: "Clear",
                  1: "Mostly clear",
                  2: "Partly cloudy",
                  3: "Cloudy",
                  45: "Fog",
                  51: "Drizzle",
                  61: "Rain",
                  63: "Rain",
                  71: "Snow",
                  80: "Showers",
                  95: "Thunderstorm",
                };
                const wmoIcon: Record<number, string> = {
                  0: "☀️",
                  1: "🌤️",
                  2: "⛅",
                  3: "☁️",
                  45: "🌫️",
                  51: "🌧️",
                  61: "🌧️",
                  63: "🌧️",
                  71: "❄️",
                  80: "🌦️",
                  95: "⛈️",
                };
                const c = data.current;
                const code = c.weather_code;
                setWeather({
                  location: `${name}, ${country}`,
                  current: {
                    temperature: c.temperature_2m,
                    feelsLike: c.apparent_temperature,
                    humidity: c.relative_humidity_2m,
                    windSpeed: c.wind_speed_10m,
                    condition: wmo[code] || wmo[Math.floor(code / 10) * 10] || "Unknown",
                    icon: wmoIcon[code] || wmoIcon[Math.floor(code / 10) * 10] || "🌡️",
                  },
                  forecast: data.daily.time.map((date, i) => ({
                    date,
                    maxTemp: data.daily.temperature_2m_max[i],
                    minTemp: data.daily.temperature_2m_min[i],
                    condition: wmo[data.daily.weather_code[i]] || "Unknown",
                    precipitation: data.daily.precipitation_sum[i],
                  })),
                });
              },
            );
        },
      )
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
        {
          label: "Notifications",
          value: unreadNotifs.toString(),
          sub: unreadNotifs > 0 ? "unread" : "All caught up",
          href: "/notifications",
          color: unreadNotifs > 0 ? "text-red-400" : "text-gray-400",
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
          {greeting.textKr && <p className="text-gray-500 text-sm mt-0.5">{greeting.textKr}</p>}
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span
            className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-green-400 animate-pulse" : "bg-gray-600"}`}
          />
          <span>{connected ? "Online" : "Connecting..."}</span>
          {tabCount > 1 && <span className="text-gray-600">({tabCount})</span>}
        </div>
      </div>

      {/* Onboarding banner — show when Google is not connected */}
      {googleConnected === false && (
        <Link
          href="/settings"
          className="flex items-center gap-3 mb-6 p-4 bg-gradient-to-r from-blue-600/10 to-blue-800/5 border border-blue-500/20 rounded-xl hover:border-blue-400/40 transition"
        >
          <div className="w-10 h-10 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center flex-shrink-0">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-white">
              Connect Google to unlock EVE&apos;s full power
            </p>
            <p className="text-xs text-gray-400">
              Email, Calendar, and Contacts — one click in Settings
            </p>
          </div>
          <svg
            className="w-4 h-4 text-gray-500"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </Link>
      )}

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
            <h2 className="text-xl font-bold mb-2">Welcome to EVE</h2>
            <p className="text-gray-400 text-sm max-w-md mx-auto">
              Connect your Google account and EVE starts working for you automatically.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl mx-auto">
            {[
              {
                href: "/settings",
                title: "Connect Google",
                desc: "Link Gmail & Calendar — EVE handles the rest",
                descKr: "",
                color:
                  "from-blue-600/20 to-blue-800/10 border-blue-500/30 hover:border-blue-400/50",
              },
              {
                href: "/chat",
                title: "Chat with EVE",
                desc: "Ask anything in plain language",
                descKr: "",
                color:
                  "from-emerald-600/20 to-emerald-800/10 border-emerald-500/30 hover:border-emerald-400/50",
              },
            ].map((card) => (
              <Link
                key={card.href}
                href={card.href}
                className={`bg-gradient-to-br ${card.color} border rounded-xl p-5 transition`}
              >
                <h3 className="font-semibold mb-1">{card.title}</h3>
                <p className="text-sm text-gray-400">{card.desc}</p>
                {card.descKr && <p className="text-xs text-gray-500 mt-1">{card.descKr}</p>}
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-10">
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

          {/* Weather Widget */}
          {weather && (
            <div className="bg-gray-900/80 border border-gray-800/80 rounded-xl p-5 mb-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{weather.current.icon}</span>
                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold">
                        {Math.round(weather.current.temperature)}°C
                      </span>
                      <span className="text-sm text-gray-400">{weather.current.condition}</span>
                    </div>
                    <p className="text-xs text-gray-500">
                      {weather.location} · Feels like {Math.round(weather.current.feelsLike)}° ·
                      Humidity {weather.current.humidity}% · Wind {weather.current.windSpeed}km/h
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  {weather.forecast.slice(1, 3).map((f) => (
                    <div key={f.date} className="text-center">
                      <p className="text-[10px] text-gray-500">
                        {new Date(f.date).toLocaleDateString("en-US", { weekday: "short" })}
                      </p>
                      <p className="text-xs text-gray-400">
                        {Math.round(f.maxTemp)}° / {Math.round(f.minTemp)}°
                      </p>
                      <p className="text-[10px] text-gray-500">{f.condition}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
            <Link
              href="/chat"
              className="bg-gradient-to-br from-blue-600/20 to-blue-800/10 border border-blue-500/30 rounded-xl p-5 hover:border-blue-400/50 transition"
            >
              <h3 className="font-semibold mb-1">Chat with EVE</h3>
              <p className="text-xs text-gray-400">Ask anything — email, scheduling, writing</p>
              <p className="text-xs text-gray-500 mt-2">Ask EVE anything</p>
            </Link>
            <Link
              href="/email"
              className="bg-gradient-to-br from-cyan-600/20 to-cyan-800/10 border border-cyan-500/30 rounded-xl p-5 hover:border-cyan-400/50 transition"
            >
              <h3 className="font-semibold mb-1">Email Inbox</h3>
              <p className="text-xs text-gray-400">
                {stats?.emails.unread ? `${stats.emails.unread} unread` : "All caught up"}
              </p>
              <p className="text-xs text-gray-500 mt-2">Check your emails</p>
            </Link>
            <Link
              href="/calendar"
              className="bg-gradient-to-br from-purple-600/20 to-purple-800/10 border border-purple-500/30 rounded-xl p-5 hover:border-purple-400/50 transition"
            >
              <h3 className="font-semibold mb-1">Today&apos;s Schedule</h3>
              <p className="text-xs text-gray-400">
                {stats?.calendar.today ? `${stats.calendar.today} events` : "No events today"}
              </p>
              <p className="text-xs text-gray-500 mt-2">Today&apos;s schedule</p>
            </Link>
          </div>

          {/* EVE Agent Insights */}
          {agentLogs.length > 0 && (
            <section className="mb-8">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm">🤖</span>
                  <h2 className="text-sm font-semibold text-gray-400">EVE Agent</h2>
                </div>
                <Link
                  href="/settings"
                  className="text-[10px] text-gray-500 hover:text-cyan-400 transition"
                >
                  Settings →
                </Link>
              </div>
              <div className="space-y-1.5">
                {agentLogs.map((log) => {
                  const actionStyle: Record<string, string> = {
                    notify: "bg-cyan-500/20 text-cyan-400",
                    tool_call: "bg-green-500/20 text-green-400",
                    auto_action: "bg-amber-500/20 text-amber-400",
                    error: "bg-red-500/20 text-red-400",
                    skip: "bg-gray-500/20 text-gray-500",
                  };
                  const actionLabel: Record<string, string> = {
                    notify: "Notify",
                    tool_call: "Execute",
                    auto_action: "Auto",
                    error: "Error",
                    skip: "Skip",
                  };
                  const discussLog = async () => {
                    try {
                      const convo = await apiFetch<{ id: string }>("/api/chat/conversations", {
                        method: "POST",
                        body: JSON.stringify({
                          initialMessage: `[I'd like to discuss this EVE agent activity]\n\nAction: ${actionLabel[log.action] || log.action}\nSummary: ${log.summary}\n\nPlease tell me more about this activity.`,
                        }),
                      });
                      router.push(`/chat/${convo.id}`);
                    } catch {
                      // silently fail
                    }
                  };
                  return (
                    <div
                      key={log.id}
                      className="bg-gray-900/60 border border-gray-800/60 rounded-lg px-4 py-2.5 flex items-center gap-3"
                    >
                      <span
                        className={`text-[10px] uppercase px-2 py-0.5 rounded font-medium ${actionStyle[log.action] || "bg-gray-500/20 text-gray-500"}`}
                      >
                        {actionLabel[log.action] || log.action}
                      </span>
                      <span className="text-sm flex-1 truncate">{log.summary}</span>
                      {log.tool && (
                        <span className="text-[10px] text-gray-500 shrink-0">{log.tool}</span>
                      )}
                      {log.action === "notify" && (
                        <button
                          type="button"
                          onClick={discussLog}
                          className="text-[10px] text-cyan-400 hover:text-cyan-300 hover:underline shrink-0"
                        >
                          Chat →
                        </button>
                      )}
                      <RelativeTime
                        date={log.createdAt}
                        className="text-[10px] text-gray-600 shrink-0"
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Activity Feed */}
          {activity.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-400 mb-3">Recent Activity</h2>
              <div className="space-y-1.5">
                {activity.map((a) => (
                  <div
                    key={`${a.type}-${a.title}-${a.createdAt}`}
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
