"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";
import { captureClientError } from "../lib/sentry";
import { RelativeTime } from "./relative-time";

type EmailPriority = "URGENT" | "NORMAL" | "LOW";

interface UserCorrectionFixture {
  id: string;
  capturedAt: string;
  from: string;
  subject: string;
  labels: string[];
  expectedSyncPriority: EmailPriority;
  capturedHeuristic: {
    priority: EmailPriority;
    reason: string | null;
    signals: string[];
  };
  note: string | null;
}

interface EmailFeedbackResponse {
  fixtures: UserCorrectionFixture[];
  count: number;
}

const PRIORITY_STYLES: Record<EmailPriority, string> = {
  URGENT: "text-red-300 bg-red-500/10 border-red-500/20",
  NORMAL: "text-blue-300 bg-blue-500/10 border-blue-500/20",
  LOW: "text-gray-300 bg-gray-500/10 border-gray-500/20",
};

function PriorityPill({ priority }: { priority: EmailPriority }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${PRIORITY_STYLES[priority]}`}
    >
      {priority}
    </span>
  );
}

export function EmailFeedbackList() {
  const [fixtures, setFixtures] = useState<UserCorrectionFixture[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<EmailFeedbackResponse>("/api/email/feedback?limit=50")
      .then((data) => {
        setFixtures(data.fixtures);
        setCount(data.count);
        setError(null);
      })
      .catch((err) => {
        captureClientError(err, { scope: "email-feedback.load" });
        setError("Failed to load email corrections");
      })
      .finally(() => setLoading(false));
  }, []);

  const exportHref = useMemo(() => {
    if (fixtures.length === 0) return null;
    const blob = new Blob([JSON.stringify({ fixtures, count }, null, 2)], {
      type: "application/json",
    });
    return URL.createObjectURL(blob);
  }, [fixtures, count]);

  useEffect(() => {
    return () => {
      if (exportHref) URL.revokeObjectURL(exportHref);
    };
  }, [exportHref]);

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-gray-300">
            {loading ? "Loading corrections..." : `${count} corrections recorded`}
          </p>
          <p className="mt-1 text-sm text-gray-500">These corrections train your EVE classifier.</p>
        </div>
        {exportHref && (
          <a
            href={exportHref}
            download="eve-email-feedback-fixtures.json"
            className="inline-flex w-fit items-center rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm font-medium text-gray-200 transition hover:bg-gray-700"
          >
            Export JSON
          </a>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-xl border border-gray-800/50 bg-gray-900/60"
            />
          ))}
        </div>
      )}

      {!loading && !error && fixtures.length === 0 && (
        <div className="rounded-xl border border-gray-800/60 bg-gray-900/60 px-5 py-10 text-center">
          <p className="text-sm font-medium text-gray-300">아직 수정한 분류가 없어요.</p>
          <p className="mt-2 text-sm text-gray-500">
            /email 에서 분류 결과가 틀렸을 때 &quot;분류 틀림&quot;을 눌러보세요.
          </p>
        </div>
      )}

      {!loading && fixtures.length > 0 && (
        <div className="space-y-3">
          {fixtures.map((fixture) => (
            <div
              key={fixture.id}
              className="rounded-xl border border-gray-800/50 bg-gray-900/60 p-4"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-200">{fixture.subject}</p>
                  <p className="mt-1 truncate text-xs text-gray-500">{fixture.from}</p>
                </div>
                <RelativeTime
                  date={fixture.capturedAt}
                  className="shrink-0 text-xs text-gray-600"
                />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <PriorityPill priority={fixture.capturedHeuristic.priority} />
                <span className="text-xs text-gray-600">→</span>
                <PriorityPill priority={fixture.expectedSyncPriority} />
                {fixture.capturedHeuristic.reason && (
                  <span className="rounded-full border border-gray-800 bg-gray-950/50 px-2 py-0.5 text-[10px] text-gray-500">
                    {fixture.capturedHeuristic.reason}
                  </span>
                )}
              </div>

              {fixture.capturedHeuristic.signals.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {fixture.capturedHeuristic.signals.slice(0, 6).map((signal) => (
                    <span
                      key={signal}
                      className="max-w-full truncate rounded-md border border-gray-800 bg-gray-950/50 px-2 py-1 text-[11px] text-gray-500"
                    >
                      {signal}
                    </span>
                  ))}
                </div>
              )}

              {fixture.note && <p className="mt-3 text-xs text-gray-500">{fixture.note}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
