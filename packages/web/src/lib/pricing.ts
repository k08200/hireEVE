/**
 * The displayed Pro price, in one place.
 *
 * It used to be a string literal in three components, each carrying a comment
 * telling the next reader to keep the others in sync. They drifted anyway: on
 * 2026-08-12 the app advertised $7.99 while the Paddle price, the Terms page
 * and both landings all said $8.99 — an advertised price that did not match
 * what the customer would actually be charged.
 *
 * Anything user-facing that quotes a price imports from here.
 */

/** Web checkout, billed through Paddle. Founder decision, 2026-08-10. */
export const PRO_PRICE_WEB = "$8.99";

/**
 * In-app purchase on iOS/Android. Higher because the store takes a cut.
 *
 * NOT derived from the web price: store pricing is tier-based, so this has to
 * match the tier actually configured in App Store Connect / Play Console.
 */
export const PRO_PRICE_NATIVE = "$9.99";

/** The price to show for the surface the user is on. */
export function proPrice(native: boolean): string {
  return native ? PRO_PRICE_NATIVE : PRO_PRICE_WEB;
}
