"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import AuthScreen from "../../components/auth-screen";
import { API_BASE, apiFetch } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useT } from "../../lib/i18n";

function VerifyEmailContent() {
  const { t } = useT();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const { user, token: authToken } = useAuth();
  const [status, setStatus] = useState<"loading" | "verifying" | "error" | "pending" | "sent">(
    "loading",
  );
  // The token branch navigates away with a SINGLE-USE token. `user` resolves
  // async (after /api/auth/me), which would otherwise re-run this effect and
  // fire a second navigation with the already-spent token (→ 400). Guard it.
  const navigatedRef = useRef(false);

  useEffect(() => {
    if (token) {
      if (navigatedRef.current) return;
      navigatedRef.current = true;
      // A real link means the token must be confirmed against the API before we
      // claim anything. GET /api/auth/verify-email verifies server-side, then
      // redirects to /login?verified=true (success) or returns a 400 for an
      // expired/invalid token. Hand the browser to that endpoint so the server
      // is the single source of truth — never show success from mere presence.
      setStatus("verifying");
      window.location.assign(
        `${API_BASE}/api/auth/verify-email?token=${encodeURIComponent(token)}`,
      );
    } else if (user) {
      setStatus("pending");
    } else {
      setStatus("error");
    }
  }, [token, user]);

  const resend = async () => {
    if (!authToken) return;
    try {
      await apiFetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}` },
      });
      // A resend genuinely sends a new email — this success is confirmed by the
      // API call, unlike the old token-presence guess.
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  };

  // While loading (no decision yet) or verifying a link token (browser is being
  // handed to the API), show a spinner — never a premature success claim.
  if (status === "loading" || status === "verifying") {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-surface-app">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        {status === "verifying" && (
          <p className="text-sm text-ink-mid" aria-live="polite">
            {t("verifyEmail.verifying")}
          </p>
        )}
      </div>
    );
  }

  return (
    <AuthScreen
      eyebrow={t("verifyEmail.eyebrow")}
      title={
        status === "sent"
          ? t("verifyEmail.title.sent")
          : status === "pending"
            ? t("verifyEmail.title.pending")
            : t("verifyEmail.title.error")
      }
      description={
        status === "sent"
          ? t("verifyEmail.description.sent")
          : status === "pending"
            ? t("verifyEmail.description.pending")
            : t("verifyEmail.description.error")
      }
      footer={
        <Link href="/login" className="transition hover:text-ink">
          {t("auth.backToLogin")}
        </Link>
      }
    >
      <div className="space-y-4">
        <div className="rounded-md border border-line bg-surface-raised p-4">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-ink-dim">
            {t("verifyEmail.nextStep")}
          </p>
          <p className="mt-2 text-sm leading-6 text-ink-mid">
            {status === "sent"
              ? t("verifyEmail.nextStepBody.sent")
              : status === "pending"
                ? t("verifyEmail.nextStepBody.pending")
                : t("verifyEmail.nextStepBody.error")}
          </p>
        </div>

        {status === "pending" || status === "sent" ? (
          <button
            type="button"
            onClick={resend}
            className="flex h-11 w-full items-center justify-center rounded-md bg-accent text-sm font-semibold text-white transition hover:bg-accent-deep focus-ring"
          >
            {status === "sent" ? t("verifyEmail.resendAgain") : t("verifyEmail.resendVerification")}
          </button>
        ) : (
          <Link
            href="/login"
            className="flex h-11 w-full items-center justify-center rounded-md border border-line bg-surface-raised text-sm font-semibold text-ink transition hover:border-line-strong focus-ring"
          >
            {t("auth.backToLogin")}
          </Link>
        )}
      </div>
    </AuthScreen>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailContent />
    </Suspense>
  );
}
