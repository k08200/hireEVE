/**
 * Pure units of the Apple/Naver login path: the account-resolution policy
 * (the security core — identity wins, unverified email never attaches OR
 * creates) and the provider payload parsers.
 */

import { describe, expect, it } from "vitest";
import { parseAppleClaims } from "../auth/apple.js";
import { isNaverVerifiedEmail, parseNaverProfile } from "../auth/naver.js";
import { resolveSocialLoginAction } from "../auth/social-identity.js";

describe("resolveSocialLoginAction", () => {
  it("an existing (provider, subject) identity always signs in as its user", () => {
    expect(
      resolveSocialLoginAction({
        identityUserId: "u1",
        emailUserId: "u2", // email drift at the provider must not fork/steal
        emailVerified: false,
      }),
    ).toEqual({ kind: "signin", userId: "u1" });
  });

  it("verified email attaches to the existing owner", () => {
    expect(
      resolveSocialLoginAction({ identityUserId: null, emailUserId: "u2", emailVerified: true }),
    ).toEqual({ kind: "attach", userId: "u2" });
  });

  it("verified + unclaimed email creates a fresh user", () => {
    expect(
      resolveSocialLoginAction({ identityUserId: null, emailUserId: null, emailVerified: true }),
    ).toEqual({ kind: "create" });
  });

  it("unverified email NEVER attaches to an existing account (takeover vector)", () => {
    expect(
      resolveSocialLoginAction({
        identityUserId: null,
        emailUserId: "victim",
        emailVerified: false,
      }),
    ).toEqual({ kind: "reject_collision" });
  });

  it("unverified email cannot pre-claim an unclaimed address either", () => {
    expect(
      resolveSocialLoginAction({ identityUserId: null, emailUserId: null, emailVerified: false }),
    ).toEqual({ kind: "reject_unverified" });
  });
});

describe("parseAppleClaims", () => {
  it("accepts boolean and string spellings of email_verified", () => {
    expect(parseAppleClaims({ sub: "s1", email: "a@b.com", email_verified: true })).toEqual({
      sub: "s1",
      email: "a@b.com",
      emailVerified: true,
    });
    expect(parseAppleClaims({ sub: "s1", email: "a@b.com", email_verified: "true" })).toEqual({
      sub: "s1",
      email: "a@b.com",
      emailVerified: true,
    });
  });

  it("treats a missing/false claim as unverified", () => {
    expect(parseAppleClaims({ sub: "s1", email: "a@b.com" })?.emailVerified).toBe(false);
    expect(
      parseAppleClaims({ sub: "s1", email: "a@b.com", email_verified: "false" })?.emailVerified,
    ).toBe(false);
  });

  it("rejects payloads without a usable sub or email", () => {
    expect(parseAppleClaims({ email: "a@b.com" })).toBeNull();
    expect(parseAppleClaims({ sub: "s1" })).toBeNull();
    expect(parseAppleClaims({ sub: "s1", email: "not-an-email" })).toBeNull();
    expect(parseAppleClaims({ sub: "", email: "a@b.com" })).toBeNull();
  });
});

describe("parseNaverProfile", () => {
  it("parses the /v1/nid/me envelope", () => {
    expect(
      parseNaverProfile({
        resultcode: "00",
        response: { id: "n1", email: "u@naver.com", name: "유저" },
      }),
    ).toEqual({ id: "n1", email: "u@naver.com", name: "유저" });
  });

  it("rejects envelopes without id or email", () => {
    expect(parseNaverProfile({})).toBeNull();
    expect(parseNaverProfile({ response: { email: "u@naver.com" } })).toBeNull();
    expect(parseNaverProfile({ response: { id: "n1" } })).toBeNull();
    expect(parseNaverProfile({ response: { id: "n1", email: "nope" } })).toBeNull();
  });
});

describe("isNaverVerifiedEmail", () => {
  it("vouches only for provider-owned @naver.com addresses", () => {
    expect(isNaverVerifiedEmail("user@naver.com")).toBe(true);
    expect(isNaverVerifiedEmail("USER@NAVER.COM")).toBe(true);
    // A Naver profile's external contact email is user-editable — never trust it.
    expect(isNaverVerifiedEmail("victim@gmail.com")).toBe(false);
    expect(isNaverVerifiedEmail("user@naver.com.evil.com")).toBe(false);
  });
});
