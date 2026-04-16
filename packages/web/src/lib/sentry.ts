/**
 * Sentry Client Error Tracking — Lightweight browser-side error capture.
 *
 * Initializes only when NEXT_PUBLIC_SENTRY_DSN is set.
 * Captures unhandled errors and provides manual captureError() helper.
 */

import * as Sentry from "@sentry/nextjs";

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || "";

let initialized = false;

export function initSentryClient(): void {
  if (!DSN || initialized) return;

  Sentry.init({
    dsn: DSN,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  });

  initialized = true;
}

export function captureClientError(error: unknown, context?: Record<string, unknown>): void {
  if (!initialized) return;
  const err = error instanceof Error ? error : new Error(String(error));
  Sentry.withScope((scope) => {
    if (context) {
      for (const [k, v] of Object.entries(context)) {
        scope.setExtra(k, v);
      }
    }
    Sentry.captureException(err);
  });
}
