"use client";

import { useEffect, useState } from "react";
import AuthGuard from "../../components/auth-guard";
import { useConfirm } from "../../components/confirm-dialog";
import { ListSkeleton } from "../../components/skeleton";
import { useToast } from "../../components/toast";
import { API_BASE, apiFetch, authHeaders } from "../../lib/api";
import { useAuth } from "../../lib/auth";

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
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [pushStatus, setPushStatus] = useState<"unsupported" | "default" | "granted" | "denied">(
    "default",
  );
  const [hasPassword, setHasPassword] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();
  const { confirm } = useConfirm();

  // Check push notification support and permission
  useEffect(() => {
    if (!("Notification" in window) || !("PushManager" in window)) {
      setPushStatus("unsupported");
    } else {
      setPushStatus(Notification.permission as "default" | "granted" | "denied");
    }
  }, []);

  // Check if user has a password set (OAuth users may not)
  useEffect(() => {
    apiFetch<{ hasPassword: boolean }>("/api/auth/has-password")
      .then((d) => setHasPassword(d.hasPassword))
      .catch(() => {});
  }, []);

  // Load profile from auth + localStorage
  useEffect(() => {
    if (user?.name) {
      setProfile((p) => ({ ...p, name: user.name || p.name }));
    }
    try {
      const stored = localStorage.getItem("eve-profile");
      if (stored) {
        const parsed = JSON.parse(stored);
        setProfile((p) => ({
          ...p,
          language: parsed.language || p.language,
          timezone: parsed.timezone || p.timezone,
        }));
      }
    } catch {
      // ignore
    }
  }, [user]);

  const saveProfile = async () => {
    // Save name to server
    try {
      await apiFetch("/api/auth/me", {
        method: "PATCH",
        body: JSON.stringify({ name: profile.name }),
      });
    } catch {
      // fallback to local only
    }
    // Save language/timezone to localStorage
    localStorage.setItem("eve-profile", JSON.stringify(profile));
    setProfileSaved(true);
    toast("Profile saved / 프로필 저장됨", "success");
    setTimeout(() => setProfileSaved(false), 2000);
  };

  const enablePush = async () => {
    if (!("Notification" in window)) return;
    const permission = await Notification.requestPermission();
    setPushStatus(permission as "granted" | "denied" | "default");
    if (permission === "granted") {
      toast("Push notifications enabled", "success");
      // Re-trigger subscription registration
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.ready;
        const res = await fetch(`${API_BASE}/api/notifications/vapid-key`);
        const { publicKey } = await res.json();
        if (publicKey) {
          const sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer,
          });
          const subJson = sub.toJSON();
          await fetch(`${API_BASE}/api/notifications/push/subscribe`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ endpoint: subJson.endpoint, keys: subJson.keys }),
          });
        }
      }
    } else if (permission === "denied") {
      toast("Push notifications blocked by browser", "error");
    }
  };

  const disablePush = async () => {
    if (!("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      await fetch(`${API_BASE}/api/notifications/push/unsubscribe`, {
        method: "DELETE",
        headers: authHeaders(),
        body: JSON.stringify({ endpoint }),
      });
    }
    setPushStatus("default");
    toast("Push notifications disabled", "info");
  };

  const setPasswordForOAuth = async () => {
    if (!newPassword) return;
    if (newPassword.length < 6) {
      toast("Password must be at least 6 characters", "error");
      return;
    }
    setPasswordLoading(true);
    try {
      await apiFetch("/api/auth/set-password", {
        method: "POST",
        body: JSON.stringify({ newPassword }),
      });
      toast("Password set successfully / 비밀번호 설정 완료", "success");
      setNewPassword("");
      setHasPassword(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed";
      toast(msg, "error");
    }
    setPasswordLoading(false);
  };

  const changePassword = async () => {
    if (!currentPassword || !newPassword) return;
    if (newPassword.length < 6) {
      toast("Password must be at least 6 characters", "error");
      return;
    }
    setPasswordLoading(true);
    try {
      await apiFetch("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      toast("Password changed / 비밀번호 변경됨", "success");
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed";
      const match = msg.match(/API \d+: (.+)/);
      const parsed = match
        ? (() => {
            try {
              return JSON.parse(match[1]).error;
            } catch {
              return match[1];
            }
          })()
        : msg;
      toast(parsed, "error");
    }
    setPasswordLoading(false);
  };

  const disconnectGoogle = async () => {
    const ok = await confirm({
      title: "Disconnect Google",
      message: "This will remove Gmail and Calendar access. You can reconnect anytime.",
      confirmLabel: "Disconnect",
      danger: true,
    });
    if (!ok) return;
    try {
      await fetch(`${API_BASE}/api/auth/google`, { method: "DELETE", headers: authHeaders() });
      setGoogleConnected(false);
      toast("Google disconnected", "info");
    } catch {
      toast("Failed to disconnect", "error");
    }
  };

  useEffect(() => {
    Promise.all([
      apiFetch<{ connected: boolean }>("/api/auth/google/status")
        .then((d) => setGoogleConnected(d.connected))
        .catch(() => {}),
      apiFetch<{ configured: boolean }>("/api/slack/status")
        .then((d) => setSlackConnected(d.configured))
        .catch(() => {}),
      apiFetch<{ configured: boolean }>("/api/notion/status")
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
      connectUrl: slackConnected ? undefined : "slack-coming-soon",
      statusUrl: `${API_BASE}/api/slack/status`,
    },
    {
      name: "Notion",
      description: "Search pages, create documents, access databases",
      connected: notionConnected,
      connectUrl: notionConnected ? undefined : "notion-coming-soon",
      statusUrl: `${API_BASE}/api/notion/status`,
    },
  ];

  const generateBriefing = async () => {
    const res = await fetch(`${API_BASE}/api/briefing/generate`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({}),
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
      await fetch(`${API_BASE}/api/user/me/data`, { method: "DELETE", headers: authHeaders() });
      localStorage.removeItem("eve-profile");
      localStorage.removeItem("eve-pinned-chats");
      toast("All data cleared / 모든 데이터 삭제됨", "info");
    } catch {
      toast("Failed to clear data", "error");
    }
  };

  const exportData = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/user/me/export`, { headers: authHeaders() });
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
    <AuthGuard>
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-xl font-bold mb-1">Settings</h1>
        <p className="text-gray-500 text-sm mb-6">
          Manage your profile, integrations, and preferences
        </p>

        {/* Profile */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-gray-300 mb-3">Profile / 프로필</h2>
          <div className="bg-gray-900/80 border border-gray-800/60 rounded-xl p-5 space-y-4">
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
                    setProfile((p) => ({
                      ...p,
                      language: e.target.value as UserProfile["language"],
                    }))
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

        {/* Security */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-gray-300 mb-3">Security / 보안</h2>
          <div className="bg-gray-900/80 border border-gray-800/60 rounded-xl p-5 space-y-4">
            {hasPassword ? (
              <>
                <div>
                  <label htmlFor="current-pw" className="block text-sm text-gray-400 mb-1">
                    Current Password / 현재 비밀번호
                  </label>
                  <input
                    id="current-pw"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Current password"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition placeholder-gray-500"
                  />
                </div>
                <div>
                  <label htmlFor="new-pw" className="block text-sm text-gray-400 mb-1">
                    New Password / 새 비밀번호
                  </label>
                  <input
                    id="new-pw"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    minLength={6}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition placeholder-gray-500"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={changePassword}
                    disabled={passwordLoading || !currentPassword || !newPassword}
                    className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
                  >
                    {passwordLoading ? "Changing..." : "Change Password / 변경"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-400">
                  You signed in with Google. Set a password to also log in with email.
                  <br />
                  <span className="text-gray-500">
                    Google로 가입하셨습니다. 이메일 로그인을 위해 비밀번호를 설정하세요.
                  </span>
                </p>
                <div>
                  <label htmlFor="set-pw" className="block text-sm text-gray-400 mb-1">
                    New Password / 비밀번호
                  </label>
                  <input
                    id="set-pw"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    minLength={6}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition placeholder-gray-500"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={setPasswordForOAuth}
                    disabled={passwordLoading || !newPassword}
                    className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
                  >
                    {passwordLoading ? "Setting..." : "Set Password / 설정"}
                  </button>
                </div>
              </>
            )}
          </div>
        </section>

        {/* Notifications */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-gray-300 mb-3">Notifications / 알림</h2>
          <div className="bg-gray-900/80 border border-gray-800/60 rounded-xl p-4 flex items-center justify-between">
            <div>
              <h3 className="font-medium">Push Notifications</h3>
              <p className="text-sm text-gray-400">
                {pushStatus === "unsupported"
                  ? "Not supported in this browser"
                  : pushStatus === "granted"
                    ? "Enabled — you'll receive alerts for reminders, briefings, and emails"
                    : pushStatus === "denied"
                      ? "Blocked by browser — update in browser settings"
                      : "Get notified about reminders, briefings, and important emails"}
              </p>
            </div>
            {pushStatus === "unsupported" || pushStatus === "denied" ? (
              <span className="text-sm text-gray-500 bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-700">
                {pushStatus === "denied" ? "Blocked" : "Unavailable"}
              </span>
            ) : pushStatus === "granted" ? (
              <button
                type="button"
                onClick={disablePush}
                className="text-sm text-gray-400 hover:text-red-400 bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg font-medium transition border border-gray-700"
              >
                Disable
              </button>
            ) : (
              <button
                type="button"
                onClick={enablePush}
                className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
              >
                Enable
              </button>
            )}
          </div>
        </section>

        {/* Integrations */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-gray-300 mb-3">Integrations</h2>
          <div className="space-y-3">
            {loading ? (
              <ListSkeleton count={3} />
            ) : (
              integrations.map((int) => (
                <div
                  key={int.name}
                  className="bg-gray-900/80 border border-gray-800/60 rounded-xl p-4 flex items-center justify-between"
                >
                  <div>
                    <h3 className="font-medium">{int.name}</h3>
                    <p className="text-sm text-gray-400">{int.description}</p>
                  </div>
                  {int.connected ? (
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-green-400 flex items-center gap-1">
                        <span className="w-2 h-2 bg-green-400 rounded-full" />
                        Connected
                      </span>
                      {int.name === "Google" && (
                        <button
                          type="button"
                          onClick={disconnectGoogle}
                          className="text-xs text-gray-500 hover:text-red-400 transition"
                        >
                          Disconnect
                        </button>
                      )}
                    </div>
                  ) : int.connectUrl?.endsWith("-coming-soon") ? (
                    <span className="text-sm text-gray-500 bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-700">
                      Coming Soon
                    </span>
                  ) : int.connectUrl ? (
                    <a
                      href={int.connectUrl}
                      className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
                    >
                      Connect
                    </a>
                  ) : (
                    <span className="text-sm text-gray-500 bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-700">
                      Coming Soon
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </section>

        {/* Quick Actions */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-gray-300 mb-3">Quick Actions</h2>
          <div className="space-y-3">
            <div className="bg-gray-900/80 border border-gray-800/60 rounded-xl p-4 flex items-center justify-between">
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
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-gray-300 mb-3">EVE Capabilities / 기능 목록</h2>
          <div className="bg-gray-900/80 border border-gray-800/60 rounded-xl p-4 space-y-4">
            <div>
              <p className="text-xs text-blue-400 font-medium mb-2">Productivity / 생산성</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-sm text-gray-400">
                <p>Tasks — priorities, due dates, status tracking</p>
                <p>Notes — markdown, categories, search</p>
                <p>Reminders — timed alerts, snooze, presets</p>
                <p>Contacts — CRM, tags, avatar, search</p>
                <p>Document Writer — reports, proposals, drafts</p>
                <p>Daily Briefing — auto-generated summary</p>
              </div>
            </div>
            <div>
              <p className="text-xs text-green-400 font-medium mb-2">Communication / 소통</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-sm text-gray-400">
                <p>Email — read, send, classify by priority</p>
                <p>Calendar — events, conflicts, scheduling</p>
                <p>Slack — messages, channels, threads</p>
                <p>Notion — pages, databases, search</p>
                <p>iMessage — send/read texts via macOS</p>
              </div>
            </div>
            <div>
              <p className="text-xs text-purple-400 font-medium mb-2">
                Meeting & Scheduling / 미팅
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-sm text-gray-400">
                <p>Auto-join — Google Meet, Zoom links</p>
                <p>Meeting Summary — key points, action items</p>
                <p>Calendar Conflicts — auto-detection</p>
              </div>
            </div>
            <div>
              <p className="text-xs text-yellow-400 font-medium mb-2">macOS Native / 시스템 연동</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-sm text-gray-400">
                <p>Clipboard — read/write copy-paste</p>
                <p>File Search — Spotlight search</p>
                <p>File Organizer — auto-sort Downloads</p>
                <p>Screenshot — capture screen</p>
                <p>System Info — battery, Wi-Fi, apps</p>
                <p>Web Search — research, news</p>
              </div>
            </div>
            <p className="text-xs text-gray-600 mt-1">50+ tools across 18 categories</p>
          </div>
        </section>

        {/* Data Management */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-gray-300 mb-3">Data / 데이터</h2>
          <div className="space-y-3">
            <div className="bg-gray-900/80 border border-gray-800/60 rounded-xl p-4 flex items-center justify-between">
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
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-gray-300 mb-3 text-red-400">
            Danger Zone / 위험 구역
          </h2>
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
          <h2 className="text-sm font-semibold text-gray-300 mb-3">About</h2>
          <div className="bg-gray-900/80 border border-gray-800/60 rounded-xl p-4">
            <p className="text-sm text-gray-400">
              <span className="text-blue-400 font-medium">EVE</span> — Your First AI Employee /
              당신의 첫 번째 AI 직원
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Built for solo founders who wear too many hats. / 1인 창업자를 위해 만들었습니다.
            </p>
            <p className="text-xs text-gray-600 mt-3">v0.2.0 — MVP</p>
          </div>
        </section>
      </main>
    </AuthGuard>
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    arr[i] = raw.charCodeAt(i);
  }
  return arr;
}
