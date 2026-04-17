/**
 * Validate a Web Push endpoint URL against SSRF-style targets before calling
 * `webPush.sendNotification`. Rejects non-HTTPS, loopback, internal DNS names,
 * and RFC1918/link-local IPv4 ranges. Subscription endpoints come from the
 * browser via the user, so we re-validate every time we read from the DB.
 */

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const INTERNAL_SUFFIXES = [".internal", ".local"];

const IPV4_PATTERN = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/;

function isPrivateIPv4(host: string): boolean {
  const match = host.match(IPV4_PATTERN);
  if (!match) return false;
  const [a, b] = match.slice(1, 3).map(Number);
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a === 169 && b === 254) return true; // link-local
  return false;
}

function normalizeHost(hostname: string): string {
  // URL.hostname wraps IPv6 in brackets; strip them for comparison.
  const lower = hostname.toLowerCase();
  return lower.startsWith("[") && lower.endsWith("]") ? lower.slice(1, -1) : lower;
}

export function isSafePushEndpoint(endpoint: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;

  const host = normalizeHost(parsed.hostname);
  if (LOOPBACK_HOSTS.has(host)) return false;
  if (INTERNAL_SUFFIXES.some((s) => host.endsWith(s))) return false;
  if (isPrivateIPv4(host)) return false;

  return true;
}
