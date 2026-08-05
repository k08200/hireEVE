/**
 * Auto-reply row scope (Phase 1 per-account send routing).
 *
 * With no linked ids (flag off, or multi-inbox sync off) the scope must be
 * byte-identical to the historical primary-only filter. With linked GOOGLE
 * account ids it widens to exactly those accounts — never a blanket
 * "any linked row" (a NAVER row must stay out: its provider cannot send).
 */

import { describe, expect, it } from "vitest";
import { autoReplyEmailWhere } from "../mail/auto-reply-scope.js";

describe("autoReplyEmailWhere", () => {
  it("is the exact historical primary-only filter when no linked ids are given", () => {
    expect(autoReplyEmailWhere("u1", [])).toEqual({
      userId: "u1",
      linkedInboxAccountId: null,
    });
  });

  it("widens to primary + exactly the given linked accounts", () => {
    expect(autoReplyEmailWhere("u1", ["acc-1", "acc-2"])).toEqual({
      userId: "u1",
      OR: [{ linkedInboxAccountId: null }, { linkedInboxAccountId: { in: ["acc-1", "acc-2"] } }],
    });
  });
});
