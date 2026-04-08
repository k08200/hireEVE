"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import AuthGuard from "../../components/auth-guard";
import { useToast } from "../../components/toast";
import { apiFetch } from "../../lib/api";

// ─── Types ────────────────────────────────────────────────────────────────

interface Email {
  id: string;
  gmailId?: string;
  threadId?: string;
  from: string;
  to: string;
  subject: string;
  snippet: string;
  body?: string;
  date: string;
  labels: string[];
  isRead: boolean;
  isStarred?: boolean;
  priority: "URGENT" | "NORMAL" | "LOW";
  category?: string;
  summary?: string;
  keyPoints?: string[];
  actionItems?: string[];
  sentiment?: string;
}

interface EmailStats {
  total: number;
  unread: number;
  urgent: number;
  today: number;
  categories?: Record<string, number>;
  source: "gmail" | "demo";
}

interface EmailRule {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  conditions: { from?: string[]; subjectContains?: string[]; category?: string[] };
  actionType: string;
  actionValue: string;
  triggerCount: number;
  lastTriggeredAt?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatEmailDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = diffMs / 3600000;
  if (diffHours < 1) return `${Math.max(1, Math.floor(diffMs / 60000))}m ago`;
  if (diffHours < 24) return `${Math.floor(diffHours)}h ago`;
  if (diffHours < 48) return "Yesterday";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function extractName(from: string): string {
  const match = from.match(/^([^<]+)</);
  if (match) return match[1].trim().replace(/^["']|["']$/g, "");
  return from.split("@")[0];
}

const priorityConfig = {
  URGENT: {
    color: "text-red-400",
    bg: "bg-red-500/10 border-red-500/20",
    label: "Urgent",
    icon: "!!",
  },
  NORMAL: { color: "text-gray-400", bg: "", label: "", icon: "" },
  LOW: { color: "text-gray-600", bg: "bg-gray-700/30", label: "Low", icon: "" },
};

const categoryConfig: Record<string, { label: string; color: string }> = {
  billing: { label: "Billing", color: "text-yellow-400 bg-yellow-400/10" },
  meeting: { label: "Meeting", color: "text-blue-400 bg-blue-400/10" },
  engineering: { label: "Engineering", color: "text-green-400 bg-green-400/10" },
  conversation: { label: "Conversation", color: "text-purple-400 bg-purple-400/10" },
  automated: { label: "Automated", color: "text-gray-500 bg-gray-500/10" },
  newsletter: { label: "Newsletter", color: "text-gray-500 bg-gray-500/10" },
  personal: { label: "Personal", color: "text-pink-400 bg-pink-400/10" },
  business: { label: "Business", color: "text-cyan-400 bg-cyan-400/10" },
  other: { label: "Other", color: "text-gray-500 bg-gray-500/10" },
};

const sentimentIcon: Record<string, string> = {
  positive: "+",
  negative: "-",
  neutral: "~",
};

// ─── Main Component ───────────────────────────────────────────────────────

export default function EmailPage() {
  const [emails, setEmails] = useState<Email[]>([]);
  const [stats, setStats] = useState<EmailStats | null>(null);
  const [filter, setFilter] = useState<"all" | "unread" | "urgent">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [loadingBody, setLoadingBody] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [tab, setTab] = useState<"inbox" | "rules">("inbox");

  // Compose
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [sending, setSending] = useState(false);

  // Rules
  const [rules, setRules] = useState<EmailRule[]>([]);
  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [newRule, setNewRule] = useState({ name: "", from: "", subject: "", actionValue: "" });

  const { toast } = useToast();
  const router = useRouter();

  // ─── Fetch Emails ───────────────────────────────────────────────────
  const fetchEmails = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter === "unread") params.set("filter", "unread");
    if (filter === "urgent") params.set("filter", "urgent");
    if (categoryFilter) params.set("category", categoryFilter);
    if (searchQuery) params.set("search", searchQuery);

    const qs = params.toString();
    Promise.all([
      apiFetch<{ emails: Email[] }>(`/api/email${qs ? `?${qs}` : ""}`).catch(() => ({
        emails: [],
      })),
      apiFetch<EmailStats>("/api/email/stats/summary").catch(() => null),
    ])
      .then(([emailData, statsData]) => {
        setEmails(emailData.emails || []);
        if (statsData) setStats(statsData);
      })
      .finally(() => setLoading(false));
  }, [filter, categoryFilter, searchQuery]);

  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  // ─── Fetch Rules ────────────────────────────────────────────────────
  useEffect(() => {
    if (tab === "rules") {
      apiFetch<{ rules: EmailRule[] }>("/api/email/rules")
        .then((d) => setRules(d.rules || []))
        .catch(() => {});
    }
  }, [tab]);

