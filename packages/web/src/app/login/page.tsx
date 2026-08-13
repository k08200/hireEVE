"use client";

import type { AuthProvidersResponse } from "@klorn/contract";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import AuthScreen from "../../components/auth-screen";
import { useToast } from "../../components/toast";
import { Input } from "../../components/ui/input";
import { API_BASE, apiFetch } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useT } from "../../lib/i18n";
import { startNativeGoogleLogin } from "../../lib/native/native-auth";
import { isNativeShell } from "../../lib/native/shell";

const MIN_PASSWORD_LENGTH = 8;

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  // Honor ?mode=register so external CTAs (landing "Get started", DM links)
  // can land directly on the sign-up tab instead of the default login tab.
  const initialMode: "login" | "register" =
    searchParams.get("mode") === "register" ? "register" : "login";
  const [mode, setMode] = useState<"login" | "register">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const { login, register, user, loading: authLoading } = useAuth();
  const { t } = useT();
  const { toast } = useToast();
  const router = useRouter();
  const nextPath = safeNextPath(searchParams.get("next"));

  // First field of the form — focus moves here when the mode toggles so
  // keyboard/AT users are not stranded after the fields swap.
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  // Skip the very first render so we don't steal focus on initial mount.
  const modeMounted = useRef(false);

  const changeMode = (next: "login" | "register") => {
    setEmailError(null);
    setPasswordError(null);
    setMode(next);
  };

  useEffect(() => {
    if (!modeMounted.current) {
      modeMounted.current = true;
      return;
    }
    const first = mode === "register" ? nameRef.current : emailRef.current;
    first?.focus();
  }, [mode]);

  // In the native shell, Google blocks OAuth inside the WebView, so intercept
  // the link and run the system-browser flow instead. On the web the <a href>
  // navigates normally (no-op here).
  const handleGoogleClick = (e: React.MouseEvent) => {
    if (!isNativeShell()) return;
    e.preventDefault();
    startNativeGoogleLogin().catch((err) => {
      console.error("[AUTH] Native Google login failed:", err);
      toast(t("auth.googleSignInError"), "error");
    });
  };

  // Server controls whether sign-up is open. When BETA_GATE_ENABLED is on,
  // hide the Sign-up tab and point new visitors at /early-access. Until the
  // probe resolves we assume open so existing users with the gate off see
  // no flash; signupOpen flips to false the moment the response arrives.
  const signupStatus = useQuery({
    queryKey: ["auth", "signup-status"],
    queryFn: () => apiFetch<{ open: boolean }>("/api/auth/signup-status"),
    staleTime: 5 * 60_000,
  });
  const signupOpen = signupStatus.data?.open ?? true;
  useEffect(() => {
    if (!signupOpen && mode === "register") setMode("login");
  }, [signupOpen, mode]);

  // Server-advertised sign-in providers (GET /api/auth/providers). Google
  // renders unconditionally — it must never be held hostage to this probe;
  // Apple/Naver buttons appear only when the deployment enables them.
  // Hidden in the native shell: those providers block WebView OAuth like
  // Google does, and the external-browser relay currently speaks Google only.
  const providersQuery = useQuery({
    queryKey: ["auth", "providers"],
    queryFn: () => apiFetch<AuthProvidersResponse>("/api/auth/providers"),
    staleTime: 5 * 60_000,
  });
  const [nativeShell, setNativeShell] = useState(false);
  useEffect(() => {
    setNativeShell(isNativeShell());
  }, []);
  const extraProviders = nativeShell
    ? []
    : (providersQuery.data?.providers ?? []).filter((p) => p.id === "apple" || p.id === "naver");

  useEffect(() => {
    if (!authLoading && user) {
      router.push(nextPath);
    }
  }, [user, authLoading, nextPath, router]);

  // Surface redirect feedback from Google OAuth and email verification.
  useEffect(() => {
    const error = searchParams.get("error");
    const verified = searchParams.get("verified");
    if (error) {
      const message =
        error === "google_failed"
          ? t("auth.googleSignInError")
          : error === "google_denied"
            ? t("auth.googleDenied")
            : error === "google_unverified"
              ? t("auth.googleUnverified")
              : error === "session_expired"
                ? t("auth.sessionExpired")
                : error === "invite_only"
                  ? t("auth.inviteOnlyRedirect")
                  : (socialErrorMessage(error, t) ?? error);
      toast(message, "error");
    }
    if (verified) {
      toast(t("auth.emailVerified"), "success");
    }
  }, [searchParams, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(null);
    setPasswordError(null);
    if (!email || !password) return;

    if (mode === "register" && password.length < MIN_PASSWORD_LENGTH) {
      setPasswordError(t("auth.passwordMinChars", { count: String(MIN_PASSWORD_LENGTH) }));
      return;
    }

    setLoading(true);
    try {
      if (mode === "login") {
        await login(email, password, nextPath);
        toast(t("auth.welcomeBack"), "success");
      } else {
        await register(email, password, name || undefined, nextPath);
        toast(t("auth.accountCreated"), "success");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("auth.genericError");
      const match = msg.match(/API \d+: (.+)/);
      const parsed = match
        ? (() => {
            try {
              return JSON.parse(match[1]).error;
            } catch {
              return match[1];
            }
          })()
        : msg;
      // Inline field error is the single announcement (WCAG 4.1.3) — the
      // message is attached to a field and rendered role="alert", so we do NOT
      // also fire a toast with the same text (that would announce it twice).
      // "Email already registered" (409 on register) is about the EMAIL field,
      // so route duplicate-email messages there first; only the ambiguous login
      // 401 ("Invalid email or password") lands on the password field.
      const isDuplicateEmail = /already (registered|exists|in use)|duplicate|taken/i.test(parsed);
      const isCredential = /password|credential|invalid|account/i.test(parsed);
      if (isDuplicateEmail) {
        setEmailError(parsed);
      } else if (isCredential) {
        setPasswordError(parsed);
      } else {
        setEmailError(parsed);
      }
    } finally {
      // Reset on EVERY path. The register branch previously `return`ed before
      // this reset, leaving the submit button stuck spinning "Creating
      // account..." whenever the post-register redirect didn't immediately
      // unmount the form (e.g. auth state not yet populated).
      setLoading(false);
    }
  };

  return (
    <AuthScreen
      eyebrow={mode === "login" ? t("auth.welcomeBack") : t("auth.signUp")}
      title={mode === "login" ? t("auth.titleLogin") : t("auth.titleRegister")}
      description={mode === "login" ? t("auth.descLogin") : t("auth.descRegister")}
      footer={
        <Link href="/" className="transition hover:text-ink-soft">
          {t("auth.backHome")}
        </Link>
      }
    >
      {nextPath !== "/inbox" && (
        <div className="mb-4 rounded-md border border-accent-muted/40 bg-accent-muted/10 px-3 py-2 text-xs leading-5 text-sky-800">
          {t("auth.signInToContinue", { destination: returnDestinationLabel(nextPath, t) })}
        </div>
      )}

      {/* Invite-only cohort: request access is the action almost every visitor
          needs, so it leads. Google sign-in 403s for the un-invited, so it drops
          to a clearly-labelled secondary path. One gate message replaces the old
          three-way callouts. When the beta gate is off, Google leads as before. */}
      {!signupOpen ? (
        <div className="space-y-4">
          <div className="rounded-md border border-accent-muted/40 bg-accent-muted/10 px-3 py-2.5 text-xs leading-5 text-sky-800">
            <span className="font-semibold text-sky-900">{t("auth.inviteOnlyTitle")}</span>{" "}
            {t("auth.inviteOnlyBody")}
          </div>

          <Link
            href="/early-access"
            className="flex h-11 w-full items-center justify-center rounded-md bg-accent text-sm font-semibold text-white shadow-sm shadow-accent-muted/20 transition hover:bg-sky-600 focus-ring"
          >
            {t("auth.requestEarlyAccess")}
          </Link>

          <a
            href={`${API_BASE}/api/auth/google/login`}
            onClick={handleGoogleClick}
            className="flex h-11 w-full items-center justify-center gap-3 rounded-md border border-line bg-transparent text-sm font-medium text-ink-mid transition hover:border-slate-300 hover:text-ink focus-ring"
          >
            <GoogleMark />
            {t("auth.googleApprovedSignIn")}
          </a>
        </div>
      ) : (
        <>
          <a
            href={`${API_BASE}/api/auth/google/login`}
            onClick={handleGoogleClick}
            className="flex h-11 w-full items-center justify-center gap-3 rounded-md bg-stone-100 text-sm font-semibold text-stone-900 shadow-sm transition hover:bg-surface-panel focus-ring"
          >
            <GoogleMark />
            {t("auth.continueWithGoogle")}
          </a>
          {extraProviders.map((provider) => (
            <a
              key={provider.id}
              href={`${API_BASE}/api/auth/${provider.id}/login`}
              className="mt-3 flex h-11 w-full items-center justify-center gap-3 rounded-md border border-line bg-transparent text-sm font-medium text-ink-soft transition hover:border-slate-300 hover:text-ink focus-ring"
            >
              {provider.id === "apple" ? <AppleMark /> : <NaverMark />}
              {provider.id === "apple" ? t("auth.continueWithApple") : t("auth.continueWithNaver")}
            </a>
          ))}
          {/* Marketing/doctrine copy is landing-page context — hide it on the app
              (mobile) for a clean login; keep it on desktop. */}
          <div className="mt-3 hidden space-y-2 text-center text-[11px] leading-5 text-ink-mid md:block">
            <p>{t("auth.betaScope")}</p>
            <p>{t("auth.noSilentActions")}</p>
            <p>
              <a
                href="https://github.com/k08200/klorn/blob/main/docs/doctrine/deterministic-floor.md"
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-slate-300 underline-offset-2 hover:text-sky-600 hover:decoration-accent-muted"
              >
                {t("auth.readDoctrine")}
              </a>
              <span className="ml-2 text-ink-dim">{t("auth.openSourceVersion")}</span>
            </p>
          </div>
        </>
      )}

      <div className="my-5 flex items-center gap-3">
        <div className="h-px flex-1 bg-slate-200" />
        <span className="text-xs text-ink-mid">
          {signupOpen ? t("auth.orContinueEmail") : t("auth.orSignInEmail")}
        </span>
        <div className="h-px flex-1 bg-slate-200" />
      </div>

      {signupOpen && (
        <div
          role="group"
          aria-label={t("auth.formGroupLabel")}
          className="mb-5 grid grid-cols-2 rounded-md border border-line bg-surface-raised p-1"
        >
          <button
            type="button"
            aria-pressed={mode === "login"}
            onClick={() => changeMode("login")}
            className={`h-11 rounded px-3 text-sm font-medium transition focus-ring ${
              mode === "login"
                ? "bg-surface-panel text-ink shadow-sm"
                : "text-ink-mid hover:text-ink"
            }`}
          >
            {t("nav.logIn")}
          </button>
          <button
            type="button"
            aria-pressed={mode === "register"}
            onClick={() => changeMode("register")}
            className={`h-11 rounded px-3 text-sm font-medium transition focus-ring ${
              mode === "register"
                ? "bg-surface-panel text-ink shadow-sm"
                : "text-ink-mid hover:text-ink"
            }`}
          >
            {t("auth.signUpShort")}
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === "register" && (
          <Input
            ref={nameRef}
            id="name"
            label={t("auth.name")}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("auth.name")}
          />
        )}

        <Input
          ref={emailRef}
          id="email"
          label={t("auth.email")}
          type="email"
          value={email}
          onChange={(e) => {
            if (emailError) setEmailError(null);
            setEmail(e.target.value);
          }}
          placeholder="you@example.com"
          required
          error={emailError ?? undefined}
        />

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <label htmlFor="password" className="block text-xs font-medium text-ink-mid">
              {t("auth.password")}
            </label>
            {mode === "login" && (
              <Link
                href="/reset-password"
                className="inline-flex min-h-10 items-center text-xs text-ink-mid transition hover:text-sky-600"
              >
                {t("auth.resetPassword")}
              </Link>
            )}
          </div>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => {
              if (passwordError) setPasswordError(null);
              setPassword(e.target.value);
            }}
            placeholder={mode === "register" ? t("auth.passwordMin") : t("auth.password")}
            required
            minLength={mode === "register" ? MIN_PASSWORD_LENGTH : undefined}
            error={passwordError ?? undefined}
          />
        </div>

        <button
          type="submit"
          disabled={loading || !email || !password}
          className="flex h-11 w-full items-center justify-center rounded-md bg-accent text-sm font-semibold text-white shadow-sm shadow-accent-muted/20 transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-ink-dim focus-ring"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-900 border-t-transparent" />
              {mode === "login" ? t("auth.signingIn") : t("auth.creatingAccount")}
            </span>
          ) : mode === "login" ? (
            t("auth.openDecisionQueue")
          ) : (
            t("auth.signUp")
          )}
        </button>
      </form>

      <div className="mt-5 border-t border-line pt-4 text-center text-xs text-ink-dim">
        {signupOpen ? (
          <>
            {mode === "login" ? t("auth.needAccount") : t("auth.haveAccount")}{" "}
            <button
              type="button"
              onClick={() => changeMode(mode === "login" ? "register" : "login")}
              className="inline-flex min-h-10 items-center font-medium text-sky-600 transition hover:text-accent focus-ring"
            >
              {mode === "login" ? t("auth.switchToSignUp") : t("auth.switchToLogIn")}
            </button>
          </>
        ) : (
          // Invite request already leads above; here we only help invited users
          // who lost their password, so we point at reset rather than repeat the
          // access CTA a third time.
          <>
            {t("auth.approvedCantSignIn")}{" "}
            <Link
              href="/reset-password"
              className="inline-flex min-h-10 items-center font-medium text-sky-600 transition hover:text-accent"
            >
              {t("auth.resetYourPassword")}
            </Link>
          </>
        )}
      </div>
    </AuthScreen>
  );
}

