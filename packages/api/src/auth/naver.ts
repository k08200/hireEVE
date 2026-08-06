/**
 * Naver OAuth LOGIN (who the user is) — distinct from the Naver IMAP mail
 * connect in routes/imap-connect.ts (which mail they read). Dark until
 * NAVER_LOGIN_ENABLED flips (config.ts).
 *
 * Required env once enabled:
 *   NAVER_CLIENT_ID / NAVER_CLIENT_SECRET — from developers.naver.com
 *   NAVER_REDIRECT_URI — https://<api>/api/auth/naver/callback
 */
const NAVER_AUTH_URL = "https://nid.naver.com/oauth2.0/authorize";
const NAVER_TOKEN_URL = "https://nid.naver.com/oauth2.0/token";
const NAVER_PROFILE_URL = "https://openapi.naver.com/v1/nid/me";

export interface NaverProfile {
  id: string;
  email: string;
  name?: string;
}

function naverClientId(): string {
  return process.env.NAVER_CLIENT_ID ?? "";
}

export function buildNaverAuthUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: naverClientId(),
    redirect_uri: process.env.NAVER_REDIRECT_URI ?? "",
    state,
  });
  return `${NAVER_AUTH_URL}?${params}`;
}

/** Exchange the authorization code for an access token (Naver echoes state). */
export async function exchangeNaverCode(code: string, state: string): Promise<string | null> {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: naverClientId(),
    client_secret: process.env.NAVER_CLIENT_SECRET ?? "",
    code,
    state,
  });
  const res = await fetch(`${NAVER_TOKEN_URL}?${params}`);
  if (!res.ok) {
    console.warn(`[NAVER] token exchange failed: ${res.status}`);
    return null;
  }
  const json = (await res.json()) as { access_token?: string };
  return typeof json.access_token === "string" ? json.access_token : null;
}

export async function fetchNaverProfile(accessToken: string): Promise<NaverProfile | null> {
  const res = await fetch(NAVER_PROFILE_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    console.warn(`[NAVER] profile fetch failed: ${res.status}`);
    return null;
  }
  return parseNaverProfile((await res.json()) as Record<string, unknown>);
}

/** Pure parse of /v1/nid/me (exported for tests). id + email are required. */
export function parseNaverProfile(json: Record<string, unknown>): NaverProfile | null {
  const response = json.response as Record<string, unknown> | undefined;
  if (!response) return null;
  const id = typeof response.id === "string" && response.id.length > 0 ? response.id : null;
  const email =
    typeof response.email === "string" && response.email.includes("@") ? response.email : null;
  if (!id || !email) return null;
  const name = typeof response.name === "string" ? response.name : undefined;
  return { id, email, name };
}

/**
 * Naver vouches only for addresses on its own domain. The profile's email is
 * a user-editable contact field that can point at ANY address — treating it
 * as verified would let an attacker attach their Naver login to a victim's
 * existing Klorn account (see resolveSocialLoginAction). Pure for tests.
 */
export function isNaverVerifiedEmail(email: string): boolean {
  return /@naver\.com$/i.test(email.trim());
}
