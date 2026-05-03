"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import AuthGuard from "../../components/auth-guard";
import { apiFetch } from "../../lib/api";
import { captureClientError } from "../../lib/sentry";

type Filter = "all" | "reply-needed" | "urgent" | "unread" | "automated";

interface EmailRow {
  id: string;
  gmailId: string;
  from: string;
  subject: string;
  snippet: string | null;
  date: string;
  isRead: boolean;
  priority: "URGENT" | "NORMAL" | "LOW";
  category: string | null;
  summary: string | null;
  needsReply?: boolean;
}

interface ListResponse {
  emails: EmailRow[];
  source: "gmail" | "demo";
  total: number;
  unread: number;
}

const FILTERS: { key: Filter; label: string; query: string }[] = [
  { key: "all", label: "전체", query: "" },
  { key: "reply-needed", label: "답장 필요", query: "filter=reply-needed" },
  { key: "urgent", label: "긴급", query: "filter=urgent" },
  { key: "unread", label: "미처리", query: "filter=unread" },
  { key: "automated", label: "자동 분류", query: "category=automated" },
];

export default function EmailPage() {
  return (
    <AuthGuard>
      <EmailView />
    </AuthGuard>
  );
}

function EmailView() {
  const [filter, setFilter] = useState<Filter>("all");
  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [source, setSource] = useState<"gmail" | "demo" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (f: Filter) => {
    setLoading(true);
    setError(null);
    try {
      const q = FILTERS.find((x) => x.key === f)?.query || "";
      const path = `/api/email${q ? `?${q}` : ""}`;
      const data = await apiFetch<ListResponse>(path);
      setEmails(data.emails);
      setSource(data.source);
    } catch (err) {
      captureClientError(err, { scope: "email.load", filter: f });
      setError("메일을 불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(filter);
  }, [filter, load]);

  const syncNow = async () => {
    setSyncing(true);
    setError(null);
    try {
      await apiFetch("/api/email/sync", { method: "POST", body: JSON.stringify({}) });
      await load(filter);
    } catch (err) {
      captureClientError(err, { scope: "email.sync" });
      setError("Gmail 동기화에 실패했어요.");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 md:py-10">
      <header className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold text-gray-100">메일</h1>
          <p className="text-xs text-gray-500 mt-1">
            EVE가 분류한 내용을 확인하세요
            {source === "demo" && <span className="ml-2 text-amber-400">· 데모 데이터</span>}
          </p>
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

      <FilterTabs current={filter} onChange={setFilter} />

      {loading && <p className="text-sm text-gray-500 px-1 py-3">로딩 중...</p>}

      {error && (
        <div className="mt-3 rounded-lg border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {!loading && !error && emails.length === 0 && (
        <div className="mt-4 rounded-xl border border-gray-800 bg-gray-900/40 p-6 text-center">
          <p className="text-sm text-gray-400">
            {filter === "all" ? "받은 메일이 없어요." : "조건에 맞는 메일이 없어요."}
          </p>
        </div>
      )}

      {!loading && emails.length > 0 && (
        <ul className="mt-3 space-y-2">
          {emails.map((e) => (
            <EmailRowItem key={e.id} email={e} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterTabs({ current, onChange }: { current: Filter; onChange: (f: Filter) => void }) {
  return (
    <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-2 scrollbar-hide">
      {FILTERS.map((f) => {
        const active = f.key === current;
        return (
          <button
            key={f.key}
            type="button"
            onClick={() => onChange(f.key)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs transition min-h-[32px] ${
              active
                ? "bg-white text-black"
                : "bg-gray-900/60 border border-gray-800 text-gray-300 hover:bg-gray-800"
            }`}
          >
            {f.label}
          </button>
        );
      })}
    </div>
  );
}

function EmailRowItem({ email }: { email: EmailRow }) {
  const unread = !email.isRead;
  return (
    <li>
      <Link
        href={`/email/${email.id}`}
        className="block rounded-lg border border-gray-800 bg-gray-900/40 p-3 active:bg-gray-900/70 transition"
      >
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <PriorityBadge priority={email.priority} />
              {email.needsReply && <ReplyNeededBadge />}
              {email.category && <CategoryBadge category={email.category} />}
              {unread && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />}
            </div>
            <p
              className={`text-sm truncate mt-1.5 ${unread ? "text-gray-100 font-medium" : "text-gray-300"}`}
            >
              {senderName(email.from)}
            </p>
            <p className="text-xs text-gray-400 truncate mt-0.5">{email.subject || "제목 없음"}</p>
            {email.summary ? (
              <p className="text-[11px] text-cyan-400/80 line-clamp-2 mt-1">
                <span className="text-cyan-500 mr-1">EVE:</span>
                {email.summary}
              </p>
            ) : email.snippet ? (
              <p className="text-[11px] text-gray-500 line-clamp-2 mt-1">{email.snippet}</p>
            ) : null}
          </div>
          <time className="text-[11px] text-gray-500 shrink-0 tabular-nums pt-0.5">
            {formatRelative(email.date)}
          </time>
        </div>
      </Link>
    </li>
  );
}

function ReplyNeededBadge() {
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded border border-amber-400/30 bg-amber-400/10 text-amber-300 font-medium shrink-0">
      답장 필요
    </span>
  );
}

function PriorityBadge({ priority }: { priority: EmailRow["priority"] }) {
  const styles = {
    URGENT: "bg-red-500/15 text-red-300 border-red-500/30",
    NORMAL: "bg-gray-800 text-gray-400 border-gray-700",
    LOW: "bg-gray-900 text-gray-500 border-gray-800",
  } as const;
  const labels = { URGENT: "긴급", NORMAL: "일반", LOW: "낮음" } as const;
  if (priority === "NORMAL") return null;
  return (
    <span
      className={`text-[10px] px-1.5 py-0.5 rounded border ${styles[priority]} font-medium shrink-0`}
    >
      {labels[priority]}
    </span>
  );
}

function CategoryBadge({ category }: { category: string }) {
  const labelMap: Record<string, string> = {
    business: "비즈니스",
    engineering: "엔지니어링",
    automated: "자동화",
    newsletter: "뉴스레터",
    meeting: "미팅",
    billing: "청구",
    conversation: "대화",
    other: "기타",
  };
  const label = labelMap[category] || category;
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded border border-gray-700 bg-gray-900/60 text-gray-400 shrink-0">
      {label}
    </span>
  );
}

function senderName(raw: string): string {
  const match = raw.match(/^([^<]+?)\s*</);
  if (match?.[1]) return match[1].trim();
  return raw.replace(/[<>]/g, "").trim();
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "방금";
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}시간 전`;
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "2-digit" }),
  });
}
