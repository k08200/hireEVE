import crypto from "node:crypto";

/**
 * In-memory store for OAuth exchange codes (?code in the redirect instead of
 * ?token; expires after 60 s, deleted on first use — prevents JWT leakage via
 * browser history). Module-level rather than an authRoutes closure so every
 * social login callback — Google in routes/auth.ts, Apple/Naver in
 * routes/social-auth.ts — mints codes the single POST /api/auth/exchange-code
 * endpoint can redeem.
 */
export const exchangeCodes = new Map<string, { jwt: string; expiresAt: number }>();

const EXCHANGE_CODE_TTL_MS = 60_000;

/** Mint a one-time exchange code for `jwt` and schedule its expiry sweep. */
export function mintExchangeCode(jwt: string): string {
  const code = crypto.randomBytes(20).toString("hex");
  exchangeCodes.set(code, { jwt, expiresAt: Date.now() + EXCHANGE_CODE_TTL_MS });
  const timer = setTimeout(() => exchangeCodes.delete(code), EXCHANGE_CODE_TTL_MS);
  timer.unref?.();
  return code;
}
