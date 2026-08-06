import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from "jose";

/**
 * Sign in with Apple. Dark until APPLE_LOGIN_ENABLED flips (config.ts); the
 * env below is only read at request time, so a deploy without it is inert.
 *
 * Required env once enabled:
 *   APPLE_CLIENT_ID    — the Services ID (e.g. ai.klorn.web)
 *   APPLE_TEAM_ID      — the developer team id
 *   APPLE_KEY_ID       — the Sign in with Apple key id
 *   APPLE_PRIVATE_KEY  — the .p8 key PEM ("\n" escapes accepted)
 *   APPLE_REDIRECT_URI — https://<api>/api/auth/apple/callback
 */
const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_AUTH_URL = "https://appleid.apple.com/auth/authorize";
const APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token";
const APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys";

export interface AppleClaims {
  sub: string;
  email: string;
  emailVerified: boolean;
}

function appleClientId(): string {
  return process.env.APPLE_CLIENT_ID ?? "";
}

function appleRedirectUri(): string {
  return process.env.APPLE_REDIRECT_URI ?? "";
}

export function buildAppleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    // form_post is REQUIRED by Apple whenever a scope is requested — the
    // callback therefore arrives as a POST with a urlencoded body, not a GET.
    response_mode: "form_post",
    client_id: appleClientId(),
    redirect_uri: appleRedirectUri(),
    scope: "email",
    state,
  });
  return `${APPLE_AUTH_URL}?${params}`;
}

/**
 * Apple has no static client secret — it is a short-lived ES256 JWT signed
 * with the developer's .p8 key (Apple docs: "Creating a client secret").
 */
export async function makeAppleClientSecret(now = Date.now()): Promise<string> {
  const pem = (process.env.APPLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
  const key = await importPKCS8(pem, "ES256");
  const iat = Math.floor(now / 1000);
  return await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: process.env.APPLE_KEY_ID ?? "" })
    .setIssuer(process.env.APPLE_TEAM_ID ?? "")
    .setIssuedAt(iat)
    .setExpirationTime(iat + 300)
    .setAudience(APPLE_ISSUER)
    .setSubject(appleClientId())
    .sign(key);
}

/** Exchange the authorization code for tokens; the identity is the id_token. */
export async function exchangeAppleCode(code: string): Promise<string | null> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: appleClientId(),
    client_secret: await makeAppleClientSecret(),
    redirect_uri: appleRedirectUri(),
  });
  const res = await fetch(APPLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    console.warn(`[APPLE] token exchange failed: ${res.status}`);
    return null;
  }
  const json = (await res.json()) as { id_token?: string };
  return typeof json.id_token === "string" ? json.id_token : null;
}

// Module-level so the JWKS response is cached across logins (jose refreshes on
// unknown kid), instead of refetched per callback.
const appleJwks = createRemoteJWKSet(new URL(APPLE_JWKS_URL));

/** Verify the id_token's signature + iss/aud, then extract the claims. */
export async function verifyAppleIdToken(idToken: string): Promise<AppleClaims | null> {
  try {
    const { payload } = await jwtVerify(idToken, appleJwks, {
      issuer: APPLE_ISSUER,
      audience: appleClientId(),
    });
    return parseAppleClaims(payload as Record<string, unknown>);
  } catch (err) {
    console.warn("[APPLE] id_token verification failed:", err);
    return null;
  }
}

/**
 * Pure claim extraction (exported for tests). `sub` + `email` are required;
 * Apple serializes email_verified as a boolean OR the string "true" depending
 * on the flow, so both spellings count.
 */
export function parseAppleClaims(payload: Record<string, unknown>): AppleClaims | null {
  const sub = typeof payload.sub === "string" && payload.sub.length > 0 ? payload.sub : null;
  const email =
    typeof payload.email === "string" && payload.email.includes("@") ? payload.email : null;
  if (!sub || !email) return null;
  const verified = payload.email_verified;
  return { sub, email, emailVerified: verified === true || verified === "true" };
}
