/**
 * Row signals — the per-row context chips (mail-first shell, 2026-08-26).
 *
 * The lanes move from navigation to labels: every row carries its lane chip,
 * plus ONE relationship/category signal so the intelligence shows on the row
 * without turning it into a tag cloud. These are the pure mappings the route
 * uses; each claim must come from a recorded fact, never a guess — a wrong
 * "first contact" label on a ten-year colleague is worse than no label.
 */

import { describe, expect, it } from "vitest";
import { gmailCategoryOf, rowSignalFor } from "../judge/row-signals.js";

describe("gmailCategoryOf", () => {
  it("maps Gmail category labels, first match in fixed precedence", () => {
    expect(gmailCategoryOf(["INBOX", "CATEGORY_PROMOTIONS"])).toBe("promotions");
    expect(gmailCategoryOf(["CATEGORY_SOCIAL", "UNREAD"])).toBe("social");
    expect(gmailCategoryOf(["CATEGORY_UPDATES"])).toBe("updates");
    expect(gmailCategoryOf(["CATEGORY_FORUMS"])).toBe("forums");
    // Promotions wins when Gmail stamps several (it is the strongest claim).
    expect(gmailCategoryOf(["CATEGORY_UPDATES", "CATEGORY_PROMOTIONS"])).toBe("promotions");
    expect(gmailCategoryOf(["INBOX", "IMPORTANT"])).toBeNull();
    expect(gmailCategoryOf(undefined)).toBeNull();
  });
});

describe("rowSignalFor", () => {
  it("category outranks relationship — a newsletter is never 'first contact'", () => {
    expect(rowSignalFor({ category: "promotions", repliedCount: 0 })).toEqual({
      kind: "category",
      category: "promotions",
    });
  });

  it("replied count is the personal signal when history exists", () => {
    expect(rowSignalFor({ category: null, repliedCount: 6 })).toEqual({
      kind: "replied",
      count: 6,
    });
  });

  it("no category and no reply history = first contact", () => {
    expect(rowSignalFor({ category: null, repliedCount: 0 })).toEqual({ kind: "first" });
  });

  it("unknown history (no engagement lookup) claims nothing", () => {
    // null repliedCount means we could not look it up — a missing fact must
    // render as no chip, not as "first contact".
    expect(rowSignalFor({ category: null, repliedCount: null })).toBeNull();
  });
});
