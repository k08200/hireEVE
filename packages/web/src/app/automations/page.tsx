"use client";

import { useEffect, useState } from "react";
import AuthGuard from "../../components/auth-guard";
import { useToast } from "../../components/toast";
import { API_BASE, apiFetch, authHeaders } from "../../lib/api";

interface AutomationConfig {
  meetingAutoJoin: boolean;
  meetingAutoSummarize: boolean;
  emailAutoClassify: boolean;
  reminderAutoCheck: boolean;
  dailyBriefing: boolean;
  briefingTime: string;
  downloadAutoOrganize: boolean;
}

const DEFAULT_CONFIG: AutomationConfig = {
  meetingAutoJoin: true,
  meetingAutoSummarize: true,
  emailAutoClassify: false,
  reminderAutoCheck: true,
  dailyBriefing: true,
  briefingTime: "09:00",
  downloadAutoOrganize: false,
};

export default function AutomationsPage() {
  return (
    <AuthGuard>
      <AutomationsContent />
    </AuthGuard>
  );
}

function AutomationsContent() {
  const [config, setConfig] = useState<AutomationConfig>(DEFAULT_CONFIG);
  const [isMac, setIsMac] = useState(false);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    setIsMac(navigator.platform.toLowerCase().includes("mac"));
    apiFetch<AutomationConfig>("/api/automations")
      .then((data) => setConfig(data))
      .catch(() => {
        // Fallback to localStorage for offline/demo
        try {
          const stored = localStorage.getItem("eve-automations");
          if (stored) setConfig(JSON.parse(stored));
        } catch {
          // ignore
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const toggle = async (key: keyof AutomationConfig) => {
    const updated = { ...config, [key]: !config[key] };
    setConfig(updated);
    try {
      await apiFetch<AutomationConfig>("/api/automations", {
        method: "PATCH",
        body: JSON.stringify({ [key]: !config[key] }),
      });
    } catch {
      // Fallback to localStorage
      localStorage.setItem("eve-automations", JSON.stringify(updated));
    }
  };

  const updateTime = async (time: string) => {
    const updated = { ...config, briefingTime: time };
    setConfig(updated);
    try {
      await apiFetch<AutomationConfig>("/api/automations", {
        method: "PATCH",
        body: JSON.stringify({ briefingTime: time }),
      });
    } catch {
      localStorage.setItem("eve-automations", JSON.stringify(updated));
    }
  };

  const triggerBriefing = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/briefing/generate`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      toast(data.briefing ? "Briefing generated — check Notes" : "Briefing created", "success");
    } catch {
      toast("Failed to generate briefing", "error");
    }
  };

  const triggerOrganize = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/chat/conversations`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({}),
      });
      const convo = await res.json();
      await fetch(`${API_BASE}/api/chat/conversations/${convo.id}/messages`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ content: "다운로드 폴더 정리해줘" }),
      });
      toast("Organizing downloads... check chat for results", "success");
    } catch {
      toast("Failed to start organizing", "error");
    }
  };

  const automations = [
    {
      category: "Meeting / 미팅",
      color: "text-purple-400",
      items: [
        {
          key: "meetingAutoJoin" as const,
          title: "Auto-Join Meetings",
          titleKr: "미팅 자동 참석",
          description: "Automatically open Google Meet/Zoom links 1 minute before meeting starts",
          enabled: config.meetingAutoJoin,
          macOnly: false,
          extra: null as React.ReactNode,
        },
        {
          key: "meetingAutoSummarize" as const,
          title: "Auto-Summarize Meetings",
          titleKr: "미팅 자동 요약",
          description: "Create meeting notes with key points and action items after each meeting",
          enabled: config.meetingAutoSummarize,
          macOnly: false,
          extra: null as React.ReactNode,
        },
      ],
    },
    {
      category: "Email / 이메일",
      color: "text-blue-400",
      items: [
        {
          key: "emailAutoClassify" as const,
          title: "Auto-Classify Emails",
          titleKr: "이메일 자동 분류",
          description: "Automatically classify incoming emails by priority (urgent/normal/low)",
          enabled: config.emailAutoClassify,
          macOnly: false,
          extra: null as React.ReactNode,
        },
      ],
    },
    {
      category: "Productivity / 생산성",
      color: "text-green-400",
      items: [
        {
          key: "reminderAutoCheck" as const,
          title: "Reminder Monitoring",
          titleKr: "리마인더 자동 체크",
          description: "Check for due reminders every minute and send notifications",
          enabled: config.reminderAutoCheck,
          macOnly: false,
          extra: null as React.ReactNode,
        },
        {
          key: "dailyBriefing" as const,
          title: "Daily Briefing",
          titleKr: "일일 브리핑",
          description: "Auto-generate a morning briefing with tasks, calendar, and emails",
          enabled: config.dailyBriefing,
          macOnly: false,
          extra: (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-gray-500">Time:</span>
              <input
                type="time"
                value={config.briefingTime}
                onChange={(e) => updateTime(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={triggerBriefing}
                className="text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 px-2 py-1 rounded text-gray-400 hover:text-white transition"
              >
                Run Now
              </button>
            </div>
          ),
        },
      ],
    },
    {
      category: "macOS Native / 시스템",
      color: "text-yellow-400",
      items: [
        {
          key: "downloadAutoOrganize" as const,
          title: "Auto-Organize Downloads",
          titleKr: "다운로드 자동 정리",
          description: "Sort files in Downloads folder into categories (Images, Documents, etc.)",
          enabled: config.downloadAutoOrganize,
          macOnly: true,
          extra: (
            <button
              type="button"
              onClick={triggerOrganize}
              className="text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 px-2 py-1 rounded text-gray-400 hover:text-white transition mt-2"
            >
              Organize Now
            </button>
          ),
        },
      ],
    },
  ];

  if (loading) {
    return (
      <main className="max-w-3xl mx-auto px-6 py-10">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-800 rounded w-48" />
          <div className="h-4 bg-gray-800 rounded w-72" />
          <div className="h-20 bg-gray-800/60 rounded-xl" />
          <div className="h-20 bg-gray-800/60 rounded-xl" />
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-3xl mx-auto px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Automations</h1>
        <p className="text-gray-400 text-sm mt-1">
          Configure EVE&apos;s autonomous behaviors / 자율 행동 설정
        </p>
      </div>

      {/* Status bar */}
      <div className="bg-gray-900/80 border border-gray-800/60 rounded-xl p-4 mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-sm">
            Background Agent: <span className="text-green-400">Running</span>
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span>{Object.values(config).filter((v) => v === true).length} automations active</span>
          {isMac && (
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              macOS native enabled
            </span>
          )}
        </div>
      </div>

      <div className="space-y-8">
        {automations.map((section) => (
          <section key={section.category}>
            <h2 className={`text-sm font-semibold mb-3 ${section.color}`}>{section.category}</h2>
            <div className="space-y-3">
              {section.items.map((item) => (
                <div
                  key={item.key}
                  className={`bg-gray-900/80 border border-gray-800/60 rounded-xl p-4 ${
                    item.macOnly && !isMac ? "opacity-50" : ""
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-sm">{item.title}</h3>
                        <span className="text-xs text-gray-600">{item.titleKr}</span>
                        {item.macOnly && (
                          <span className="text-[10px] bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded">
                            macOS only
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">{item.description}</p>
                      {item.enabled && item.extra}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (item.macOnly && !isMac) {
                          toast("This feature requires macOS", "error");
                          return;
                        }
                        toggle(item.key);
                      }}
                      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ml-4 ${
                        item.enabled ? "bg-blue-600" : "bg-gray-700"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                          item.enabled ? "translate-x-5" : ""
                        }`}
                      />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Coming soon */}
      <section className="mt-10">
        <h2 className="text-sm font-semibold mb-3 text-gray-500">Coming Soon</h2>
        <div className="space-y-2">
          {[
            { title: "Smart Email Replies", desc: "Auto-draft replies for routine emails" },
            {
              title: "Meeting Transcription",
              desc: "Real-time audio transcription during calls",
            },
            {
              title: "Slack Auto-Response",
              desc: "Reply to common Slack questions automatically",
            },
            {
              title: "Desktop Widget",
              desc: "Always-on floating EVE widget on your desktop",
            },
            { title: "Voice Commands", desc: "Talk to EVE hands-free via microphone" },
            {
              title: "Phone Call Summary",
              desc: "Summarize iPhone calls received on Mac",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="bg-gray-900/50 border border-gray-800/50 rounded-lg p-3 opacity-60"
            >
              <h3 className="text-sm font-medium">{item.title}</h3>
              <p className="text-xs text-gray-600">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
