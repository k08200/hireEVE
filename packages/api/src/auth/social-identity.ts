/** Login providers beyond Google. Google keeps its own flow in routes/auth.ts. */
export type SocialProviderId = "apple" | "naver";

/** A verified assertion from the provider about who just signed in. */
export interface SocialIdentity {
  provider: SocialProviderId;
  /** The provider's stable user id (Apple `sub`, Naver `id`) — the real key. */
  subject: string;
  /** Normalized (trimmed, lowercased) email the provider reported. */
  email: string;
  /**
   * Whether the PROVIDER vouches for the email. Apple: the id_token's
   * email_verified claim. Naver: only provider-owned @naver.com addresses —
   * a Naver profile's external contact email is user-editable, so trusting
   * it would let anyone point their profile at a victim's address.
   */
  emailVerified: boolean;
  name?: string;
}

export type SocialLoginAction =
  | { kind: "signin"; userId: string }
  | { kind: "attach"; userId: string }
  | { kind: "create" }
  | { kind: "reject_collision" }
  | { kind: "reject_unverified" };

/**
 * Account-resolution policy for a completed social login. Pure for tests.
 *
 * - An existing (provider, subject) identity always signs in as its user —
 *   email drift at the provider (Apple relay rotation) must not fork accounts.
 * - No identity + an existing user on the same email: attach ONLY when the
 *   provider verified that email. Attaching on an unverified match would let
 *   anyone who can set an arbitrary email on their provider profile log into
 *   the victim's Klorn account — the same vector the Google branch closes
 *   with profile.verified_email (routes/auth.ts).
 * - No identity + unclaimed email: create ONLY when verified, too. Creating on
 *   an unverified address would let an attacker pre-claim a victim's email:
 *   the victim's later (verified) Google login resolves into the
 *   attacker-created row, which the attacker keeps opening through their own
 *   identity — a shared-account backdoor the takeover neutralization cannot
 *   remove because it only clears passwords, not identities.
 */
export function resolveSocialLoginAction(input: {
  identityUserId: string | null;
  emailUserId: string | null;
  emailVerified: boolean;
}): SocialLoginAction {
  if (input.identityUserId) return { kind: "signin", userId: input.identityUserId };
  if (!input.emailVerified) {
    return input.emailUserId ? { kind: "reject_collision" } : { kind: "reject_unverified" };
  }
  return input.emailUserId ? { kind: "attach", userId: input.emailUserId } : { kind: "create" };
}
