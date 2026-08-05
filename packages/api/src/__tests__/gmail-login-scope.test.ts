import { describe, expect, it, vi } from "vitest";

/**
 * getLoginAuthUrl builds the consent URL for SIGN-IN. Under incremental auth
 * (Google restricted-scope verification requirement), login must request
 * identity scopes ONLY — the Gmail/Calendar grant happens later through the
 * dedicated connect flow (getAuthUrl via POST /api/auth/google/start). A login
 * URL that bundles restricted scopes is a verification rejection risk and
 * regressing it would silently reopen that exposure.
 */

vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: class {
        generateAuthUrl(opts: {
          scope: string[];
          state: string;
          access_type?: string;
          prompt?: string;
        }) {
          return `https://accounts.google.com/o/oauth2/auth?access_type=${opts.access_type}&prompt=${opts.prompt}&state=${opts.state}&scope=${encodeURIComponent(opts.scope.join(" "))}`;
        }
      },
    },
  },
}));

import { getLoginAuthUrl } from "../mail/gmail.js";

describe("getLoginAuthUrl (incremental auth)", () => {
  it("requests identity scopes only — no Gmail, no Calendar", () => {
    const url = getLoginAuthUrl("signed-state-abc");
    expect(url).toContain("state=signed-state-abc");
    expect(url).toContain("openid");
    expect(url).toContain("userinfo.email");
    expect(url).toContain("userinfo.profile");
    expect(url).not.toContain("gmail");
    expect(url).not.toContain("calendar");
  });

  it("does not request offline access — no Google tokens are stored at login", () => {
    const url = getLoginAuthUrl("s");
    expect(url).not.toContain("access_type=offline");
  });
});
