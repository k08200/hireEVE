/**
 * GET /api/auth/providers — which sign-in buttons the login page renders.
 *
 * Unauthenticated by design: the login page has no session yet, so this is
 * the one server-driven signal it can read (signup-status precedent).
 */

/**
 * Known login providers. The server only lists ENABLED ones — absence means
 * the deployment doesn't offer that button. Forward-compat: clients must
 * IGNORE ids they do not recognize (an older client against a newer API
 * simply doesn't render the new provider's button).
 */
export type AuthProviderId = "google" | "apple" | "naver";

export interface AuthProviderInfo {
  id: AuthProviderId;
}

export interface AuthProvidersResponse {
  providers: AuthProviderInfo[];
}
