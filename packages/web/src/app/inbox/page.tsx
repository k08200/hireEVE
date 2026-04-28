"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import AuthGuard from "../../components/auth-guard";
import CommandCenterSummary from "../../components/command-center-summary";
import { apiFetch } from "../../lib/api";
import { captureClientError } from "../../lib/sentry";

interface PendingActionItem {
  id: string;
  conversationId: string;
  conversationTitle: string | null;
  status: "PENDING" | "REJECTED" | "EXECUTED" | "FAILED";
  toolName: string;
  toolArgs: string;
  /** Server-resolved human label (task title, contact name, …) — null when n/a */
  targetLabel: string | null;
  reasoning: string | null;
  result: string | null;
  createdAt: string;
}

type StatusFilter = "pending" | "all";

export default function InboxPage() {
  return (
    <AuthGuard>
      <InboxView />
    </AuthGuard>
  );
}

function InboxView() {
  const [actions, setActions] = useState<PendingActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("pending");
  const [actionLoading, setActionLoading] = useState<Record<string, "approve" | "reject" | null>>(
    {},
  );

  const load = useCallback(async (statusFilter: StatusFilter) => {
    setLoading(true);
    setError(null);
    try {
      const qs = statusFilter === "all" ? "?status=all" : "";
      const data = await apiFetch<{ actions: PendingActionItem[] }>(
        `/api/chat/pending-actions${qs}`,
      );
      setActions(data.actions);
    } catch (err) {
      captureClientError(err, { scope: "inbox.load" });
      setError("받은 일을 불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(filter);
  }, [filter, load]);

  // Refresh when a new pending action arrives (websocket fires "conversations-updated")
  useEffect(() => {
    const handler = () => load(filter);
    window.addEventListener("conversations-updated", handler);
    return () => window.removeEventListener("conversations-updated", handler);
  }, [filter, load]);

  const handleApprove = async (actionId: string) => {
    if (actionLoading[actionId]) return;
    setActionLoading((prev) => ({ ...prev, [actionId]: "approve" }));
    try {
      await apiFetch(`/api/chat/pending-actions/${actionId}/approve`, { method: "POST" });
      setActions((prev) => prev.map((a) => (a.id === actionId ? { ...a, status: "EXECUTED" } : a)));
    } catch (err) {
      captureClientError(err, { scope: "inbox.approve", actionId });
      alert("승인 실행에 실패했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setActionLoading((prev) => ({ ...prev, [actionId]: null }));
    }
  };

  const handleReject = async (actionId: string) => {
    if (actionLoading[actionId]) return;
    setActionLoading((prev) => ({ ...prev, [actionId]: "reject" }));
    try {
      await apiFetch(`/api/chat/pending-actions/${actionId}/reject`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setActions((prev) => prev.map((a) => (a.id === actionId ? { ...a, status: "REJECTED" } : a)));
    } catch (err) {
      captureClientError(err, { scope: "inbox.reject", actionId });
      alert("거절에 실패했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setActionLoading((prev) => ({ ...prev, [actionId]: null }));
    }
  };

  const pendingCount = actions.filter((a) => a.status === "PENDING").length;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 md:py-10">
      <header className="mb-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-semibold text-gray-100">받은 일</h1>
            <p className="text-xs text-gray-500 mt-1">
              EVE가 제안한 작업 중 승인이 필요한 항목이에요.
            </p>
          </div>
          <button
            type="button"
            onClick={() => load(filter)}
            disabled={loading}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800 disabled:opacity-50 transition shrink-0"
            aria-label="Refresh inbox"
          >
            {loading ? "..." : "새로고침"}
          </button>
        </div>

        <div className="flex items-center gap-1 mt-4 bg-gray-900/50 border border-gray-800 rounded-lg p-1 w-fit">
          <FilterTab
            active={filter === "pending"}
            label={`대기 중${pendingCount ? ` (${pendingCount})` : ""}`}
            onClick={() => setFilter("pending")}
          />
          <FilterTab active={filter === "all"} label="전체" onClick={() => setFilter("all")} />
        </div>
      </header>

      <CommandCenterSummary />

      {loading && actions.length === 0 && (
        <p className="text-sm text-gray-500 py-8 text-center">로딩 중...</p>
      )}

      {error && (
        <div className="rounded-lg border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {!loading && !error && actions.length === 0 && (
        <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-8 text-center">
          <p className="text-sm text-gray-300 mb-1">
            {filter === "pending" ? "대기 중인 항목이 없어요" : "받은 일이 없어요"}
          </p>
          <p className="text-xs text-gray-500">EVE가 새로운 제안을 만들면 여기에 표시돼요.</p>
        </div>
      )}

      <ul className="space-y-3">
        {actions.map((action) => (
          <li key={action.id}>
            <ActionCard
              action={action}
              loading={actionLoading[action.id] ?? null}
              onApprove={() => handleApprove(action.id)}
              onReject={() => handleReject(action.id)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function FilterTab({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs px-3 py-1.5 rounded-md transition ${
        active ? "bg-gray-800 text-white" : "text-gray-400 hover:text-gray-200"
      }`}
    >
      {label}
    </button>
  );
}

function ActionCard({
  action,
  loading,
  onApprove,
  onReject,
}: {
  action: PendingActionItem;
  loading: "approve" | "reject" | null;
  onApprove: () => void;
  onReject: () => void;
}) {
  const preview = buildPreview(action.toolName, action.toolArgs, action.targetLabel);
  const isPending = action.status === "PENDING";

  return (
    <article className="rounded-xl border border-gray-800 bg-gray-900/40 p-4 md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-medium text-cyan-400 bg-cyan-400/10 border border-cyan-400/20 rounded px-1.5 py-0.5">
              {action.toolName.replace(/_/g, " ")}
            </span>
            <StatusBadge status={action.status} />
            <span className="text-[11px] text-gray-600">{formatRelative(action.createdAt)}</span>
          </div>
          {preview && <p className="mt-2 text-sm text-gray-200 break-words">{preview}</p>}
          {action.reasoning && (
            <p className="mt-2 text-xs text-gray-400 leading-relaxed">{action.reasoning}</p>
          )}
          {action.conversationTitle && (
            <p className="mt-2 text-[11px] text-gray-600 truncate">
              대화: {action.conversationTitle}
            </p>
          )}
        </div>
      </div>

      {isPending && (
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <button
            type="button"
            onClick={onApprove}
            disabled={!!loading}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition min-w-[88px]"
          >
            {loading === "approve" ? (
              <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              "승인"
            )}
          </button>
          <button
            type="button"
            onClick={onReject}
            disabled={!!loading}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition min-w-[88px]"
          >
            {loading === "reject" ? (
              <span className="w-3 h-3 border-2 border-gray-300/30 border-t-gray-200 rounded-full animate-spin" />
            ) : (
              "거절"
            )}
          </button>
          <Link
            href={`/chat/${action.conversationId}`}
            className="text-xs text-cyan-400 hover:text-cyan-300 ml-auto transition"
          >
            대화 열기 →
          </Link>
        </div>
      )}

      {!isPending && (
        <div className="flex items-center justify-between mt-3">
          {action.result && (
            <p className="text-[11px] text-gray-500 truncate flex-1">{action.result}</p>
          )}
          <Link
            href={`/chat/${action.conversationId}`}
            className="text-xs text-gray-400 hover:text-gray-200 transition shrink-0 ml-2"
          >
            대화 열기 →
          </Link>
        </div>
      )}
    </article>
  );
}

function StatusBadge({ status }: { status: PendingActionItem["status"] }) {
  const map: Record<PendingActionItem["status"], { label: string; className: string }> = {
    PENDING: { label: "대기 중", className: "text-amber-300 bg-amber-400/10 border-amber-400/20" },
    EXECUTED: {
      label: "실행됨",
      className: "text-emerald-300 bg-emerald-400/10 border-emerald-400/20",
    },
    REJECTED: { label: "거절됨", className: "text-gray-400 bg-gray-500/10 border-gray-500/20" },
    FAILED: { label: "실패", className: "text-red-300 bg-red-500/10 border-red-500/20" },
  };
  const entry = map[status];
  return (
    <span className={`text-[11px] font-medium border rounded px-1.5 py-0.5 ${entry.className}`}>
      {entry.label}
    </span>
  );
}

function buildPreview(
  toolName: string,
  rawArgs: string,
  targetLabel: string | null,
): string | null {
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(rawArgs) as Record<string, unknown>;
  } catch {
    return null;
  }
  const pick = (key: string): string | undefined => {
    const v = args[key];
    return typeof v === "string" ? v : undefined;
  };
  if (toolName === "send_email") {
    return `To: ${pick("to") || "?"} · ${pick("subject") || "제목 없음"}`;
  }
  if (toolName === "create_event") {
    const start = pick("startTime");
    const when = start
      ? new Date(start).toLocaleString("ko-KR", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";
    const loc = pick("location");
    return `${pick("title") || "이벤트"}${when ? ` · ${when}` : ""}${loc ? ` · ${loc}` : ""}`;
  }
  if (toolName === "create_task" || toolName === "create_note") {
    return pick("title") || "제목 없음";
  }
  if (toolName === "create_contact") {
    const email = pick("email");
    return `${pick("name") || "?"}${email ? ` (${email})` : ""}`;
  }
  if (toolName === "delete_task" || toolName === "delete_note" || toolName === "delete_contact") {
    // Prefer server-resolved label (task title / contact name); fall back to
    // the correct id key so the user at least sees *something* they can match.
    const idKey =
      toolName === "delete_task"
        ? "task_id"
        : toolName === "delete_note"
          ? "note_id"
          : "contact_id";
    return `삭제: ${targetLabel || pick(idKey) || "?"}`;
  }
  if (toolName === "update_task" || toolName === "update_note" || toolName === "update_contact") {
    const idKey =
      toolName === "update_task"
        ? "task_id"
        : toolName === "update_note"
          ? "note_id"
          : "contact_id";
    return `수정: ${targetLabel || pick(idKey) || "?"}`;
  }
  return null;
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
