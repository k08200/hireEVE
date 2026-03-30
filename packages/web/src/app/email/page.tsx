"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import AuthGuard from "../../components/auth-guard";
import { useToast } from "../../components/toast";

import { API_BASE, apiFetch } from "../../lib/api";

interface Email {
  id: string;
  from: string;
  to: string;
  subject: string;
  snippet: string;
  body?: string;
  date: string;
  labels: string[];
  isRead: boolean;
  priority: "urgent" | "normal" | "low";
}

interface EmailStats {
  total: number;
  unread: number;
  urgent: number;
  today: number;
  source: "gmail" | "demo";
}

function formatEmailDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = diffMs / 3600000;

  if (diffHours < 1) return `${Math.floor(diffMs / 60000)}m ago`;
  if (diffHours < 24) return `${Math.floor(diffHours)}h ago`;
  if (diffHours < 48) return "Yesterday";
  return date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

function extractName(from: string): string {
  const match = from.match(/^([^<]+)</);
  if (match) return match[1].trim();
  return from.split("@")[0];
}

function extractDomain(from: string): string {
  const match = from.match(/@([^>]+)/);
  return match ? match[1] : "";
}

const priorityConfig = {
  urgent: { color: "text-red-400", bg: "bg-red-400/10", label: "Urgent" },
  normal: { color: "text-gray-400", bg: "", label: "" },
  low: { color: "text-gray-600", bg: "", label: "Low" },
};

