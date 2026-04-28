"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import type { WorkGraphContext, WorkGraphRisk, WorkGraphSummary } from "../lib/work-graph";

const EMPTY_SUMMARY: WorkGraphSummary = { generatedAt: "", contexts: [] };

export default function WorkGraphSummaryCard() {
  const [data, setData] = useState<WorkGraphSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const summary = await apiFetch<WorkGraphSummary>("/api/work-graph/summary?limit=3").catch(
        () => EMPTY_SUMMARY,
      );
      setData(summary);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener("conversations-updated", handler);
    return () => window.removeEventListener("conversations-updated", handler);
  }, [refresh]);

  if (loading && data.contexts.length === 0) return null;
  if (data.contexts.length === 0) return null;

  return (
    <section className="mb-6" aria-label="Work graph summary">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-gray-100">진행 중인 맥락</h2>
        <span className="text-[11px] text-gray-500">{data.contexts.length}</span>
      </div>
      <ul className="space-y-2">
        {data.contexts.map((context) => (
          <li key={context.id}>
            <ContextCard context={context} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ContextCard({ context }: { context: WorkGraphContext }) {
  const body = (
    <article className="rounded-xl border border-gray-800 bg-gray-900/40 p-4 hover:bg-gray-900/60 transition">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <RiskBadge risk={context.risk} />
            <span className="text-[11px] text-gray-500">{kindLabel(context.kind)}</span>
            <span className="text-[11px] text-gray-600">
              {formatRelative(context.lastActivityAt)}
            </span>
          </div>
          <p className="mt-2 text-sm font-medium text-gray-100 truncate">{context.title}</p>
          <p className="mt-1 text-xs text-gray-400 line-clamp-1">
            {subtitleFor(context) || "연결된 신호 없음"}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {signalChips(context).map((chip) => (
          <span
            key={chip}
            className="text-[11px] text-gray-400 border border-gray-800 rounded px-1.5 py-0.5"
          >
            {chip}
          </span>
        ))}
      </div>
    </article>
  );

  return context.href ? (
    <Link href={context.href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

function RiskBadge({ risk }: { risk: WorkGraphRisk }) {
  const entry = riskEntry(risk);
  return (
    <span className={`text-[11px] font-medium border rounded px-1.5 py-0.5 ${entry.className}`}>
      {entry.label}
    </span>
  );
}

function riskEntry(risk: WorkGraphRisk): { label: string; className: string } {
  switch (risk) {
    case "high":
      return { label: "높음", className: "text-red-300 bg-red-500/10 border-red-500/20" };
    case "medium":
      return {
        label: "보통",
        className: "text-amber-300 bg-amber-400/10 border-amber-400/20",
      };
    case "low":
      return { label: "낮음", className: "text-gray-400 bg-gray-500/10 border-gray-500/20" };
  }
}

function kindLabel(kind: WorkGraphContext["kind"]): string {
  switch (kind) {
    case "email_thread":
      return "메일";
    case "chat_conversation":
      return "대화";
    case "loose_commitment":
      return "약속";
  }
}

function subtitleFor(context: WorkGraphContext): string | null {
  const people = context.people
    .map((p) => p.name || p.email)
    .filter(Boolean)
    .slice(0, 2)
    .join(", ");
  const reasons = context.reasons.slice(0, 2).join(" · ");
  return [people, reasons].filter(Boolean).join(" · ") || context.subtitle;
}

function signalChips(context: WorkGraphContext): string[] {
  const chips: string[] = [];
  if (context.signals.pendingActions) chips.push(`승인 ${context.signals.pendingActions}`);
  if (context.signals.overdueCommitments)
    chips.push(`지난 약속 ${context.signals.overdueCommitments}`);
  if (context.signals.commitments) chips.push(`약속 ${context.signals.commitments}`);
  if (context.signals.urgentEmails) chips.push(`긴급 메일 ${context.signals.urgentEmails}`);
  if (context.signals.unreadEmails) chips.push(`읽지 않음 ${context.signals.unreadEmails}`);
  if (chips.length === 0 && context.signals.emails) chips.push(`메일 ${context.signals.emails}`);
  return chips.slice(0, 4);
}

function formatRelative(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "방금";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}
