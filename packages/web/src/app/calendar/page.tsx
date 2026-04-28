"use client";

import { useCallback, useEffect, useState } from "react";
import AuthGuard from "../../components/auth-guard";
import { apiFetch } from "../../lib/api";
import { captureClientError } from "../../lib/sentry";

interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string;
  location: string | null;
  meetingLink: string | null;
  allDay: boolean;
}

interface DayGroup {
  key: string;
  label: string;
  events: CalendarEvent[];
}

interface MeetingPrepPack {
  readiness: "ready" | "watch" | "needs_review";
  checklist: string[];
  relatedEmails: Array<{ id: string; from: string; subject: string; snippet: string | null }>;
  openTasks: Array<{ id: string; title: string; priority: string; dueDate: string | null }>;
  openCommitments: Array<{ id: string; title: string; owner: string; dueText: string | null }>;
}

export default function CalendarPage() {
  return (
    <AuthGuard>
      <CalendarView />
    </AuthGuard>
  );
}

function CalendarView() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ events: CalendarEvent[] }>("/api/calendar?days=14");
      setEvents(data.events);
    } catch (err) {
      captureClientError(err, { scope: "calendar.load" });
      setError("일정을 불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const syncNow = async () => {
    setSyncing(true);
    setError(null);
    try {
      await apiFetch("/api/calendar/sync", { method: "POST", body: JSON.stringify({}) });
      await loadEvents();
    } catch (err) {
      captureClientError(err, { scope: "calendar.sync" });
      setError("Google Calendar 동기화에 실패했어요.");
    } finally {
      setSyncing(false);
    }
  };

  const groups = groupByDay(events);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 md:py-10">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold text-gray-100">캘린더</h1>
          <p className="text-xs text-gray-500 mt-1">앞으로 14일 일정</p>
        </div>
        <button
          type="button"
          onClick={syncNow}
          disabled={syncing}
          className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800 disabled:opacity-50 transition"
        >
          {syncing ? "동기화 중..." : "지금 동기화"}
        </button>
      </header>

      {loading && <p className="text-sm text-gray-500">로딩 중...</p>}

      {error && (
        <div className="mb-4 rounded-lg border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {!loading && !error && events.length === 0 && (
        <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-6 text-center">
          <p className="text-sm text-gray-400 mb-3">앞으로 14일 동안 일정이 없어요.</p>
          <button
            type="button"
            onClick={syncNow}
            disabled={syncing}
            className="text-sm px-4 py-2 rounded-lg bg-white text-black hover:bg-gray-200 disabled:opacity-50 transition"
          >
            {syncing ? "동기화 중..." : "Google Calendar에서 가져오기"}
          </button>
        </div>
      )}

      {!loading && events.length > 0 && (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.key}>
              <h2 className="sticky top-0 z-10 -mx-4 px-4 py-2 bg-[#0a0a0f]/95 backdrop-blur text-[13px] font-medium text-gray-300">
                {g.label}
                <span className="ml-2 text-[11px] text-gray-500 font-normal">
                  {g.events.length}건
                </span>
              </h2>
              <ul className="space-y-2 mt-2">
                {g.events.map((ev) => (
                  <EventRow key={ev.id} event={ev} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function EventRow({ event }: { event: CalendarEvent }) {
  const [prepOpen, setPrepOpen] = useState(false);
  const [prepLoading, setPrepLoading] = useState(false);
  const [prep, setPrep] = useState<MeetingPrepPack | null>(null);
  const [prepError, setPrepError] = useState<string | null>(null);
  const start = new Date(event.startTime);
  const end = new Date(event.endTime);
  const timeLabel = event.allDay ? "하루 종일" : `${formatTime(start)}–${formatTime(end)}`;

  const togglePrep = async () => {
    if (prepOpen) {
      setPrepOpen(false);
      return;
    }
    setPrepOpen(true);
    if (prep) return;
    setPrepLoading(true);
    setPrepError(null);
    try {
      setPrep(await apiFetch<MeetingPrepPack>(`/api/calendar/${event.id}/prep-pack`));
    } catch (err) {
      captureClientError(err, { scope: "calendar.prep_pack", eventId: event.id });
      setPrepError("준비팩을 만들지 못했어요.");
    } finally {
      setPrepLoading(false);
    }
  };

  return (
    <li className="rounded-lg border border-gray-800 bg-gray-900/40 p-3 active:bg-gray-900/70 transition">
      <div className="flex items-start gap-3">
        <div className="text-[12px] font-medium text-gray-400 shrink-0 w-20 pt-0.5 tabular-nums">
          {timeLabel}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-gray-100 leading-snug">{event.title || "제목 없음"}</p>
          {event.location && (
            <p className="text-xs text-gray-500 truncate mt-0.5">{event.location}</p>
          )}
          {event.meetingLink && (
            <a
              href={event.meetingLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 mt-1"
            >
              미팅 참여
              <svg
                aria-hidden="true"
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          )}
          <button
            type="button"
            onClick={togglePrep}
            className="ml-3 inline-flex items-center gap-1 text-xs text-violet-300 hover:text-violet-200 mt-1"
          >
            준비팩
          </button>
        </div>
      </div>
      {prepOpen && (
        <div className="mt-3 pt-3 border-t border-gray-800">
          {prepLoading && <p className="text-xs text-gray-500">준비팩 생성 중...</p>}
          {prepError && <p className="text-xs text-red-300">{prepError}</p>}
          {prep && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span
                  className={`text-[11px] font-medium rounded px-1.5 py-0.5 border ${readinessClass(
                    prep.readiness,
                  )}`}
                >
                  {readinessLabel(prep.readiness)}
                </span>
                <span className="text-[11px] text-gray-500">
                  메일 {prep.relatedEmails.length} · 할 일 {prep.openTasks.length} · 약속{" "}
                  {prep.openCommitments.length}
                </span>
              </div>
              <ul className="space-y-1">
                {prep.checklist.map((item) => (
                  <li key={item} className="text-xs text-gray-300">
                    {item}
                  </li>
                ))}
              </ul>
              {prep.relatedEmails.length > 0 && (
                <div>
                  <p className="text-[11px] text-gray-500 mb-1">관련 메일</p>
                  <ul className="space-y-1">
                    {prep.relatedEmails.map((email) => (
                      <li key={email.id} className="text-xs text-gray-300 truncate">
                        {email.subject}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {prep.openTasks.length > 0 && (
                <div>
                  <p className="text-[11px] text-gray-500 mb-1">미팅 전 할 일</p>
                  <ul className="space-y-1">
                    {prep.openTasks.map((task) => (
                      <li key={task.id} className="text-xs text-gray-300 truncate">
                        {task.title}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function readinessLabel(readiness: MeetingPrepPack["readiness"]): string {
  switch (readiness) {
    case "ready":
      return "준비됨";
    case "watch":
      return "확인 필요";
    case "needs_review":
      return "준비 필요";
  }
}

function readinessClass(readiness: MeetingPrepPack["readiness"]): string {
  switch (readiness) {
    case "ready":
      return "text-emerald-300 bg-emerald-500/10 border-emerald-500/20";
    case "watch":
      return "text-amber-300 bg-amber-400/10 border-amber-400/20";
    case "needs_review":
      return "text-red-300 bg-red-500/10 border-red-500/20";
  }
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function groupByDay(events: CalendarEvent[]): DayGroup[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today.getTime() + 86400000);

  const groups = new Map<string, DayGroup>();
  for (const ev of events) {
    const d = new Date(ev.startTime);
    const dayKey = dayKeyFor(d);
    if (!groups.has(dayKey)) {
      groups.set(dayKey, { key: dayKey, label: dayLabel(d, today, tomorrow), events: [] });
    }
    groups.get(dayKey)?.events.push(ev);
  }
  return [...groups.values()];
}

function dayKeyFor(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayLabel(d: Date, today: Date, tomorrow: Date): string {
  if (sameDay(d, today)) return "오늘";
  if (sameDay(d, tomorrow)) return "내일";
  return d.toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
