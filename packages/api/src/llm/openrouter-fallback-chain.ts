/**
 * OpenRouter fallback chain (cheap PAID SKUs since 2026-08-10).
 *
 * OpenRouter retires :free SKUs without notice (e.g. google/gemini-2.5-flash:free
 * silently became 404 in early June 2026). The autonomous agent — which runs as a
 * background cron — has no way to recover from that, so every cycle was failing
 * until an operator manually updated the AGENT_MODEL env var.
 *
 * When the configured model returns 404 / "no endpoints found" on OpenRouter,
 * createCompletion walks this chain on the same provider before giving up. Each
 * entry is a known-stable :free SKU; the chain is ordered so the most
 * capable / well-tooled model comes first. Entries are paid-but-cheap on
 * purpose — see the note on the constant for why :free chains kept failing.
 *
 * Override the chain via OPENROUTER_FALLBACK_CHAIN (comma-separated). Useful
 * when OpenRouter publishes a hot new free SKU you want to prefer, or to
 * react quickly to a fleet of retirements without a redeploy.
 */

import {
  isCreditError,
  isFreeModel,
  isFreeModelFallbackDisabled,
  isKeyLimitError,
  isModelUnavailableError,
} from "./model-fallback.js";

// PAID, cheap, and alive — founder decision 2026-08-10: stop chaining :free
// SKUs. Three reasons, all of them things that actually bit us:
//   1. :free SKUs are retired without notice. Three of the five entries dated
//      2026-06-12 were already gone by 08-10, so the chain sat two-thirds
//      dead while the daily catalog check emailed into an unread inbox.
//   2. DISABLE_FREE_MODEL_FALLBACK (set in hosted prod, because :free hosts
//      may train on request data) filters :free entries out — an all-free
//      chain therefore collapses to NOTHING exactly when it is needed.
//   3. :free endpoints share one per-key daily limit, so the second entry is
//      already rate-limited when the first one trips it.
// Prices below are per 1M tokens from the live catalog on 2026-08-10
// (in/out); every id was confirmed present AND advertising tool support.
// Ordered reliability-first, not purely cheapest: a fallback that returns
// malformed JSON costs more than it saves.
export const DEFAULT_OPENROUTER_FALLBACK_CHAIN: ReadonlyArray<string> = [
  "google/gemini-3.1-flash-lite", // $0.25 / $1.50 — same vendor as the primary
  "openai/gpt-5-nano", //            $0.05 / $0.40 — 400k ctx, solid tool use
  "openai/gpt-oss-120b", //          $0.037 / $0.17
  "qwen/qwen3.7-flash", //           $0.03 / $0.13 — 1M ctx, cheapest usable
  "mistralai/mistral-nemo", //       $0.019 / $0.03 — last-ditch, cheapest out
];

export function parseFallbackChain(envValue: string | undefined): string[] {
  if (!envValue) return [...DEFAULT_OPENROUTER_FALLBACK_CHAIN];
  const parts = envValue
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [...DEFAULT_OPENROUTER_FALLBACK_CHAIN];
}

export const OPENROUTER_FALLBACK_CHAIN: ReadonlyArray<string> = parseFallbackChain(
  process.env.OPENROUTER_FALLBACK_CHAIN,
);

/**
 * The chain minus :free entries when the privacy kill switch is on
 * (DISABLE_FREE_MODEL_FALLBACK — hosted prod). :free hosts may train on
 * request data, and with the OpenRouter account's "free endpoints that may
 * train" toggle off they are refused anyway — walking them is just doomed
 * round trips before the next provider. PAID entries of a custom env chain
 * are kept. Computed at call time so tests can flip the env freely.
 */
export function activeFallbackChain(): ReadonlyArray<string> {
  if (!isFreeModelFallbackDisabled()) return OPENROUTER_FALLBACK_CHAIN;
  return OPENROUTER_FALLBACK_CHAIN.filter((m) => !isFreeModel(m));
}

/**
 * Walk a fallback chain looking for a successful call.
 *
 * Behavior:
 *   - Skips `alreadyTriedModel` so we never retry the original failure.
 *   - Each entry tried in order. Returns the FIRST success.
 *   - If the executor throws `isModelUnavailableError` on an entry, try the next.
 *   - If it throws a credit/quota error, bail out and return null (caller
 *     should move to the next *provider*, not keep burning this one).
 *   - Any other error is re-thrown so the caller sees the real failure.
 *   - Returns null if the whole chain was exhausted without success.
 */
export async function walkFallbackChain<T>(
  chain: ReadonlyArray<string>,
  alreadyTriedModel: string | undefined,
  execute: (model: string) => Promise<T>,
): Promise<T | null> {
  for (const candidate of chain) {
    if (candidate === alreadyTriedModel) continue;
    try {
      return await execute(candidate);
    } catch (err) {
      if (isModelUnavailableError(err)) continue;
      if (isCreditError(err) || isKeyLimitError(err)) return null;
      throw err;
    }
  }
  return null;
}
