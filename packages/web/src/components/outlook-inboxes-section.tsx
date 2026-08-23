"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { apiFetch, startLinkOutlookInbox } from "../lib/api";
import { useAuth } from "../lib/auth";
import { queryKeys } from "../lib/query-keys";
import { captureClientError } from "../lib/sentry";
import { useToast } from "./toast";

interface OutlookAccount {
  id: string;
  email: string;
  createdAt: string;
  lastSyncedAt: string | null;
  needsReconnect: boolean;
}

// Same compact "synced 5m ago" as linked-inboxes-section (kept local — both
// sections stay self-contained by design).
function formatLastSynced(iso: string | null): string {
  if (!iso) return "Not yet synced";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "Not yet synced";
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 60) return "Synced just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `Synced ${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Synced ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `Synced ${days}d ago`;
}

/**
 * "Outlook inboxes" — link an Outlook / Microsoft account as a full inbox
 * (Phase 3D of the multi-provider plan). Mirrors LinkedInboxesSection.
 *
 * OUTLOOK_INBOX_ENABLED is server-side: while it's off every
 * /api/auth/outlook route answers 404 and this section renders nothing —
 * the same dark pattern as the iCloud section. Must render inside a
 * <Suspense> (uses useSearchParams).
 *
 * The OAuth redirect lands on /settings?inbox=… which the GOOGLE section
 * already toasts and strips (its markers are generic). This section only
 * refreshes its own list on `success` — never toasts or strips, so the two
 * effects can't race.
 */
export function OutlookInboxesSection() {
  const { user } = useAuth();
  // Server-computed; always true while the paywall is off (inert pre-launch).
  const entitled = user?.entitled !== false;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();

  // null = surface unavailable (flag off server-side) → render nothing.
  const { data: accounts } = useQuery({
    queryKey: queryKeys.inbox.outlookAccounts(),
    queryFn: async (): Promise<OutlookAccount[] | null> => {
      try {
        const res = await apiFetch<{ accounts: OutlookAccount[] }>(
          "/api/auth/outlook/linked-inboxes",
        );
        return res.accounts ?? [];
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.startsWith("API 404")) return null;
        // 403 (not entitled) or transient failure — show the connect prompt.
        return [];
      }
    },
  });

  useEffect(() => {
    if (searchParams.get("inbox") === "success") {
      void queryClient.invalidateQueries({ queryKey: queryKeys.inbox.outlookAccounts() });
    }
  }, [searchParams, queryClient]);

  const disconnect = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/auth/outlook/linked-inboxes/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.inbox.outlookAccounts() });
      toast("Inbox disconnected.", "success");
    },
    onError: (err) => {
      captureClientError(err, { scope: "inbox.outlook.disconnect" });
      toast("Couldn't disconnect. Try again.", "error");
    },
  });

  // useMutation so isPending disables the button — a double-click would
  // otherwise start two OAuth flows before the redirect.
  const connect = useMutation({
    mutationFn: () => startLinkOutlookInbox(),
    onError: (err) => {
      captureClientError(err, { scope: "inbox.outlook.connect" });
      const msg = err instanceof Error ? err.message : "";
      toast(
        msg.startsWith("API 503")
          ? "Outlook linking isn't configured yet. Try again later."
          : "Couldn't start Outlook sign-in. A Pro subscription may be required.",
        "error",
      );
    },
  });

  if (accounts === null || accounts === undefined) return null;

  return (
    <section className="panel-elevated mb-8 rounded-2xl border border-line/70 bg-surface-panel p-5">
      <h2 className="text-base font-semibold text-ink">Outlook inboxes</h2>
      <p className="mt-1 text-xs text-ink-mid">
        Connect an Outlook or Microsoft account so Klorn runs the same 4-tier firewall across its
        mail too. You approve access on Microsoft's sign-in page — Klorn never sees your password.
      </p>

      {accounts.length > 0 && (
        <ul className="mt-3 divide-y divide-line-soft rounded-xl border border-line-soft bg-surface-raised/70">
          {accounts.map((account) => (
            <li
              key={account.id}
              className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
            >
              <div className="min-w-0">
                <span className="block truncate text-ink">{account.email}</span>
                {account.needsReconnect ? (
                  <span className="block truncate text-[11px] text-amber-600">
                    Reconnect needed — access was revoked
                  </span>
                ) : (
                  <span className="block truncate text-[11px] text-ink-dim">
                    {formatLastSynced(account.lastSyncedAt)}
                  </span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {account.needsReconnect && (
                  <button
                    type="button"
                    onClick={() => connect.mutate()}
                    disabled={connect.isPending}
                    className="ease-strong rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 transition duration-150 hover:bg-amber-100 active:scale-[0.97] disabled:opacity-50"
                  >
                    Reconnect
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => disconnect.mutate(account.id)}
                  disabled={disconnect.isPending}
                  className="ease-strong rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 transition duration-150 hover:bg-red-100 active:scale-[0.97] disabled:opacity-50"
                >
                  Disconnect
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {entitled ? (
        <button
          type="button"
          onClick={() => connect.mutate()}
          disabled={connect.isPending}
          className="glow-primary ease-strong mt-3 inline-flex min-h-10 items-center rounded-lg bg-accent-solid px-4 py-2 text-sm font-medium text-accent-solid-ink transition duration-150 hover:bg-accent-solid-hover active:scale-[0.97] disabled:opacity-50"
        >
          Connect Outlook inbox
        </button>
      ) : (
        <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50/60 p-4">
          <p className="text-sm text-ink">
            Multiple inboxes is a <span className="font-semibold text-accent-deep">Pro</span>{" "}
            feature.
          </p>
          <p className="mt-1 text-xs text-ink-mid">
            Free covers your primary Google account. Upgrade in the Subscription section to run the
            firewall across an Outlook inbox too.
          </p>
        </div>
      )}
    </section>
  );
}