  // ─── Search Handler ─────────────────────────────────────────────────
  const handleSearch = () => {
    setSearchQuery(searchInput);
    setSelectedId(null);
  };

  // ─── Sync ───────────────────────────────────────────────────────────
  const handleSync = () => {
    setSyncing(true);
    apiFetch<{ synced: number; newCount: number; removed?: number; updated?: number }>(
      "/api/email/sync",
      { method: "POST", body: "{}" },
    )
      .then((d) => {
        const parts = [`${d.newCount} new`];
        if (d.removed) parts.push(`${d.removed} removed`);
        if (d.updated) parts.push(`${d.updated} updated`);
        toast(`Synced: ${parts.join(", ")} (${d.synced} checked)`, "success");
        fetchEmails();
      })
      .catch(() => toast("Sync failed", "error"))
      .finally(() => setSyncing(false));
  };

  // ─── Reconcile (clean up stale DB data) ────────────────────────────
  const [reconciling, setReconciling] = useState(false);
  const handleReconcile = () => {
    setReconciling(true);
    apiFetch<{ removed: number; updated: number }>("/api/email/reconcile", { method: "POST" })
      .then((d) => {
        toast(`Cleaned up ${d.removed} stale emails, updated ${d.updated}`, "success");
        fetchEmails();
      })
      .catch(() => toast("Reconcile failed", "error"))
      .finally(() => setReconciling(false));
  };

  // ─── Select Email ───────────────────────────────────────────────────
  const selectEmail = (id: string | null) => {
    if (id === selectedId) {
      setSelectedId(null);
      setSelectedEmail(null);
      return;
    }
    setSelectedId(id);
    if (id) {
      setLoadingBody(true);
      apiFetch<Email>(`/api/email/${id}`)
        .then((d) => setSelectedEmail(d))
        .catch(() => setSelectedEmail(null))
        .finally(() => setLoadingBody(false));
    }
  };

  // ─── Actions ────────────────────────────────────────────────────────
  const askEveAboutEmail = (email: Email) => {
    const q = encodeURIComponent(
      `Please write a reply to this email:\n\nFrom: ${email.from}\nSubject: ${email.subject}\n\n${email.snippet}`,
    );
    router.push(`/chat?prefill=${q}`);
  };

  const toggleStar = (email: Email) => {
    apiFetch(`/api/email/${email.id}/star`, {
      method: "PATCH",
      body: JSON.stringify({ isStarred: !email.isStarred }),
    })
      .then(() => fetchEmails())
      .catch(() => {});
  };

  const markRead = (email: Email, isRead: boolean) => {
    apiFetch(`/api/email/${email.id}/read`, {
      method: "PATCH",
      body: JSON.stringify({ isRead }),
    })
      .then(() => fetchEmails())
      .catch(() => {});
  };

  const deleteEmail = (email: Email) => {
    apiFetch<{ success?: boolean; warning?: string }>(`/api/email/${email.id}`, {
      method: "DELETE",
    })
      .then((res) => {
        toast(res.warning || "Email deleted", res.warning ? "info" : "success");
        setSelectedId(null);
        setSelectedEmail(null);
        fetchEmails();
      })
      .catch((err: Error) => toast(err.message || "Delete failed", "error"));
  };