export default function EmailPage() {
  const [emails, setEmails] = useState<Email[]>([]);
  const [stats, setStats] = useState<EmailStats | null>(null);
  const [filter, setFilter] = useState<"all" | "unread" | "urgent">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    const filterParam = filter === "all" ? "" : `&filter=${filter}`;
    Promise.all([
      apiFetch<{ emails: Email[] }>(`/api/email${filterParam ? `?filter=${filter}` : ""}`).catch(
        () => ({ emails: [] }),
      ),
      apiFetch<EmailStats>("/api/email/stats/summary").catch(() => null),
    ])
      .then(([emailData, statsData]) => {
        setEmails(emailData.emails || []);
        if (statsData) setStats(statsData);
      })
      .finally(() => setLoading(false));
  }, [filter]);

  const selected = emails.find((e) => e.id === selectedId);

  const askEveAboutEmail = (email: Email) => {
    // Navigate to chat and pre-fill with email context
    const query = encodeURIComponent(
      `이 이메일에 대해 답장을 써줘:\n\nFrom: ${email.from}\nSubject: ${email.subject}\n\n${email.snippet}`,
    );
    router.push(`/chat?prefill=${query}`);
  };

  return (
    <AuthGuard>
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Email</h1>
            <p className="text-gray-400 text-sm mt-1">
              Manage your inbox / 이메일 관리
              {stats && (
                <span className="ml-2 text-[10px] text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded">
                  {stats.source === "gmail" ? "Gmail connected" : "Demo mode"}
                </span>
              )}
            </p>
          </div>
          {stats?.source === "demo" && (
            <a
              href={`${API_BASE}/api/auth/google`}
              className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition border border-gray-700"
            >
              Connect Gmail
            </a>
          )}
        </div>

        {/* Stats Bar */}
        {stats && (
          <div className="grid grid-cols-4 gap-3 mb-6">
            {[
              { label: "Total", value: stats.total, color: "text-gray-300" },
              {
                label: "Unread",
                value: stats.unread,
                color: stats.unread > 0 ? "text-blue-400" : "text-gray-500",
              },
              {
                label: "Urgent",
                value: stats.urgent,
                color: stats.urgent > 0 ? "text-red-400" : "text-gray-500",
              },
              {
                label: "Today",
                value: stats.today,
                color: stats.today > 0 ? "text-green-400" : "text-gray-500",
              },
            ].map((s) => (
              <div
                key={s.label}
                className="bg-gray-900/80 border border-gray-800/60 rounded-xl p-3 text-center"
              >
                <p className="text-[10px] text-gray-500 uppercase">{s.label}</p>
                <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Filter Tabs */}
        <div className="flex gap-1 mb-4">
          {(["all", "unread", "urgent"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => {
                setFilter(f);
                setSelectedId(null);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition capitalize ${filter === f ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"}`}
            >
              {f === "all"
                ? "All"
                : f === "unread"
                  ? `Unread${stats ? ` (${stats.unread})` : ""}`
                  : `Urgent${stats ? ` (${stats.urgent})` : ""}`}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="bg-gray-900/80 border border-gray-800/60 rounded-xl p-4 animate-pulse"
              >
                <div className="h-4 bg-gray-800 rounded w-1/3 mb-2" />
                <div className="h-3 bg-gray-800 rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex gap-4">
            {/* Email List */}
            <div className={`space-y-1 ${selectedId ? "w-1/2" : "w-full"} transition-all`}>
              {emails.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-500">No emails found / 이메일이 없습니다</p>
                </div>
              ) : (
                emails.map((email) => (
                  <button
                    key={email.id}
                    type="button"
                    onClick={() => setSelectedId(email.id === selectedId ? null : email.id)}
                    className={`w-full text-left rounded-lg p-4 transition ${
                      selectedId === email.id
                        ? "bg-blue-600/10 border border-blue-500/30"
                        : "bg-gray-900 border border-gray-800 hover:border-gray-600"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {/* Avatar */}
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                          !email.isRead ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400"
                        }`}
                      >
                        {extractName(email.from).charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-sm truncate ${!email.isRead ? "font-semibold" : "text-gray-300"}`}
                          >
                            {extractName(email.from)}
                          </span>
                          {email.priority !== "normal" && (
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded ${priorityConfig[email.priority].bg} ${priorityConfig[email.priority].color}`}
                            >
                              {priorityConfig[email.priority].label}
                            </span>
                          )}
                          <span className="text-[10px] text-gray-600 ml-auto shrink-0">
                            {formatEmailDate(email.date)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <p
                      className={`text-sm truncate ml-10 ${!email.isRead ? "text-gray-200" : "text-gray-400"}`}
                    >
                      {email.subject}
                    </p>
                    <p className="text-xs text-gray-500 truncate ml-10 mt-0.5">{email.snippet}</p>
                  </button>
                ))
              )}
            </div>

            {/* Email Detail Panel */}
            {selected && (
              <div className="w-1/2 bg-gray-900 border border-gray-800 rounded-xl p-6 sticky top-20 self-start">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-semibold">{selected.subject}</h2>
                    <div className="flex items-center gap-2 mt-2">
                      <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-xs font-bold">
                        {extractName(selected.from).charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{extractName(selected.from)}</p>
                        <p className="text-[10px] text-gray-500">{extractDomain(selected.from)}</p>
                      </div>
                      <span className="text-[10px] text-gray-600 ml-auto">
                        {new Date(selected.date).toLocaleString("ko-KR")}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    className="text-gray-500 hover:text-white transition"
                  >
                    x
                  </button>
                </div>

                {/* Labels */}
                <div className="flex gap-1 mb-4">
                  {selected.labels.map((label) => (
                    <span
                      key={label}
                      className="text-[10px] bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded"
                    >
                      {label.replace("CATEGORY_", "")}
                    </span>
                  ))}
                </div>

                {/* Body */}
                <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap border-t border-gray-800 pt-4">
                  {selected.snippet}
                  <p className="text-gray-500 mt-4 italic text-xs">
                    {stats?.source === "demo"
                      ? "Connect Gmail for full email content / Gmail 연결 시 전체 내용을 볼 수 있어요"
                      : ""}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex gap-2 mt-6 border-t border-gray-800 pt-4">
                  <button
                    type="button"
                    onClick={() => askEveAboutEmail(selected)}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition flex-1"
                  >
                    Ask EVE to Reply / EVE에게 답장 요청
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(
                        `From: ${selected.from}\nSubject: ${selected.subject}\n\n${selected.snippet}`,
                      );
                      toast("Copied to clipboard", "success");
                    }}
                    className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-2 rounded-lg text-sm transition"
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </AuthGuard>
  );
}
