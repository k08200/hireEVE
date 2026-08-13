import { API_BASE, getStoredAuthToken } from "./api";

/**
 * localStorage keys that hold SECRETS (beyond the session token, which
 * clearStoredAuthToken owns). Must match the playground's keyStorageFor()
 * scheme in app/playground/page.tsx — the visitor's own LLM provider keys
 * live only in this browser, so logout on a shared machine must wipe them.
 * (CASA 6.6.1: browser storage securely cleared during logout, 2026-08-13.)
 */
const SENSITIVE_STORAGE_KEYS = [
  "klorn-playground-key",
  "klorn-playground-key-openrouter",
  "klorn-playground-key-gemini",
  "klorn-playground-key-openai",
] as const;

export function clearSensitiveStorage(): void {
  if (typeof window === "undefined") return;
  for (const key of SENSITIVE_STORAGE_KEYS) {
    localStorage.removeItem(key);
  }
}

/**
 * Tell the API to drop this token's device session so the JWT is rejected
 * server-side from now on — clearing localStorage alone leaves the token
 * valid until natural expiry (CASA 2.2.1). Fire-and-forget by design:
 * logout must complete instantly even when the API is unreachable, and the
 * 7-day TTL plus the device-session check bound the damage of a lost call.
 */
export function revokeServerSession(): void {
  const token = getStoredAuthToken();
  if (!token) return;
  void fetch(`${API_BASE}/api/auth/logout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    keepalive: true,
  }).catch(() => {
    // Best effort — see above.
  });
}
