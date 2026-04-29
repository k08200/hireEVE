/**
 * Cold-start resilient DB call wrapper.
 *
 * Neon's serverless Postgres compute auto-suspends after ~5 minutes of
 * inactivity. The first request after suspend triggers a wake-up that takes
 * a couple of seconds, and Prisma's default connection timeout often gives
 * up in that window with "Can't reach database server". The user then sees
 * a hard failure on a happy path (e.g. Google login), which is the worst
 * possible UX surface for a transient infrastructure event.
 *
 * `withDbRetry` retries cold-start-shaped failures with exponential
 * backoff so the wake-up completes silently. Application errors (unique
 * constraint, record not found, etc.) still propagate immediately —
 * silent retry on those would mask real bugs.
 */

const COLD_START_PATTERNS: ReadonlyArray<RegExp> = [
  /can't reach database server/i,
  /server has closed the connection/i,
  /connection terminated/i,
  /connection refused/i,
  /timed out fetching a new connection/i,
  /timed out trying to reach/i,
  /econnreset/i,
  /etimedout/i,
  /ehostunreach/i,
  /enetunreach/i,
];

const DEFAULT_MAX_ATTEMPTS = 4;
const DEFAULT_BASE_DELAY_MS = 250;
const JITTER_MS = 100;

export interface WithDbRetryOptions {
  /** Total attempts including the first call. Default 4 (≈ initial + 3 retries). */
  maxAttempts?: number;
  /** Base delay before the first retry; doubles each subsequent retry. Default 250ms. */
  baseDelayMs?: number;
  /** Optional label included in console logs so retry events are diagnosable. */
  label?: string;
  /** Injectable sleep — primarily for tests; defaults to setTimeout-based wait. */
  sleep?: (ms: number) => Promise<void>;
}

export function isColdStartError(err: unknown): boolean {
  if (!err) return false;
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : null;
  if (!message) return false;
  return COLD_START_PATTERNS.some((p) => p.test(message));
}

export async function withDbRetry<T>(
  fn: () => Promise<T>,
  opts: WithDbRetryOptions = {},
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const sleep = opts.sleep ?? defaultSleep;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isColdStartError(err)) throw err;
      if (attempt === maxAttempts) break;
      const delay = baseDelayMs * 2 ** (attempt - 1) + Math.floor(Math.random() * JITTER_MS);
      if (opts.label) {
        // Cold-start retries are quiet by default; log when caller opts in via label
        // so production traces show "OAuth callback retried 2/4 after cold start".
        console.warn(
          `[db-retry] ${opts.label}: cold-start retry ${attempt}/${maxAttempts - 1} after ${delay}ms`,
        );
      }
      await sleep(delay);
    }
  }
  throw lastErr;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
