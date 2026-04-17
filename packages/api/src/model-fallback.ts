/**
 * Model Fallback — Automatic switch to free model when API budget is exhausted.
 *
 * When OpenRouter returns 402 (insufficient credits), EVE seamlessly falls back
 * to a free model so the service stays operational without interruption.
 * Periodically retries the primary model to auto-recover when budget is replenished.
 */

/** Free model used when paid API budget runs out */
export const FALLBACK_MODEL =
  process.env.FALLBACK_MODEL || "google/gemma-4-31b-it:free";

/** How long (ms) to stay on fallback before retrying the primary model */
const RETRY_PRIMARY_AFTER_MS = 5 * 60 * 1000; // 5 minutes

/** Timestamp when budget exhaustion was first detected (null = budget OK) */
let budgetExhaustedAt: number | null = null;

/** Check whether we're currently in fallback mode */
export function isBudgetExhausted(): boolean {
  if (budgetExhaustedAt === null) return false;

  // After cooldown, optimistically try the primary model again
  if (Date.now() - budgetExhaustedAt > RETRY_PRIMARY_AFTER_MS) {
    budgetExhaustedAt = null;
    console.log("[MODEL-FALLBACK] Cooldown expired, retrying primary model");
    return false;
  }

  return true;
}

/** Mark budget as exhausted — triggers fallback mode */
export function markBudgetExhausted(): void {
  if (budgetExhaustedAt === null) {
    console.warn(
      `[MODEL-FALLBACK] Budget exhausted — switching to ${FALLBACK_MODEL}`,
    );
  }
  budgetExhaustedAt = Date.now();
}

/** Manually clear fallback mode (e.g. after budget top-up) */
export function clearBudgetExhausted(): void {
  budgetExhaustedAt = null;
  console.log("[MODEL-FALLBACK] Fallback mode cleared");
}

/** Detect whether an error indicates budget/credit exhaustion */
export function isBudgetError(error: unknown): boolean {
  // OpenRouter returns HTTP 402 for insufficient credits
  if (typeof error === "object" && error !== null && "status" in error) {
    if ((error as { status: number }).status === 402) return true;
  }

  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (
      msg.includes("402") ||
      msg.includes("insufficient credits") ||
      msg.includes("budget exceeded") ||
      msg.includes("payment required") ||
      msg.includes("out of credits")
    ) {
      return true;
    }
  }

  return false;
}

/** Returns true if the model is already a free tier model */
export function isFreeModel(model: string): boolean {
  return model.endsWith(":free");
}

/** Resolve a model, swapping to fallback if budget is exhausted */
export function resolveWithFallback(model: string): string {
  if (isFreeModel(model)) return model;
  return isBudgetExhausted() ? FALLBACK_MODEL : model;
}
