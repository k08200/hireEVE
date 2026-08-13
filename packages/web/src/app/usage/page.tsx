"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import AuthGuard from "../../components/auth-guard";
import EmptyState from "../../components/ui/empty-state";
import ErrorAlert from "../../components/ui/error-alert";
import LoadingState from "../../components/ui/loading-state";
import ResponsiveTable from "../../components/ui/responsive-table";
import Tabs from "../../components/ui/tabs";
import { apiFetch } from "../../lib/api";

type UsagePeriod = "week" | "month" | "all";

interface UsageSummary {
  totalTokens: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalCost: number;
  messageCount: number;
}

interface DailyUsage {
  date: string;
  tokens: number;
  cost: number;
  messages: number;
}

interface UsageResponse {
  period: UsagePeriod;
  since: string;
  summary: UsageSummary;
  daily: DailyUsage[];
}

interface ConversationUsage {
  conversationId: string;
  title: string;
  totalTokens: number;
  estimatedCost: number;
  messageCount: number;
}

const PERIOD_TABS = [
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
  { id: "all", label: "All time" },
];

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

/** Same convention as /billing: sub-cent spend reads "< $0.01", not $0.0001. */
function formatUsd(amount: number): string {
  if (amount > 0 && amount < 0.01) return "< $0.01";
  return `$${amount.toFixed(2)}`;
}

function formatDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function StatTile({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="panel-elevated rounded-2xl border border-line/70 bg-surface-panel p-5">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-ink-dim">{label}</p>
      <p className="mt-2 text-[26px] font-semibold leading-none tracking-[-0.02em] text-ink tabular-nums">
        {value}
      </p>
      {detail && <p className="mt-2 text-xs text-ink-mid tabular-nums">{detail}</p>}
    </div>
  );
}

function DailyActivity({ daily }: { daily: DailyUsage[] }) {
  const maxTokens = Math.max(...daily.map((d) => d.tokens), 1);
  return (
    <div className="panel-elevated rounded-2xl border border-line/70 bg-surface-panel p-5">
      <h2 className="text-sm font-semibold text-ink">Daily activity</h2>
      <p className="mt-1 text-xs text-ink-mid">Tokens per day, newest first.</p>
      <ul className="mt-4 space-y-1">
        {daily.map((d) => (
          <li
            key={d.date}
            className="grid grid-cols-[64px_1fr_72px_64px] items-center gap-3 rounded-md px-2 py-1.5 text-xs transition hover:bg-surface-raised"
          >
            <span className="text-ink-mid">{formatDay(d.date)}</span>
            <span className="h-2 overflow-hidden rounded-full bg-surface-hover">
              <span
                className="block h-full rounded-full bg-accent"
                style={{ width: `${Math.max((d.tokens / maxTokens) * 100, 1.5)}%` }}
              />
            </span>
            <span className="text-right text-ink tabular-nums">{formatTokens(d.tokens)}</span>
            <span className="text-right text-ink-mid tabular-nums">{formatUsd(d.cost)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ConversationsTable({ conversations }: { conversations: ConversationUsage[] }) {
  return (
    <div className="panel-elevated rounded-2xl border border-line/70 bg-surface-panel p-5">
      <h2 className="text-sm font-semibold text-ink">Top conversations</h2>
      <p className="mt-1 text-xs text-ink-mid">
        The 20 assistant conversations that used the most tokens, all time.
      </p>
      <ResponsiveTable className="mt-4">
        <table className="min-w-[520px] w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-ink-dim">
              <th scope="col" className="py-2 pr-4 font-medium">
                Conversation
              </th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">
                Messages
              </th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">
                Tokens
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Est. cost
              </th>
            </tr>
          </thead>
          <tbody>
            {conversations.map((c) => (
              <tr key={c.conversationId} className="border-b border-line-soft last:border-0">
                <td className="max-w-[280px] truncate py-2 pr-4 text-ink">
                  {c.title || "Untitled conversation"}
                </td>
                <td className="py-2 pr-4 text-right text-ink-mid tabular-nums">{c.messageCount}</td>
                <td className="py-2 pr-4 text-right text-ink tabular-nums">
                  {formatTokens(c.totalTokens)}
                </td>
                <td className="py-2 text-right text-ink-mid tabular-nums">
                  {formatUsd(c.estimatedCost)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ResponsiveTable>
    </div>
  );
}

function UsageView() {
  const [period, setPeriod] = useState<UsagePeriod>("month");
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [conversations, setConversations] = useState<ConversationUsage[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (p: UsagePeriod) => {
    setLoading(true);
    setError(null);
    try {
      const [u, c] = await Promise.all([
        apiFetch<UsageResponse>(`/api/usage?period=${p}`),
        apiFetch<{ conversations: ConversationUsage[] }>("/api/usage/conversations"),
      ]);
      setUsage(u);
      setConversations(c.conversations);
    } catch {
      setError("Could not load usage data. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(period);
  }, [load, period]);

  const summary = usage?.summary;
  const hasActivity = (summary?.messageCount ?? 0) > 0;

  return (
    <div className="mx-auto max-w-5xl px-4 pb-28 pt-6 sm:px-6 md:py-10">
      <header className="mb-6">
        <h1 className="text-[28px] font-semibold leading-none tracking-[-0.02em] text-ink">
          Usage
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-ink-mid">
          What the assistant actually spent — tokens, messages, and estimated model cost. Plan
          limits live on{" "}
          <Link href="/billing" className="focus-ring rounded text-accent hover:underline">
            billing
          </Link>
          .
        </p>
      </header>

      <div className="mb-6">
        <Tabs
          tabs={PERIOD_TABS}
          active={period}
          onChange={(id) => setPeriod(id as UsagePeriod)}
          ariaLabel="Usage period"
        />
      </div>

      {error && (
        <ErrorAlert className="mb-6" onRetry={() => load(period)}>
          {error}
        </ErrorAlert>
      )}

      {loading && <LoadingState rows={3} />}

      {!loading && !error && summary && !hasActivity && (
        <div className="panel-elevated rounded-2xl border border-line/70 bg-surface-panel">
          <EmptyState
            title="No model usage in this period"
            description="When the assistant classifies mail, drafts replies, or answers chat, the spend shows up here."
          />
        </div>
      )}

      {!loading && !error && summary && hasActivity && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <StatTile label="Estimated cost" value={formatUsd(summary.totalCost)} />
            <StatTile
              label="Tokens"
              value={formatTokens(summary.totalTokens)}
              detail={`${formatTokens(summary.totalPromptTokens)} prompt · ${formatTokens(summary.totalCompletionTokens)} completion`}
            />
            <StatTile label="Messages" value={String(summary.messageCount)} />
          </div>

          {usage && usage.daily.length > 0 && <DailyActivity daily={usage.daily} />}

          {conversations && conversations.length > 0 && (
            <ConversationsTable conversations={conversations} />
          )}
        </div>
      )}
    </div>
  );
}

export default function UsagePage() {
  return (
    <AuthGuard>
      <UsageView />
    </AuthGuard>
  );
}
