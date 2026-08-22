"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import AuthScreen from "../../components/auth-screen";
import { Input } from "../../components/ui/input";
import { apiFetch } from "../../lib/api";
import { useT } from "../../lib/i18n";

// Signup enforces 8; reset must not be weaker — unify to the stronger policy.
const MIN_PASSWORD_LENGTH = 8;

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  // Without a token, show the reset-link request form.
  if (!token) {
    return <ForgotPasswordForm />;
  }

  return <NewPasswordForm token={token} />;
}

function ForgotPasswordForm() {
  const { t } = useT();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setEmailError(null);
    setLoading(true);
    try {
      await apiFetch("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } catch {
      // Inline field error is the single announcement (WCAG 4.1.3) — it is
      // rendered role="alert", so no duplicate error toast.
      setEmailError(t("resetPassword.error.sendFailed"));
    }
    setLoading(false);
  };

  if (sent) {
    return (
      <AuthScreen
        eyebrow={t("resetPassword.eyebrow")}
        title={t("resetPassword.checkEmail.title")}
        description={t("resetPassword.checkEmail.description")}
        footer={
          <Link href="/login" className="transition hover:text-ink">
            {t("auth.backToLogin")}
          </Link>
        }
      >
        <div className="border-y border-line py-5 text-sm leading-6 text-ink-mid">
          {t("resetPassword.checkEmail.body")}
        </div>
        <Link
          href="/login"
          className="mt-5 flex h-11 w-full items-center justify-center rounded-md bg-accent-solid text-sm font-semibold text-accent-solid-ink transition hover:bg-accent-solid-hover focus-ring"
        >
          {t("resetPassword.openLogin")}
        </Link>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      eyebrow={t("resetPassword.eyebrow")}
      title={t("auth.resetPassword")}
      description={t("resetPassword.description")}
      footer={
        <Link href="/login" className="transition hover:text-ink">
          {t("auth.backToLogin")}
        </Link>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          id="email"
          label={t("auth.email")}
          type="email"
          value={email}
          onChange={(e) => {
            if (emailError) setEmailError(null);
            setEmail(e.target.value);
          }}
          placeholder={t("resetPassword.emailPlaceholder")}
          required
          error={emailError ?? undefined}
        />

        <button
          type="submit"
          disabled={loading || !email}
          className="flex h-11 w-full items-center justify-center rounded-md bg-accent-solid text-sm font-semibold text-accent-solid-ink transition hover:bg-accent-solid-hover disabled:cursor-not-allowed disabled:bg-surface-hover disabled:text-ink-dim focus-ring"
        >
          {loading ? t("resetPassword.sending") : t("resetPassword.sendLink")}
        </button>
      </form>
    </AuthScreen>
  );
}

function NewPasswordForm({ token }: { token: string }) {
  const { t } = useT();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setConfirmError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setPasswordError(t("auth.passwordMinChars", { count: String(MIN_PASSWORD_LENGTH) }));
      return;
    }
    if (password !== confirm) {
      // Field-level validation: inline error is the single announcement
      // (WCAG 4.1.3, rendered role="alert") — no duplicate error toast.
      setConfirmError(t("resetPassword.confirmPassword.mismatch"));
      return;
    }
    setLoading(true);
    try {
      await apiFetch("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, newPassword: password }),
      });
      setDone(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : t("resetPassword.error.genericFailed");
      // Inline field error is the single announcement (WCAG 4.1.3) — no toast.
      setPasswordError(message);
    }
    setLoading(false);
  };

  if (done) {
    return (
      <AuthScreen
        eyebrow={t("resetPassword.updated.eyebrow")}
        title={t("resetPassword.updated.title")}
        description={t("resetPassword.updated.description")}
      >
        <Link
          href="/login"
          className="flex h-11 w-full items-center justify-center rounded-md bg-accent-solid text-sm font-semibold text-accent-solid-ink transition hover:bg-accent-solid-hover focus-ring"
        >
          {t("nav.logIn")}
        </Link>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      eyebrow={t("resetPassword.newPassword.eyebrow")}
      title={t("resetPassword.newPassword.title")}
      description={t("resetPassword.newPassword.description")}
      footer={
        <Link href="/login" className="transition hover:text-ink">
          {t("auth.backToLogin")}
        </Link>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          id="password"
          label={t("resetPassword.newPassword.label")}
          type="password"
          value={password}
          onChange={(e) => {
            if (passwordError) setPasswordError(null);
            setPassword(e.target.value);
          }}
          placeholder={t("auth.passwordMin")}
          required
          minLength={MIN_PASSWORD_LENGTH}
          error={passwordError ?? undefined}
        />

        <Input
          id="confirm"
          label={t("resetPassword.confirmPassword.label")}
          type="password"
          value={confirm}
          onChange={(e) => {
            if (confirmError) setConfirmError(null);
            setConfirm(e.target.value);
          }}
          placeholder={t("resetPassword.confirmPassword.placeholder")}
          required
          minLength={MIN_PASSWORD_LENGTH}
          error={confirmError ?? undefined}
        />

        <button
          type="submit"
          disabled={loading || !password || !confirm}
          className="flex h-11 w-full items-center justify-center rounded-md bg-accent-solid text-sm font-semibold text-accent-solid-ink transition hover:bg-accent-solid-hover disabled:cursor-not-allowed disabled:bg-surface-hover disabled:text-ink-dim focus-ring"
        >
          {loading ? t("resetPassword.resetting") : t("auth.resetPassword")}
        </button>
      </form>
    </AuthScreen>
  );
}