/**
 * Apple/Naver callback errors (`<provider>_<reason>` from the API's social
 * routes). null = not a social error; the caller shows the raw code.
 */
function socialErrorMessage(error: string, t: (key: string) => string): string | null {
  const match = /^(?:apple|naver)_(denied|failed|email_in_use|email_unverified)$/.exec(error);
  if (!match) return null;
  switch (match[1]) {
    case "denied":
      return t("auth.socialDenied");
    case "email_in_use":
      return t("auth.socialEmailInUse");
    case "email_unverified":
      return t("auth.socialEmailUnverified");
    default:
      return t("auth.socialSignInError");
  }
}

function AppleMark() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M16.7 12.9c0-2.4 2-3.6 2.1-3.7-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9-.8 0-1.9-.9-3.2-.9-1.6 0-3.1 1-4 2.4-1.7 2.9-.4 7.2 1.2 9.6.8 1.2 1.8 2.5 3.1 2.4 1.2 0 1.7-.8 3.2-.8s1.9.8 3.2.8c1.3 0 2.2-1.2 3-2.4.9-1.4 1.3-2.7 1.3-2.8-.1 0-2.6-1-2.7-3.6zM14.4 5.6c.7-.8 1.1-1.9 1-3.1-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.9-1 3 1.1.1 2.2-.6 2.9-1.4z" />
    </svg>
  );
}

