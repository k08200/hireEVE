/**
 * Per-row context signals (mail-first shell, 2026-08-26).
 *
 * The inbox shows one chronological list; the intelligence rides on the rows
 * as labels — the lane chip, plus at most ONE of the signals below so a row
 * never becomes a tag cloud. Every signal is a recorded fact: Gmail's own
 * category labels, or the user's reply history. Nothing here guesses — a
 * wrong "first contact" on a ten-year colleague is worse than no label.
 */

export type GmailCategory = "promotions" | "social" | "updates" | "forums";

/** Fixed precedence; promotions is the strongest claim when Gmail stamps several. */
const CATEGORY_LABELS: [string, GmailCategory][] = [
  ["CATEGORY_PROMOTIONS", "promotions"],
  ["CATEGORY_SOCIAL", "social"],
  ["CATEGORY_UPDATES", "updates"],
  ["CATEGORY_FORUMS", "forums"],
];

export function gmailCategoryOf(labels: string[] | undefined): GmailCategory | null {
  if (!labels?.length) return null;
  const set = new Set(labels);
  for (const [label, category] of CATEGORY_LABELS) {
    if (set.has(label)) return category;
  }
  return null;
}

export type RowSignal =
  | { kind: "category"; category: GmailCategory }
  | { kind: "replied"; count: number }
  | { kind: "first" }
  | null;

/**
 * The one non-lane chip a row shows. Category outranks relationship (a
 * newsletter must never read as "first contact"); a null repliedCount means
 * the engagement lookup did not run for this row, and a missing fact renders
 * as no chip rather than a false one.
 */
export function rowSignalFor(input: {
  category: GmailCategory | null;
  repliedCount: number | null;
}): RowSignal {
  if (input.category) return { kind: "category", category: input.category };
  if (input.repliedCount === null) return null;
  if (input.repliedCount > 0) return { kind: "replied", count: input.repliedCount };
  return { kind: "first" };
}
