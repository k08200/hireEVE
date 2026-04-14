"use client";

import { useCallback, useEffect, useState } from "react";
import AuthGuard from "../../components/auth-guard";
import { useToast } from "../../components/toast";

import { API_BASE, apiFetch, authHeaders } from "../../lib/api";
import { useAuth } from "../../lib/auth";

interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string;
  location: string | null;
  meetingLink: string | null;
  color: string | null;
  allDay: boolean;
}

interface NewEvent {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  meetingLink: string;
  color: string;
}

const COLORS = [
  { value: "#3b82f6", label: "Blue" },
  { value: "#10b981", label: "Green" },
  { value: "#f59e0b", label: "Yellow" },
  { value: "#ef4444", label: "Red" },
  { value: "#8b5cf6", label: "Purple" },
  { value: "#ec4899", label: "Pink" },
];

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    weekday: "short",
  });
}

function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

function getDaysInWeek(baseDate: Date): Date[] {
  const start = new Date(baseDate);
  const day = start.getDay();
  start.setDate(start.getDate() - day); // Sunday
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function getMonthGrid(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay(); // 0=Sun
  const start = new Date(year, month, 1 - startOffset);
  // Always show 6 weeks (42 cells) for consistent grid height
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function formatMonthYear(year: number, month: number): string {
  return new Date(year, month).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

export default function CalendarPage() {
  const { googleConnected: cachedGoogle } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [view, setView] = useState<"week" | "month" | "list">("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [showCreate, setShowCreate] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(cachedGoogle); // null = loading
  const [newEvent, setNewEvent] = useState<NewEvent>({
    title: "",
    date: new Date().toISOString().split("T")[0],
    startTime: "09:00",
    endTime: "10:00",
    location: "",
    meetingLink: "",
    color: "#3b82f6",
  });
  const { toast } = useToast();

  // Compute fetch range based on view + currentDate
  const getFetchRange = (): { start: string; end: string } => {
    if (view === "month") {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const firstDay = new Date(year, month, 1);
      const startOffset = firstDay.getDay();
      const rangeStart = new Date(year, month, 1 - startOffset);
      const rangeEnd = new Date(rangeStart);
      rangeEnd.setDate(rangeEnd.getDate() + 42);
      return { start: rangeStart.toISOString(), end: rangeEnd.toISOString() };
    }
    // week or list: fetch surrounding 60 days
    const weekStart = new Date(currentDate);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() - 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 60);
    return { start: weekStart.toISOString(), end: weekEnd.toISOString() };
  };

  const fetchEvents = useCallback(() => {
    const { start, end } = getFetchRange();
    apiFetch<{ events: CalendarEvent[] }>(
      `/api/calendar?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
    )
      .then((d) => setEvents(d.events || []))
      .catch(() => toast("Failed to load calendar events", "error"));
  }, [view, currentDate, toast]);

  const syncGoogle = async () => {
    setSyncing(true);
    try {
      const res = await apiFetch<{ success?: boolean; error?: string; synced: number }>(
        "/api/calendar/sync",
        { method: "POST", body: JSON.stringify({}) },
      );
      if (res.error) {
        toast(res.error, "error");
      } else {
        toast(
          res.synced > 0
            ? `Google Calendar synced — ${res.synced} events`
            : "Google Calendar synced — no new events",
          "success",
        );
        fetchEvents();
      }
    } catch {
      toast("Sync failed — check Google connection in Settings", "error");
      // Refresh connection status in case token expired
      apiFetch<{ connected: boolean }>("/api/auth/google/status")
        .then((d) => setGoogleConnected(d.connected))
        .catch(() => setGoogleConnected(false));
    } finally {
      setSyncing(false);
    }
  };

  // Check Google connection status
  useEffect(() => {
    apiFetch<{ connected: boolean }>("/api/auth/google/status")
      .then((d) => setGoogleConnected(d.connected))
      .catch(() => setGoogleConnected(false));
  }, []);

  // Re-fetch when view or currentDate changes
  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const createEvent = async () => {
    if (!newEvent.title.trim()) {
      toast("Title is required", "error");
      return;
    }

    const startTime = new Date(`${newEvent.date}T${newEvent.startTime}:00`);
    const endTime = new Date(`${newEvent.date}T${newEvent.endTime}:00`);

    if (endTime <= startTime) {
      toast("End time must be after start time", "error");
      return;
    }

    try {
      await fetch(`${API_BASE}/api/calendar`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          title: newEvent.title,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          location: newEvent.location || undefined,
          meetingLink: newEvent.meetingLink || undefined,
          color: newEvent.color,
        }),
      });
      toast("Event created", "success");
      setShowCreate(false);
      setNewEvent({
        title: "",
        date: new Date().toISOString().split("T")[0],
        startTime: "09:00",
        endTime: "10:00",
        location: "",
        meetingLink: "",
        color: "#3b82f6",
      });
      fetchEvents();
    } catch {
      toast("Failed to create event", "error");
    }
  };

  const deleteEvent = async (id: string) => {
    await fetch(`${API_BASE}/api/calendar/${id}`, { method: "DELETE", headers: authHeaders() });
    setEvents((prev) => prev.filter((e) => e.id !== id));
    toast("Event deleted", "info");
  };

  const weekDays = getDaysInWeek(currentDate);
  const today = new Date();
  const monthGrid = getMonthGrid(currentDate.getFullYear(), currentDate.getMonth());

  const navigateWeek = (direction: number) => {
    const next = new Date(currentDate);
    next.setDate(next.getDate() + direction * 7);
    setCurrentDate(next);
  };

  const navigateMonth = (direction: number) => {
    const next = new Date(currentDate);
    next.setMonth(next.getMonth() + direction);
    setCurrentDate(next);
  };

  const getEventsForDay = (day: Date) =>
    events.filter((e) => isSameDay(new Date(e.startTime), day));

  const selectedDayEvents = getEventsForDay(selectedDate).sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );

  // Upcoming events (next 7 days)
  const upcoming = events
    .filter((e) => new Date(e.startTime) >= today)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    .slice(0, 10);

  return (
    <AuthGuard>
      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Calendar</h1>
            <p className="text-gray-400 text-sm mt-1">
              {googleConnected === true && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-900/40 text-green-400">
                  Google connected
                </span>
              )}
              {googleConnected === false && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-500">
                  Not connected
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {(["month", "week", "list"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition capitalize ${view === v ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"}`}
                >
                  {v}
                </button>
              ))}
            </div>
            {googleConnected === true ? (
              <button
                type="button"
                onClick={syncGoogle}
                disabled={syncing}
                className="text-sm text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-lg transition border border-gray-700 disabled:opacity-50"
              >
                {syncing ? "Syncing..." : "Sync"}
              </button>
            ) : googleConnected === false ? (
              <a
                href={`${API_BASE}/api/auth/google?token=${typeof window !== "undefined" ? localStorage.getItem("eve-token") || "" : ""}`}
                className="text-sm bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg transition font-medium"
              >
                Connect Google
              </a>
            ) : null}
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition"
            >
              + New Event
            </button>
          </div>
        </div>

        {/* Create Event Modal */}
        {showCreate && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md p-6">
              <h2 className="text-lg font-semibold mb-4">New Event</h2>
              <div className="space-y-3">
                <input
                  autoFocus
                  value={newEvent.title}
                  onChange={(e) => setNewEvent((p) => ({ ...p, title: e.target.value }))}
                  placeholder="Event title"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="date"
                    value={newEvent.date}
                    onChange={(e) => setNewEvent((p) => ({ ...p, date: e.target.value }))}
                    className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  />
                  <input
                    type="time"
                    value={newEvent.startTime}
                    onChange={(e) => setNewEvent((p) => ({ ...p, startTime: e.target.value }))}
                    className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  />
                  <input
                    type="time"
                    value={newEvent.endTime}
                    onChange={(e) => setNewEvent((p) => ({ ...p, endTime: e.target.value }))}
                    className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
                <input
                  value={newEvent.location}
                  onChange={(e) => setNewEvent((p) => ({ ...p, location: e.target.value }))}
                  placeholder="Location (optional)"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
                <input
                  value={newEvent.meetingLink}
                  onChange={(e) => setNewEvent((p) => ({ ...p, meetingLink: e.target.value }))}
                  placeholder="Meeting link (optional)"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
                <div className="flex gap-2">
                  {COLORS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setNewEvent((p) => ({ ...p, color: c.value }))}
                      className={`w-7 h-7 rounded-full transition ${newEvent.color === c.value ? "ring-2 ring-white ring-offset-2 ring-offset-gray-900" : ""}`}
                      style={{ backgroundColor: c.value }}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-5">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={createEvent}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        {view !== "list" && (
          <div className="flex items-center justify-between mb-4">
            <button
              type="button"
              onClick={() => (view === "month" ? navigateMonth(-1) : navigateWeek(-1))}
              className="text-gray-400 hover:text-white transition px-3 py-1"
            >
              &larr; Prev
            </button>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-300">
                {view === "month"
                  ? formatMonthYear(currentDate.getFullYear(), currentDate.getMonth())
                  : `${weekDays[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} — ${weekDays[6].toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
              </span>
              <button
                type="button"
                onClick={() => {
                  setCurrentDate(new Date());
                  setSelectedDate(new Date());
                }}
                className="text-xs text-blue-400 hover:text-blue-300 transition px-3 py-1"
              >
                Today
              </button>
            </div>
            <button
              type="button"
              onClick={() => (view === "month" ? navigateMonth(1) : navigateWeek(1))}
              className="text-gray-400 hover:text-white transition px-3 py-1"
            >
              Next &rarr;
            </button>
          </div>
        )}

        {/* Month View */}
        {view === "month" && (
          <div className="border border-gray-800 rounded-xl overflow-hidden">
            {/* Weekday headers */}
            <div className="grid grid-cols-7 border-b border-gray-800">
              {WEEKDAY_LABELS.map((d) => (
                <div
                  key={d}
                  className="p-2 text-center text-[10px] text-gray-500 uppercase font-medium"
                >
                  {d}
                </div>
              ))}
            </div>
            {/* Day cells */}
            <div className="grid grid-cols-7">
              {monthGrid.map((day) => {
                const isCurrentMonth = day.getMonth() === currentDate.getMonth();
                const isToday = isSameDay(day, today);
                const isSelected = isSameDay(day, selectedDate);
                const dayEvents = getEventsForDay(day);

                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    onClick={() => setSelectedDate(day)}
                    className={`relative border-b border-r border-gray-800/50 p-2 min-h-[80px] text-left transition hover:bg-gray-800/40 ${
                      !isCurrentMonth ? "opacity-30" : ""
                    } ${isSelected ? "bg-blue-600/10 ring-1 ring-blue-500/40" : ""}`}
                  >
                    <span
                      className={`text-xs font-medium ${
                        isToday
                          ? "bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center"
                          : isSelected
                            ? "text-blue-400"
                            : "text-gray-400"
                      }`}
                    >
                      {day.getDate()}
                    </span>
                    {/* Event dots / titles */}
                    <div className="mt-1 space-y-0.5">
                      {dayEvents.slice(0, 3).map((ev) => (
                        <div key={ev.id} className="flex items-center gap-1 truncate">
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: ev.color || "#3b82f6" }}
                          />
                          <span className="text-[10px] text-gray-300 truncate">{ev.title}</span>
                        </div>
                      ))}
                      {dayEvents.length > 3 && (
                        <span className="text-[9px] text-gray-500">
                          +{dayEvents.length - 3} more
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {view === "week" && (
          /* Week View */
          <div
            className="border border-gray-800 rounded-xl overflow-hidden flex flex-col"
            style={{ maxHeight: "calc(100vh - 200px)" }}
          >
            {/* Day headers */}
            <div className="grid grid-cols-8 border-b border-gray-800">
              <div className="p-2 text-xs text-gray-600 text-center">Time</div>
              {weekDays.map((day) => (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => setSelectedDate(day)}
                  className={`p-2 text-center border-l border-gray-800 transition hover:bg-gray-800/40 ${isSameDay(day, today) ? "bg-blue-600/10" : ""} ${isSameDay(day, selectedDate) ? "ring-1 ring-blue-500/40" : ""}`}
                >
                  <p className="text-[10px] text-gray-500 uppercase">
                    {day.toLocaleDateString("en", { weekday: "short" })}
                  </p>
                  <p
                    className={`text-sm font-medium ${isSameDay(day, today) ? "text-blue-400" : ""}`}
                  >
                    {day.getDate()}
                  </p>
                </button>
              ))}
            </div>

            {/* Time grid */}
            <div
              className="grid grid-cols-8 relative overflow-y-auto flex-1"
              style={{ height: "720px" }}
            >
              {/* Hour labels */}
              <div className="relative">
                {HOURS.filter((h) => h >= 6 && h <= 23).map((h) => (
                  <div
                    key={h}
                    className="absolute w-full text-right pr-2 text-[10px] text-gray-600"
                    style={{ top: `${(h - 6) * 40}px` }}
                  >
                    {h.toString().padStart(2, "0")}:00
                  </div>
                ))}
              </div>

              {/* Day columns */}
              {weekDays.map((day) => {
                const dayEvents = getEventsForDay(day);
                return (
                  <div key={day.toISOString()} className="relative border-l border-gray-800">
                    {/* Hour lines */}
                    {HOURS.filter((h) => h >= 6 && h <= 23).map((h) => (
                      <div
                        key={h}
                        className="absolute w-full border-t border-gray-800/50"
                        style={{ top: `${(h - 6) * 40}px` }}
                      />
                    ))}

                    {/* Events */}
                    {dayEvents.map((event) => {
                      const startHour = new Date(event.startTime).getHours();
                      const startMin = new Date(event.startTime).getMinutes();
                      const endHour = new Date(event.endTime).getHours();
                      const endMin = new Date(event.endTime).getMinutes();
                      const top = (startHour - 6 + startMin / 60) * 40;
                      const height = Math.max(
                        (endHour - startHour + (endMin - startMin) / 60) * 40,
                        18,
                      );

                      if (startHour < 6) return null;

                      return (
                        <div
                          key={event.id}
                          className="absolute left-0.5 right-0.5 rounded px-1 py-0.5 text-[10px] leading-tight overflow-hidden cursor-pointer group"
                          style={{
                            top: `${top}px`,
                            height: `${height}px`,
                            backgroundColor: `${event.color || "#3b82f6"}20`,
                            borderLeft: `2px solid ${event.color || "#3b82f6"}`,
                          }}
                          title={`${event.title}\n${formatTime(event.startTime)} - ${formatTime(event.endTime)}${event.location ? `\n${event.location}` : ""}`}
                        >
                          <span className="font-medium text-gray-200 block truncate">
                            {event.title}
                          </span>
                          {height > 24 && (
                            <span className="text-gray-500">{formatTime(event.startTime)}</span>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteEvent(event.id);
                            }}
                            className="absolute top-0.5 right-0.5 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition"
                          >
                            x
                          </button>
                        </div>
                      );
                    })}

                    {/* Current time line */}
                    {isSameDay(day, today) && (
                      <div
                        className="absolute left-0 right-0 border-t-2 border-red-500 z-10"
                        style={{
                          top: `${(today.getHours() - 6 + today.getMinutes() / 60) * 40}px`,
                        }}
                      >
                        <div className="w-2 h-2 rounded-full bg-red-500 -mt-1 -ml-1" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {view === "list" && (
          /* List View */
          <div className="space-y-2">
            {upcoming.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500">No upcoming events</p>
                <button
                  type="button"
                  onClick={() => setShowCreate(true)}
                  className="mt-4 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm transition"
                >
                  Create your first event
                </button>
              </div>
            ) : (
              upcoming.map((event) => (
                <div
                  key={event.id}
                  className="bg-gray-900/80 border border-gray-800/60 rounded-xl p-4 flex items-center gap-4 group hover:border-gray-600 transition"
                >
                  <div
                    className="w-1 h-12 rounded-full shrink-0"
                    style={{ backgroundColor: event.color || "#3b82f6" }}
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm truncate">{event.title}</h3>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-gray-400">
                        {formatDate(event.startTime)} {formatTime(event.startTime)} -{" "}
                        {formatTime(event.endTime)}
                      </span>
                      {event.location && (
                        <span className="text-xs text-gray-500 truncate">{event.location}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {event.meetingLink && (
                      <a
                        href={event.meetingLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-400 hover:text-blue-300 transition"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Join
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => deleteEvent(event.id)}
                      className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition text-sm"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Selected Date Schedule */}
        <div className="mt-8 bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-400">
              {isSameDay(selectedDate, today)
                ? "Today's Schedule"
                : selectedDate.toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })}
            </h2>
            {!isSameDay(selectedDate, today) && (
              <button
                type="button"
                onClick={() => setSelectedDate(new Date())}
                className="text-[10px] text-blue-400 hover:text-blue-300 transition"
              >
                Back to today
              </button>
            )}
          </div>
          {selectedDayEvents.length === 0 ? (
            <p className="text-sm text-gray-500">No events</p>
          ) : (
            <div className="space-y-2">
              {selectedDayEvents.map((event) => {
                const now = new Date();
                const isPast = new Date(event.endTime) < now;
                const isCurrent = new Date(event.startTime) <= now && new Date(event.endTime) > now;
                return (
                  <div
                    key={event.id}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg group ${isCurrent ? "bg-blue-600/10 border border-blue-500/30" : isPast ? "opacity-50" : ""}`}
                  >
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: event.color || "#3b82f6" }}
                    />
                    <span className="text-xs text-gray-500 w-24 shrink-0">
                      {formatTime(event.startTime)} - {formatTime(event.endTime)}
                    </span>
                    <span
                      className={`text-sm flex-1 ${isCurrent ? "text-blue-300 font-medium" : ""}`}
                    >
                      {event.title}
                    </span>
                    {isCurrent && (
                      <span className="text-[10px] bg-blue-600/20 text-blue-400 px-1.5 py-0.5 rounded">
                        NOW
                      </span>
                    )}
                    {event.meetingLink && (
                      <a
                        href={event.meetingLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-blue-400 hover:text-blue-300"
                      >
                        Join
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => deleteEvent(event.id)}
                      className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition text-xs"
                    >
                      Delete
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </AuthGuard>
  );
}
