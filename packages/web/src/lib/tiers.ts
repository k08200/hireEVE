/**
 * The lane vocabulary for the web app, in one place.
 *
 * `@klorn/contract` owns the TYPE but ships no runtime code (its `exports`
 * declares only a `types` condition), so the iterable list has to live in the
 * consuming runtime. Before this file every surface wrote its own, and they
 * all drifted apart while CI stayed green:
 *
 *   - playground/page.tsx declared its own four-value `Tier` and indexed
 *     TIER_VISUAL[result.tier] unguarded. api.klorn.ai answers a calendar
 *     invite with MEETING, so pasting one threw during render.
 *   - onboarding/review-step.tsx grouped by ["PUSH","QUEUE","AUTO","SILENT"]
 *     then dropped empty groups, so MEETING and INFO mail disappeared from the
 *     first-run review without a trace — and with it the chance to collect any
 *     DecisionLabel ground truth for those two lanes.
 *   - the firewall summary counted a lane that no longer occurs (AUTO) and
 *     omitted two that do.
 *
 * `check-lane-vocabulary.mjs` fails the build on a restated list.
 */

import type { LiveTier } from "@klorn/contract";

/**
 * The five lanes the classifier can emit, loudest first. This is the display
 * order the product and the copy both use: PUSH / MEETING / QUEUE / INFO /
 * SILENT.
 */
export const LIVE_TIERS = ["PUSH", "MEETING", "QUEUE", "INFO", "SILENT"] as const;

/**
 * Compile-time completeness. `LiveTier` is derived from the contract's `Tier`,
 * so adding a lane there breaks this line until LIVE_TIERS names it too — the
 * check a hand-maintained list otherwise never gets.
 */
const _allLanesListed: Record<LiveTier, true> = {
  PUSH: true,
  MEETING: true,
  QUEUE: true,
  INFO: true,
  SILENT: true,
};
void _allLanesListed;

/** True when the value is a lane mail can currently arrive in. */
export function isLiveTier(value: unknown): value is LiveTier {
  return typeof value === "string" && (LIVE_TIERS as readonly string[]).includes(value);
}