  const archiveEmailAction = (email: Email) => {
    apiFetch<{ success?: boolean; warning?: string }>(`/api/email/${email.id}/archive`, {
      method: "POST",
    })
      .then((res) => {
        toast(res.warning || "Email archived", res.warning ? "info" : "success");
        setSelectedId(null);
        setSelectedEmail(null);
        fetchEmails();
      })
      .catch((err: Error) => toast(err.message || "Archive failed", "error"));
  };

  const handleSendEmail = () => {
    if (!composeTo || !composeSubject || !composeBody) {
      toast("Please fill in all fields", "error");
      return;
    }
    setSending(true);
    apiFetch<{ success?: boolean; error?: string }>("/api/email/send", {
      method: "POST",
      body: JSON.stringify({ to: composeTo, subject: composeSubject, body: composeBody }),
    })
      .then((d) => {
        if (d.success) {
          toast("Email sent successfully", "success");
          setComposeOpen(false);
          setComposeTo("");
          setComposeSubject("");
          setComposeBody("");
        } else toast(d.error || "Failed to send", "error");
      })
      .catch(() => toast("Failed to send", "error"))
      .finally(() => setSending(false));
  };

  // ─── Rule CRUD ──────────────────────────────────────────────────────
  const createRule = () => {
    if (!newRule.name || !newRule.actionValue) {
      toast("Please enter a name and reply template", "error");
      return;
    }
    const conditions: Record<string, string[]> = {};
    if (newRule.from) conditions.from = newRule.from.split(",").map((s) => s.trim());
    if (newRule.subject)
      conditions.subjectContains = newRule.subject.split(",").map((s) => s.trim());

    apiFetch<{ rule: EmailRule }>("/api/email/rules", {
      method: "POST",
      body: JSON.stringify({
        name: newRule.name,
        conditions,
        actionType: "AUTO_REPLY",
        actionValue: newRule.actionValue,
      }),
    })
      .then((d) => {
        setRules((prev) => [d.rule, ...prev]);
        setRuleModalOpen(false);
        setNewRule({ name: "", from: "", subject: "", actionValue: "" });
        toast("Auto-reply rule added", "success");
      })
      .catch(() => toast("Failed to add rule", "error"));
  };

  const toggleRule = (rule: EmailRule) => {
    apiFetch(`/api/email/rules/${rule.id}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: !rule.isActive }),
    })
      .then(() => {
        setRules((prev) =>
          prev.map((r) => (r.id === rule.id ? { ...r, isActive: !r.isActive } : r)),
        );
      })
      .catch(() => {});
  };

  const deleteRule = (id: string) => {
    apiFetch(`/api/email/rules/${id}`, { method: "DELETE" })
      .then(() => {
        setRules((prev) => prev.filter((r) => r.id !== id));
        toast("Rule deleted", "success");
      })
      .catch(() => {});
  };

  // ─── Category pills from stats ─────────────────────────────────────
  const categories = stats?.categories
    ? Object.entries(stats.categories).sort((a, b) => b[1] - a[1])
    : [];

  return (
    <AuthGuard>
      <main className="max-w-6xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Email</h1>
            <p className="text-gray-400 text-sm mt-1">
              {stats && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded ${stats.source === "gmail" ? "bg-green-900/40 text-green-400" : "bg-gray-800 text-gray-500"}`}
                >
                  {stats.source === "gmail" ? "Gmail connected" : "Demo mode"}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReconcile}
              disabled={reconciling}
              className="bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 px-3 py-2 rounded-lg text-sm transition border border-gray-700"
              title="Clean up stale emails (deleted/archived in Gmail)"
            >
              {reconciling ? "Cleaning..." : "Clean up"}
            </button>
            <button
              type="button"
              onClick={handleSync}
              disabled={syncing}
              className="bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 px-3 py-2 rounded-lg text-sm transition border border-gray-700"
            >
              {syncing ? "Syncing..." : "Sync"}
            </button>
            <button
              type="button"
              onClick={() => setComposeOpen(true)}
              className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
            >
              Compose
            </button>
          </div>
        </div>

