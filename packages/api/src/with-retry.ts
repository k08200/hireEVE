/**
 * Auto-retry with Exponential Backoff — Inspired by Claude Code's services/api/withRetry.ts
 *
 * Wraps async operations with automatic retry logic for transient failures.
 * Used for LLM API calls and external service integrations.
 */

interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in ms before first retry (default: 1000) */
  initialDelayMs?: number;
  /** Maximum delay in ms between retries (default: 10000) */
  maxDelayMs?: number;
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier?: number;
  /** Function to determine if error is retryable (default: all errors) */
  isRetryable?: (error: unknown) => boolean;
  /** Callback on each retry attempt */
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
}

/**
 * Substrings in an error message that indicate a transient failure. Grouped by
 * category only for the reader — matching is a single scan over the union.
 */
const RETRYABLE_ERROR_KEYWORDS = [
  // Rate limit
  "rate limit",
  "429",
  "too many requests",
  // Timeouts
  "timeout",
  "timed out",
  "econnreset",
  // Server errors (5xx)
  "500",
  "502",
  "503",
  "504",
  // Network errors
  "network",
  "enotfound",
  "econnrefused",
] as const;

function hasRetryableStatus(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("status" in error)) return false;
  const status = (error as { status: unknown }).status;
  return typeof status === "number" && (status === 429 || status >= 500);
}

/** Default retryable error checker — retries on rate limits, timeouts, and server errors */
function defaultIsRetryable(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (RETRYABLE_ERROR_KEYWORDS.some((kw) => msg.includes(kw))) return true;
  }
  return hasRetryableStatus(error);
}

/**
 * Execute an async function with automatic retry on transient failures.
 *
 * @example
 * const result = await withRetry(
 *   () => openai.chat.completions.create({ ... }),
 *   { maxRetries: 3, onRetry: (attempt, err) => console.log(`Retry ${attempt}`) }
 * );
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    maxDelayMs = 10000,
    backoffMultiplier = 2,
    isRetryable = defaultIsRetryable,
    onRetry,
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry if we've exhausted attempts or error isn't retryable
      if (attempt >= maxRetries || !isRetryable(error)) {
        throw error;
      }

      // Calculate delay with exponential backoff + jitter
      const baseDelay = initialDelayMs * backoffMultiplier ** attempt;
      const jitter = Math.random() * 0.3 * baseDelay; // 0-30% jitter
      const delay = Math.min(baseDelay + jitter, maxDelayMs);

      if (onRetry) {
        onRetry(attempt + 1, error, delay);
      }

      await sleep(delay);
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