function NaverMark() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24">
      <rect width="24" height="24" rx="4" fill="#03C75A" />
      <path fill="#fff" d="M13.9 6.5v5.4L10.1 6.5H6.5v11h3.6v-5.4l3.8 5.4h3.6v-11z" />
    </svg>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function safeNextPath(value: string | null): string {
  if (!value) return "/inbox";
  if (!value.startsWith("/") || value.startsWith("//")) return "/inbox";
  if (value.startsWith("/login")) return "/inbox";
  return value;
}

function returnDestinationLabel(path: string, t: (key: string) => string): string {
  const cleanPath = path.split("?")[0] || path;
  if (cleanPath === "/inbox") return t("nav.decisionQueue");
  if (cleanPath === "/email" || cleanPath.startsWith("/email/")) return t("nav.mail");
  if (cleanPath === "/calendar") return t("nav.calendar");
  if (cleanPath === "/briefing") return t("nav.briefing");
  if (cleanPath === "/settings") return t("settings.title");
  if (cleanPath.startsWith("/settings/memory")) return t("auth.destMemory");
  if (cleanPath.startsWith("/settings/usage")) return t("auth.destUsage");
  if (cleanPath.startsWith("/settings/status")) return t("auth.destStatus");
  if (cleanPath.startsWith("/settings/email-feedback")) return t("auth.destFeedback");
  if (cleanPath === "/billing") return t("nav.billing");
  if (cleanPath === "/files") return t("auth.destFiles");
  if (cleanPath === "/admin" || cleanPath.startsWith("/admin/")) return t("nav.admin");
  return path;
}