        {/* Tab Switch */}
        <div className="flex gap-1 mb-4 border-b border-gray-800 pb-2">
          {(["inbox", "rules"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-t-lg text-sm font-medium transition ${tab === t ? "bg-gray-800 text-white" : "text-gray-500 hover:text-gray-300"}`}
            >
              {t === "inbox" ? `Inbox${stats ? ` (${stats.unread})` : ""}` : "Auto-Reply Rules"}
            </button>
          ))}
        </div>

        {tab === "inbox" ? (
          <>
            {/* Stats Bar */}
            {stats && (
              <div className="grid grid-cols-4 gap-3 mb-4">
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
                    <p className="text-[10px] text-gray-500">{s.label}</p>
                    <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Search Bar */}
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Search emails (sender, subject, content...)"
                className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none"
              />
              <button
                type="button"
                onClick={handleSearch}
                className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-2 rounded-lg text-sm transition"
              >
                Search
              </button>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput("");
                    setSearchQuery("");
                  }}
                  className="text-gray-500 hover:text-white text-sm px-2"
                >
                  Reset
                </button>
              )}
            </div>

            {/* Filter + Category */}
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              {(["all", "unread", "urgent"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => {
                    setFilter(f);
                    setSelectedId(null);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${filter === f ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"}`}
                >
                  {f === "all"
                    ? "All"
                    : f === "unread"
                      ? `Unread (${stats?.unread || 0})`
                      : `Urgent (${stats?.urgent || 0})`}
                </button>
              ))}
              <span className="text-gray-700 mx-1">|</span>
              {categories.slice(0, 6).map(([cat, count]) => {
                const cfg = categoryConfig[cat] || categoryConfig.other;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoryFilter(categoryFilter === cat ? "" : cat)}
                    className={`px-2 py-1 rounded text-[10px] font-medium transition ${categoryFilter === cat ? cfg.color + " ring-1 ring-current" : "text-gray-500 bg-gray-800 hover:text-gray-300"}`}
                  >
                    {cfg.label} ({count})
                  </button>
                );
              })}
            </div>

            {/* Email List + Detail */}
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((sk) => (
                  <div
                    key={sk}
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
                      <p className="text-gray-500">No emails found</p>
                      {searchQuery && (
                        <p className="text-gray-600 text-sm mt-1">
                          Search: &quot;{searchQuery}&quot;
                        </p>
                      )}
                    </div>
                  ) : (
                    emails.map((email) => (
                      <button
                        key={email.id}
                        type="button"
                        onClick={() => selectEmail(email.id === selectedId ? null : email.id)}
                        className={`w-full text-left rounded-lg p-4 transition ${selectedId === email.id ? "bg-blue-600/10 border border-blue-500/30" : `bg-gray-900 border border-gray-800 hover:border-gray-600 ${email.priority === "URGENT" ? "border-l-2 border-l-red-500" : ""}`}`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          {/* Avatar */}
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${!email.isRead ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400"}`}
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
                              {email.isStarred && (
                                <span className="text-yellow-400 text-xs">*</span>
                              )}
                              {email.priority !== "NORMAL" &&
                                priorityConfig[email.priority]?.label && (
                                  <span
                                    className={`text-[10px] px-1.5 py-0.5 rounded border ${priorityConfig[email.priority].bg} ${priorityConfig[email.priority].color}`}
                                  >
                                    {priorityConfig[email.priority].label}
                                  </span>
                                )}
                              {email.category && categoryConfig[email.category] && (
                                <span
                                  className={`text-[10px] px-1.5 py-0.5 rounded ${categoryConfig[email.category].color}`}
                                >
                                  {categoryConfig[email.category].label}
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
                        {/* AI Summary */}
                        {email.summary ? (
                          <p className="text-xs text-blue-400/80 truncate ml-10 mt-0.5">
                            AI: {email.summary}
                          </p>
                        ) : (
                          <p className="text-xs text-gray-500 truncate ml-10 mt-0.5">
                            {email.snippet}
                          </p>
                        )}
                        {/* Action Items badge */}
                        {email.actionItems && email.actionItems.length > 0 && (
                          <div className="ml-10 mt-1">
                            <span className="text-[10px] bg-orange-500/10 text-orange-400 px-1.5 py-0.5 rounded">
                              {email.actionItems.length} action items
                            </span>
                          </div>
                        )}
                      </button>
                    ))
                  )}
                </div>

                {/* Email Detail Panel */}
                {selectedId && (
                  <div className="w-1/2 bg-gray-900 border border-gray-800 rounded-xl p-6 sticky top-20 self-start max-h-[80vh] overflow-y-auto">
                    {loadingBody ? (
                      <div className="space-y-3 animate-pulse">
                        <div className="h-5 bg-gray-800 rounded w-3/4" />
                        <div className="h-3 bg-gray-800 rounded w-1/2" />
                        <div className="h-px bg-gray-800 my-4" />
                        <div className="h-3 bg-gray-800 rounded w-full" />
                        <div className="h-3 bg-gray-800 rounded w-4/5" />
                      </div>
                    ) : selectedEmail ? (
                      <>
                        {/* Header */}
                        <div className="flex items-start justify-between mb-4">
                          <h2 className="text-lg font-semibold flex-1 pr-4">
                            {selectedEmail.subject}
                          </h2>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedId(null);
                              setSelectedEmail(null);
                            }}
                            className="text-gray-500 hover:text-white transition text-lg"
                          >
                            x
                          </button>
                        </div>

                        {/* Sender info */}
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-10 h-10 rounded-full bg-blue-600/20 text-blue-400 flex items-center justify-center text-sm font-bold">
                            {extractName(selectedEmail.from).charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium">{extractName(selectedEmail.from)}</p>
                            <p className="text-[10px] text-gray-500">to: {selectedEmail.to}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] text-gray-500">
                              {new Date(selectedEmail.date).toLocaleString("en-US")}
                            </p>
                            {selectedEmail.sentiment && (
                              <span className="text-[10px] text-gray-600">
                                {sentimentIcon[selectedEmail.sentiment] || "~"}{" "}
                                {selectedEmail.sentiment}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* AI Summary Card */}
                        {(selectedEmail.summary ||
                          (selectedEmail.keyPoints && selectedEmail.keyPoints.length > 0)) && (
                          <div className="bg-blue-950/30 border border-blue-800/30 rounded-lg p-3 mb-4">
                            <p className="text-[10px] text-blue-400 font-medium mb-1">AI Summary</p>
                            {selectedEmail.summary && (
                              <p className="text-sm text-blue-300">{selectedEmail.summary}</p>
                            )}
                            {selectedEmail.keyPoints && selectedEmail.keyPoints.length > 0 && (
                              <ul className="mt-2 space-y-0.5">
                                {selectedEmail.keyPoints.map((kp, i) => (
                                  <li key={i} className="text-xs text-blue-300/70">
                                    - {kp}
                                  </li>
                                ))}
                              </ul>
                            )}
                            {selectedEmail.actionItems && selectedEmail.actionItems.length > 0 && (
                              <div className="mt-2 pt-2 border-t border-blue-800/30">
                                <p className="text-[10px] text-orange-400 font-medium">
                                  Action Items
                                </p>
                                {selectedEmail.actionItems.map((ai, i) => (
                                  <p key={i} className="text-xs text-orange-300/70">
                                    - {ai}
                                  </p>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Labels + Category */}
                        <div className="flex gap-1 flex-wrap mb-4">
                          {selectedEmail.priority !== "NORMAL" && (
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded border ${priorityConfig[selectedEmail.priority].bg} ${priorityConfig[selectedEmail.priority].color}`}
                            >
                              {priorityConfig[selectedEmail.priority].label}
                            </span>
                          )}
                          {selectedEmail.category && categoryConfig[selectedEmail.category] && (
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded ${categoryConfig[selectedEmail.category].color}`}
                            >
                              {categoryConfig[selectedEmail.category].label}
                            </span>
                          )}
                          {(selectedEmail.labels || [])
                            .filter((l) => !["INBOX", "UNREAD", "IMPORTANT", "STARRED"].includes(l))
                            .map((label) => (
                              <span
                                key={label}
                                className="text-[10px] bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded"
                              >
                                {label.replace("CATEGORY_", "")}
                              </span>
                            ))}
                        </div>

                        {/* Body */}
                        <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap border-t border-gray-800 pt-4 mb-4">
                          {selectedEmail.body || selectedEmail.snippet || "No content"}
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2 border-t border-gray-800 pt-4 flex-wrap">
                          <button
                            type="button"
                            onClick={() => askEveAboutEmail(selectedEmail)}
                            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition flex-1"
                          >
                            Ask EVE to reply
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleStar(selectedEmail)}
                            className={`px-3 py-2 rounded-lg text-sm transition ${selectedEmail.isStarred ? "bg-yellow-600/20 text-yellow-400" : "bg-gray-800 text-gray-400 hover:text-white"}`}
                          >
                            {selectedEmail.isStarred ? "* Unstar" : "* Star"}
                          </button>
                          <button
                            type="button"
                            onClick={() => markRead(selectedEmail, !selectedEmail.isRead)}
                            className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-2 rounded-lg text-sm transition"
                          >
                            {selectedEmail.isRead ? "Mark unread" : "Mark read"}
                          </button>
                          <button
                            type="button"
                            onClick={() => archiveEmailAction(selectedEmail)}
                            className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-2 rounded-lg text-sm transition"
                          >
                            Archive
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteEmail(selectedEmail)}
                            className="bg-red-900/30 hover:bg-red-800/40 text-red-400 px-3 py-2 rounded-lg text-sm transition"
                          >
                            Delete
                          </button>
                        </div>
                      </>
                    ) : (
                      <p className="text-gray-500">Failed to load email</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          /* ─── Rules Tab ─────────────────────────────────────────────── */
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-gray-400 text-sm">
                Automatically reply to emails matching conditions
              </p>
              <button
                type="button"
                onClick={() => setRuleModalOpen(true)}
                className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
              >
                Add Rule
              </button>
            </div>

            {rules.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500">No auto-reply rules yet</p>
                <p className="text-gray-600 text-sm mt-1">
                  Add a rule to automatically reply to matching emails
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {rules.map((rule) => (
                  <div
                    key={rule.id}
                    className={`bg-gray-900 border rounded-xl p-4 ${rule.isActive ? "border-gray-700" : "border-gray-800 opacity-60"}`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-medium">{rule.name}</h3>
                        {rule.description && (
                          <p className="text-xs text-gray-500 mt-0.5">{rule.description}</p>
                        )}
                        <div className="flex gap-2 mt-2 flex-wrap">
                          {rule.conditions.from?.map((f) => (
                            <span
                              key={f}
                              className="text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded"
                            >
                              from: {f}
                            </span>
                          ))}
                          {rule.conditions.subjectContains?.map((s) => (
                            <span
                              key={s}
                              className="text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded"
                            >
                              subject: {s}
                            </span>
                          ))}
                        </div>
                        <p className="text-xs text-gray-600 mt-1">
                          Used {rule.triggerCount} times
                          {rule.lastTriggeredAt &&
                            ` | Last: ${formatEmailDate(rule.lastTriggeredAt)}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => toggleRule(rule)}
                          className={`px-3 py-1 rounded text-xs transition ${rule.isActive ? "bg-green-900/40 text-green-400" : "bg-gray-800 text-gray-500"}`}
                        >
                          {rule.isActive ? "Active" : "Inactive"}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteRule(rule.id)}
                          className="text-gray-600 hover:text-red-400 text-xs transition"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 bg-gray-800/50 rounded p-2">
                      <p className="text-[10px] text-gray-500">Reply template:</p>
                      <p className="text-xs text-gray-400">{rule.actionValue}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* New Rule Modal */}
            {ruleModalOpen && (
              <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg">
                  <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
                    <h2 className="text-lg font-semibold">Add Auto-Reply Rule</h2>
                    <button
                      type="button"
                      onClick={() => setRuleModalOpen(false)}
                      className="text-gray-500 hover:text-white transition"
                    >
                      x
                    </button>
                  </div>
                  <div className="p-6 space-y-4">
                    <label className="block">
                      <span className="text-xs text-gray-500 mb-1 block">Rule name</span>
                      <input
                        type="text"
                        value={newRule.name}
                        onChange={(e) => setNewRule({ ...newRule, name: e.target.value })}
                        placeholder="e.g., Standard inquiry auto-response"
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs text-gray-500 mb-1 block">
                        Sender condition (comma-separated, optional)
                      </span>
                      <input
                        type="text"
                        value={newRule.from}
                        onChange={(e) => setNewRule({ ...newRule, from: e.target.value })}
                        placeholder="e.g., support@, help@company.com"
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs text-gray-500 mb-1 block">
                        Subject keywords (comma-separated, optional)
                      </span>
                      <input
                        type="text"
                        value={newRule.subject}
                        onChange={(e) => setNewRule({ ...newRule, subject: e.target.value })}
                        placeholder="e.g., inquiry, quote, support"
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs text-gray-500 mb-1 block">Reply template</span>
                      <textarea
                        value={newRule.actionValue}
                        onChange={(e) => setNewRule({ ...newRule, actionValue: e.target.value })}
                        placeholder="Thank you for your inquiry. We will review and respond promptly."
                        rows={4}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none resize-none"
                      />
                      <p className="text-[10px] text-gray-600 mt-1">
                        AI will generate a natural reply based on this template
                      </p>
                    </label>
                  </div>
                  <div className="flex gap-2 justify-end px-6 py-4 border-t border-gray-800">
                    <button
                      type="button"
                      onClick={() => setRuleModalOpen(false)}
                      className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={createRule}
                      className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Compose Modal */}
        {composeOpen && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
                <h2 className="text-lg font-semibold">New Email</h2>
                <button
                  type="button"
                  onClick={() => setComposeOpen(false)}
                  className="text-gray-500 hover:text-white transition"
                >
                  x
                </button>
              </div>
              <div className="p-6 space-y-4">
                <label className="block">
                  <span className="text-xs text-gray-500 mb-1 block">To</span>
                  <input
                    type="email"
                    value={composeTo}
                    onChange={(e) => setComposeTo(e.target.value)}
                    placeholder="email@example.com"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none"
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-gray-500 mb-1 block">Subject</span>
                  <input
                    type="text"
                    value={composeSubject}
                    onChange={(e) => setComposeSubject(e.target.value)}
                    placeholder="Email subject"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none"
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-gray-500 mb-1 block">Body</span>
                  <textarea
                    value={composeBody}
                    onChange={(e) => setComposeBody(e.target.value)}
                    placeholder="Type your message..."
                    rows={8}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none resize-none"
                  />
                </label>
              </div>
              <div className="flex gap-2 justify-end px-6 py-4 border-t border-gray-800">
                <button
                  type="button"
                  onClick={() => setComposeOpen(false)}
                  className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSendEmail}
                  disabled={sending}
                  className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
                >
                  {sending ? "Sending..." : "Send"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </AuthGuard>
  );
}
