"use client";

import { useState } from "react";
import { apiFetch } from "../lib/api";
import { isSafeBillingRedirect } from "../lib/billing-redirect";
import { useT } from "../lib/i18n";
import { isNativePlatform } from "../lib/native/capacitor";
import {
  formatBillingDate,
  hasPendingCancel,
  type SubscriptionState,
  subscriptionStatusLine,
} from "../lib/subscription";
import { useConfirm } from "./confirm-dialog";
import { useToast } from "./toast";

const BUTTON =
  "ease-strong min-h-11 rounded-lg border border-line bg-surface-panel/70 px-4 py-2 text-sm font-medium text-ink-mid shadow-[0_1px_1px_rgba(15,23,42,0.04)] transition duration-150 hover:bg-surface-panel hover:text-ink active:scale-[0.97] focus-ring disabled:opacity-50";

/**
 * Subscription state + the actions on it, shared by /billing and Settings so
 * the two surfaces can never disagree about what a subscriber sees.
 *
 * Cancelling is in-app (POST /api/billing/cancel) rather than a bounce to the
 * provider portal: it always schedules for the period end, which is what the
 * refund policy promises, and it shows the exact end date in the confirm. The
 * portal stays available for what we deliberately do NOT reimplement —
 * payment method changes and invoice downloads.
 *
 * Nothing renders inside the native app: App Store anti-steering (3.1.1)
 * forbids pointing at web billing, and IAP subscriptions are managed by the
 * store, not by us.
 */
export function SubscriptionManager({
  state,
  onChanged,
}: {
  state: SubscriptionState;
  /** Refetch the surface's billing state. Awaited before buttons re-enable. */
  onChanged: () => Promise<void> | void;
}) {
  const { t, locale } = useT();
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [busy, setBusy] = useState(false);

  if (isNativePlatform()) return null;

  const statusLine = subscriptionStatusLine(state, locale);
  const pendingCancel = hasPendingCancel(state);
  const canCancel = Boolean(state.canCancelInApp) && !pendingCancel;

  async function openPortal() {
    if (busy) return;
    setBusy(true);
    try {
      const { url } = await apiFetch<{ url: string }>("/api/billing/portal", {
        method: "POST",
        body: JSON.stringify({}),
      });
      // The URL comes from an API response, so it is never trusted blindly.
      if (url && isSafeBillingRedirect(url, window.location.origin)) {
        window.location.href = url;
        return;
      }
      toast(t("billing.error.unsafeRedirect"), "error");
    } catch {
      toast(t("billing.error.portalFailed"), "error");
    }
    setBusy(false);
  }

  async function cancelSubscription() {
    if (busy) return;
    const endDate = formatBillingDate(state.cancelAt ?? state.renewsAt, locale);
    const ok = await confirm({
      title: t("billing.cancelConfirm.title"),
      message: endDate
        ? t("billing.cancelConfirm.message", { date: endDate })
        : t("billing.cancelConfirm.messageNoDate"),
      confirmLabel: t("billing.cancelConfirm.confirm"),
      // Never "Cancel" here — it would read as confirming the cancellation.
      dismissLabel: t("billing.keepSubscription"),
      danger: true,
    });
    if (!ok) return;

    setBusy(true);
    try {
      const { cancelAt } = await apiFetch<{ cancelAt: string | null }>("/api/billing/cancel", {
        method: "POST",
        body: JSON.stringify({}),
      });
      const effective = formatBillingDate(cancelAt, locale);
      toast(
        effective
          ? t("billing.toast.cancelScheduled", { date: effective })
          : t("billing.toast.cancelScheduledNoDate"),
        "success",
      );
      await onChanged();
    } catch {
      toast(t("billing.error.cancelFailed"), "error");
    }
    setBusy(false);
  }

  async function keepSubscription() {
    if (busy) return;
    setBusy(true);
    try {
      await apiFetch<{ resumed: boolean }>("/api/billing/cancel/undo", {
        method: "POST",
        body: JSON.stringify({}),
      });
      toast(t("billing.toast.resumed"), "success");
      await onChanged();
    } catch {
      toast(t("billing.error.resumeFailed"), "error");
    }
    setBusy(false);
  }

  const showPortal = Boolean(state.hasPortal);
  if (!statusLine && !showPortal && !canCancel && !pendingCancel) return null;

  return (
    <div className="flex flex-col gap-3 sm:items-end">
      {statusLine && (
        <p
          className={`text-xs ${
            state.subscriptionStatus === "past_due" || pendingCancel
              ? "font-medium text-amber-600"
              : "text-ink-dim"
          }`}
        >
          {statusLine.date ? t(statusLine.key, { date: statusLine.date }) : t(statusLine.key)}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {pendingCancel && state.canCancelInApp && (
          <button type="button" onClick={keepSubscription} disabled={busy} className={BUTTON}>
            {t("billing.keepSubscription")}
          </button>
        )}
        {showPortal && (
          <button type="button" onClick={openPortal} disabled={busy} className={BUTTON}>
            {t("billing.manageSubscription")}
          </button>
        )}
        {canCancel && (
          <button
            type="button"
            onClick={cancelSubscription}
            disabled={busy}
            className="ease-strong min-h-11 rounded-lg px-3 py-2 text-sm text-ink-dim underline-offset-4 transition duration-150 hover:text-ink hover:underline focus-ring disabled:opacity-50"
          >
            {t("billing.cancelSubscription")}
          </button>
        )}
      </div>
    </div>
  );
}
