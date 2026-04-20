"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import AuthGuard from "../../components/auth-guard";
import { Markdown } from "../../components/markdown";
import { apiFetch } from "../../lib/api";
import { captureClientError } from "../../lib/sentry";

interface BriefingResponse {
  briefing: { id: string; content: string; createdAt: string } | null;
}

interface GenerateResponse {
  briefing: string;
}

export default function BriefingPage() {
  return (
    <AuthGuard>
      <BriefingView />
    </AuthGuard>
  );
}

function BriefingView() {
  const [content, setContent] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadToday = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<BriefingResponse>("/api/briefing/today");
      if (data.briefing) {
        setContent(data.briefing.content);
        setCreatedAt(data.briefing.createdAt);
      } else {
        setContent(null);
        setCreatedAt(null);
      }
    } catch (err) {
      captureClientError(err, { scope: "briefing.load-today" });
      setError("브리핑을 불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadToday();
  }, [loadToday]);

  const regenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const data = await apiFetch<GenerateResponse>("/api/briefing/generate", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setContent(data.briefing);
      setCreatedAt(new Date().toISOString());
    } catch (err) {
      captureClientError(err, { scope: "briefing.generate" });
      setError("생성 실패. 잠시 후 다시 시도해 주세요.");
    } finally {
      setGenerating(false);
    }
  };

  const formattedTime = createdAt
    ? new Date(createdAt).toLocaleTimeString("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 md:py-10">
      <header className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold text-gray-100">오늘의 브리핑</h1>
          {formattedTime && (
            <p className="text-xs text-gray-500 mt-1">오늘 {formattedTime}에 생성됨</p>
          )}
        </div>
        <button
          type="button"
          onClick={regenerate}
          disabled={generating}
          className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800 disabled:opacity-50 transition"
        >
          {generating ? "생성 중..." : content ? "다시 생성" : "지금 생성"}
        </button>
      </header>

      {loading && <p className="text-sm text-gray-500">로딩 중...</p>}

      {error && (
        <div className="rounded-lg border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {!loading && !error && !content && (
        <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-6 text-center">
          <p className="text-sm text-gray-400 mb-3">아직 오늘의 브리핑이 없습니다.</p>
          <p className="text-xs text-gray-500 mb-4">
            자동 브리핑 시간은{" "}
            <Link href="/settings" className="text-cyan-400 hover:underline">
              설정
            </Link>
            에서 바꿀 수 있어요.
          </p>
          <button
            type="button"
            onClick={regenerate}
            disabled={generating}
            className="text-sm px-4 py-2 rounded-lg bg-white text-black hover:bg-gray-200 disabled:opacity-50 transition"
          >
            {generating ? "생성 중..." : "지금 생성하기"}
          </button>
        </div>
      )}

      {content && (
        <article className="rounded-xl border border-gray-800 bg-gray-900/40 p-5 md:p-6">
          <Markdown content={content} />
        </article>
      )}
    </div>
  );
}
