"use client";

import { useEffect, useState } from "react";
import { useConfirm } from "../../components/confirm-dialog";
import { ListSkeleton } from "../../components/skeleton";
import { useToast } from "../../components/toast";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Integration {
  name: string;
  description: string;
  connected: boolean;
  connectUrl?: string;
  statusUrl: string;
}

interface UserProfile {
  name: string;
  language: "en" | "ko" | "auto";
  timezone: string;
}

const TIMEZONES = [
  "Asia/Seoul",
  "Asia/Tokyo",
  "America/New_York",
  "America/Los_Angeles",
  "America/Chicago",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Australia/Sydney",
  "Pacific/Auckland",
];

export default function SettingsPage() {
  const [googleConnected, setGoogleConnected] = useState(false);
  const [slackConnected, setSlackConnected] = useState(false);
  const [notionConnected, setNotionConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile>({
    name: "",
    language: "auto",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  const [profileSaved, setProfileSaved] = useState(false);
  const { toast } = useToast();
  const { confirm } = useConfirm();

  // Load profile from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("eve-profile");
      if (stored) setProfile(JSON.parse(stored));
    } catch {
      // ignore
    }
  }, []);

  const saveProfile = () => {
    localStorage.setItem("eve-profile", JSON.stringify(profile));
    setProfileSaved(true);
    toast("Profile saved / 프로필 저장됨", "success");
    setTimeout(() => setProfileSaved(false), 2000);
  };

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/api/auth/google/status`)
        .then((r) => r.json())
        .then((d) => setGoogleConnected(d.connected))
        .catch(() => {}),
      fetch(`${API_BASE}/api/slack/status`)
        .then((r) => r.json())
        .then((d) => setSlackConnected(d.configured))
        .catch(() => {}),
      fetch(`${API_BASE}/api/notion/status`)
        .then((r) => r.json())
        .then((d) => setNotionConnected(d.configured))
        .catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  const integrations: Integration[] = [
    {
      name: "Google",
      description: "Gmail, Calendar — read emails, manage events",
      connected: googleConnected,
      connectUrl: `${API_BASE}/api/auth/google`,
      statusUrl: `${API_BASE}/api/auth/google/status`,
    },
    {
      name: "Slack",
      description: "Send messages, read channels, receive mentions",
      connected: slackConnected,
      statusUrl: `${API_BASE}/api/slack/status`,
    },
    {
      name: "Notion",
      description: "Search pages, create documents, access databases",
      connected: notionConnected,
      statusUrl: `${API_BASE}/api/notion/status`,
    },
  ];

  const generateBriefing = async () => {
    const res = await fetch(`${API_BASE}/api/briefing/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "demo-user" }),
    });
    const data = await res.json();
    toast(data.briefing || "Briefing generated — check your Notes page.", "success");
  };

  const clearAllData = async () => {
    const ok = await confirm({
      title: "Clear All Data / 전체 데이터 삭제",
      message:
        "This will delete all conversations, tasks, notes, contacts, and reminders. This cannot be undone. / 모든 대화, 할 일, 메모, 연락처, 리마인더가 삭제됩니다. 되돌릴 수 없습니다.",
      confirmLabel: "Delete Everything",
      danger: true,
    });
    if (!ok) return;
    try {
      await fetch(`${API_BASE}/api/user/demo-user/data`, { method: "DELETE" });
      localStorage.removeItem("eve-profile");
      localStorage.removeItem("eve-pinned-chats");
      toast("All data cleared / 모든 데이터 삭제됨", "info");
    } catch {
      toast("Failed to clear data", "error");
    }
  };

  const exportData = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/user/demo-user/export`);
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `eve-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast("Data exported / 데이터 내보내기 완료", "success");
    } catch {
      toast("Export failed", "error");
    }
  };

  return (
    <main className="max-w-3xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold mb-2">Settings</h1>
      <p className="text-gray-400 text-sm mb-8">
        Manage your profile, integrations, and preferences
      </p>

      {/* Profile */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-4">Profile / 프로필</h2>
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 space-y-4">
          <div>
            <label htmlFor="profile-name" className="block text-sm text-gray-400 mb-1">
              Display Name / 표시 이름
            </label>
            <input
              id="profile-name"
              type="text"
              value={profile.name}
              onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
              placeholder="Your name / 이름"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition placeholder-gray-500"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="profile-lang" className="block text-sm text-gray-400 mb-1">
                Language / 언어
              </label>
              <select
                id="profile-lang"
                value={profile.language}
                onChange={(e) =>
                  setProfile((p) => ({ ...p, language: e.target.value as UserProfile["language"] }))
                }
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition"
              >
                <option value="auto">Auto-detect</option>
                <option value="en">English</option>
                <option value="ko">Korean / 한국어</option>
              </select>
            </div>
            <div>
              <label htmlFor="profile-tz" className="block text-sm text-gray-400 mb-1">
                Timezone / 시간대
              </label>
              <select
                id="profile-tz"
                value={profile.timezone}
                onChange={(e) => setProfile((p) => ({ ...p, timezone: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={saveProfile}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                profileSaved
                  ? "bg-green-600 text-white"
                  : "bg-blue-600 hover:bg-blue-500 text-white"
              }`}
            >
              {profileSaved ? "Saved!" : "Save Profile / 저장"}
            </button>
          </div>
        </div>
      </section>

      {/* Integrations */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-4">Integrations</h2>
        <div className="space-y-3">
          {loading ? (
            <ListSkeleton count={3} />
          ) : (
            integrations.map((int) => (
              <div
                key={int.name}
                className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex items-center justify-between"
              >
                <div>
                  <h3 className="font-medium">{int.name}</h3>
                  <p className="text-sm text-gray-400">{int.description}</p>
                </div>
                {int.connected ? (
                  <span className="text-sm text-green-400 flex items-center gap-1">
                    <span className="w-2 h-2 bg-green-400 rounded-full" />
                    Connected
                  </span>
                ) : int.connectUrl ? (
                  <a
                    href={int.connectUrl}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
                  >
                    Connect
                  </a>
                ) : (
                  <span className="text-sm text-gray-500">Set env vars to enable</span>
                )}
              </div>
            ))
          )}
        </div>
      </section>

      {/* Quick Actions */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
        <div className="space-y-3">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex items-center justify-between">
            <div>
              <h3 className="font-medium">Daily Briefing</h3>
              <p className="text-sm text-gray-400">
                Generate a summary of your tasks, calendar, and emails
              </p>
            </div>
            <button
              type="button"
              onClick={generateBriefing}
              className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition border border-gray-700"
            >
              Generate Now
            </button>
          </div>
        </div>
      </section>

      {/* Capabilities */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-4">EVE Capabilities / 기능 목록</h2>
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-gray-400">
            <p>Email — read, send, classify by priority</p>
            <p>Calendar — events, conflicts, scheduling</p>
            <p>Tasks — CRUD, priorities, due dates</p>
            <p>Notes — memos, search, auto-save</p>
            <p>Reminders — timed alerts, dismiss</p>
            <p>Contacts — CRM, tags, search</p>
            <p>Web Search — research, news</p>
            <p>Document Writer — reports, proposals</p>
            <p>Slack — messages, channels</p>
            <p>Daily Briefing — auto summary</p>
            <p>Background Agent — auto monitoring</p>
            <p>Notifications — real-time alerts</p>
            <p>Notion — pages, databases, search</p>
          </div>
          <p className="text-xs text-gray-600 mt-3">36+ tools across 13 categories</p>
        </div>
      </section>

      {/* Data Management */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-4">Data / 데이터</h2>
        <div className="space-y-3">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex items-center justify-between">
            <div>
              <h3 className="font-medium">Export Data / 데이터 내보내기</h3>
              <p className="text-sm text-gray-400">Download all your data as JSON</p>
            </div>
            <button
              type="button"
              onClick={exportData}
              className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition border border-gray-700"
            >
              Export
            </button>
          </div>
        </div>
      </section>

      {/* Danger Zone */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-4 text-red-400">Danger Zone / 위험 구역</h2>
        <div className="bg-gray-900 border border-red-900/50 rounded-lg p-4 flex items-center justify-between">
          <div>
            <h3 className="font-medium">Delete All Data / 전체 삭제</h3>
            <p className="text-sm text-gray-400">
              Permanently delete all conversations, tasks, notes, contacts, and reminders
            </p>
          </div>
          <button
            type="button"
            onClick={clearAllData}
            className="bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white px-4 py-2 rounded-lg text-sm font-medium transition border border-red-900/50"
          >
            Delete All
          </button>
        </div>
      </section>

      {/* About */}
      <section>
        <h2 className="text-lg font-semibold mb-4">About</h2>
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <p className="text-sm text-gray-400">
            <span className="text-blue-400 font-medium">EVE</span> — Your First AI Employee / 당신의
            첫 번째 AI 직원
          </p>
          <p className="text-sm text-gray-500 mt-1">
            Built for solo founders who wear too many hats. / 1인 창업자를 위해 만들었습니다.
          </p>
          <p className="text-xs text-gray-600 mt-3">v0.2.0 — MVP</p>
        </div>
      </section>
    </main>
  );
}
