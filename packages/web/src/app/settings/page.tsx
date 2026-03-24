"use client";

import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Integration {
  name: string;
  description: string;
  connected: boolean;
  connectUrl?: string;
  statusUrl: string;
}

export default function SettingsPage() {
  const [googleConnected, setGoogleConnected] = useState(false);
  const [slackConnected, setSlackConnected] = useState(false);
  const [notionConnected, setNotionConnected] = useState(false);
  const [loading, setLoading] = useState(true);

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
    alert(data.briefing || "Briefing generated — check your Notes page.");
  };

  return (
    <main className="max-w-3xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold mb-2">Settings</h1>
      <p className="text-gray-400 text-sm mb-8">Manage integrations and preferences</p>

      {/* Integrations */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-4">Integrations</h2>
        <div className="space-y-3">
          {loading ? (
            <p className="text-gray-500">Loading...</p>
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
                  <span className="text-sm text-gray-500">
                    Set env vars to enable
                  </span>
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

      {/* About */}
      <section>
        <h2 className="text-lg font-semibold mb-4">About</h2>
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <p className="text-sm text-gray-400">
            <span className="text-blue-400 font-medium">EVE</span> — Your First AI Employee / 당신의 첫 번째 AI 직원
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
