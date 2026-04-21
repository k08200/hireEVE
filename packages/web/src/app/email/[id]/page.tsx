"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import AuthGuard from "../../../components/auth-guard";
import { apiFetch } from "../../../lib/api";
import { captureClientError } from "../../../lib/sentry";

interface EmailDetail {
  id: string;
  gmailId: string;
  from: string;
  to: string;
  cc: string | null;
  subject: string;
  body: string | null;
  snippet: string | null;
  date: string;
  priority: "URGENT" | "NORMAL" | "LOW";
  category: string | null;
  summary: string | null;
  keyPoints: string[];
  actionItems: string[];
  sentiment: string | null;
}

export default function EmailDetailPage() {
  return (
    <AuthGuard>
      <EmailDetailView />
    </AuthGuard>
  );
}

function EmailDetailView() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [email, setEmail] = useState<EmailDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<EmailDetail | { error: string }>(`/api/email/${id}`);
      if ("error" in data) {
        setError(data.error);
      } else {
        setEmail(data);
      }
    } catch (err) {
      captureClientError(err, { scope: "email.detail", id });
      setError("메일을 불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-4 md:py-8">
      <Link
        href="/email"
        className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200 mb-4"
      >
        <svg
          aria-hidden="true"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
        메일 목록
      </Link>

      {loading && <p className="text-sm text-gray-500">로딩 중...</p>}

      {error && (
        <div className="rounded-lg border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {email && (
        <article>
          <header className="mb-4">
            <h1 className="text-lg md:text-xl font-semibold text-gray-100 leading-snug break-words">
              {email.subject || "제목 없음"}
            </h1>
            <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
              <span className="truncate">{email.from}</span>
              <span className="text-gray-600">·</span>
              <time className="shrink-0 tabular-nums">{formatFull(email.date)}</time>
            </div>
          </header>

          <EveAnalysis email={email} />

          {email.body ? (
            <section className="mt-6 rounded-xl border border-gray-800 bg-gray-950/40 p-4">
              <h2 className="text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-3">
                본문
              </h2>
              <pre className="text-sm text-gray-200 whitespace-pre-wrap font-sans leading-relaxed break-words">
                {email.body}
              </pre>
            </section>
          ) : email.snippet ? (
            <section className="mt-6 rounded-xl border border-gray-800 bg-gray-950/40 p-4">
              <h2 className="text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-3">
                미리보기
              </h2>
              <p className="text-sm text-gray-300">{email.snippet}</p>
            </section>
          ) : null}
        </article>
      )}
    </div>
  );
}

function EveAnalysis({ email }: { email: EmailDetail }) {
  const hasAnything =
    email.summary || email.keyPoints.length > 0 || email.actionItems.length > 0 || email.category;

  if (!hasAnything) {
    return (
      <section className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
        <p className="text-xs text-gray-500">
          EVE가 아직 분석하지 않은 메일이에요. 동기화 후 잠시 뒤에 다시 확인해 주세요.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[11px] font-semibold text-cyan-400 uppercase tracking-wider">
          EVE 분석
        </span>
        <div className="flex items-center gap-1.5">
          <PriorityPill priority={email.priority} />
          {email.category && <CategoryPill category={email.category} />}
        </div>
      </div>

      {email.summary && <p className="text-sm text-gray-200 leading-relaxed">{email.summary}</p>}

      {email.keyPoints.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1.5">
            핵심 포인트
          </p>
          <ul className="space-y-1">
            {email.keyPoints.map((k, i) => (
              <li key={i} className="text-xs text-gray-300 flex gap-1.5">
                <span className="text-cyan-500/70">•</span>
                <span>{k}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {email.actionItems.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1.5">
            할 일
          </p>
          <ul className="space-y-1">
            {email.actionItems.map((a, i) => (
              <li key={i} className="text-xs text-gray-300 flex gap-1.5">
                <span className="text-amber-400/80">☐</span>
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function PriorityPill({ priority }: { priority: EmailDetail["priority"] }) {
  if (priority === "NORMAL") return null;
  const styles = {
    URGENT: "bg-red-500/15 text-red-300 border-red-500/30",
    LOW: "bg-gray-900 text-gray-500 border-gray-800",
  };
  const labels = { URGENT: "긴급", LOW: "낮음" };
  return (
    <span
      className={`text-[10px] px-1.5 py-0.5 rounded border ${styles[priority as "URGENT" | "LOW"]} font-medium`}
    >
      {labels[priority as "URGENT" | "LOW"]}
    </span>
  );
}

function CategoryPill({ category }: { category: string }) {
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
    <span className="text-[10px] px-1.5 py-0.5 rounded border border-gray-700 bg-gray-900/60 text-gray-400">
      {label}
    </span>
  );
}

function formatFull(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
