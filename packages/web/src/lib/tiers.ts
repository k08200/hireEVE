/**
 * The lane names, in one place.
 *
 * There was no canonical list in the web package, so each surface carried its
 * own and they had drifted apart: the playground offered the pre-MEETING set
 * `["PUSH","QUEUE","SILENT","AUTO"]`, the firewall board three lanes, and the
 * privacy policy told users their mail was sorted into "PUSH / QUEUE / SILENT /
 * AUTO" — a sentence that stopped being true when MEETING and INFO shipped.
 *
 * The API's `TIERS` (packages/api/src/judge/tiers.ts) is the real source of
 * truth. This mirrors its core order for display; anything that renders a lane
 * list or states how many lanes there are should read it from here rather than
 * writing the names out again.
 */

/** User-visible lanes, in the order they are shown. AUTO is a classification
 *  state rather than a lane and is deliberately not in this list. */
export const CORE_TIERS = ["PUSH", "MEETING", "QUEUE", "INFO", "SILENT"] as const;

export type CoreTier = (typeof CORE_TIERS)[number];

/** "PUSH / MEETING / QUEUE / INFO / SILENT" — for prose that names the lanes. */
export const TIER_NAMES = CORE_TIERS.join(" / ");

/** How many lanes there are, for prose that states a count. Never hard-code
 *  the number: it said "four" above a list of five for weeks. */
export const TIER_COUNT = CORE_TIERS.length;
