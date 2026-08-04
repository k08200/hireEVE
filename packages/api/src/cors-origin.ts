/**
 * CORS origin decision, extracted from index.ts so it is unit-testable.
 *
 * The one rule that matters: a denied Origin is a QUIET denial — `cb(null,
 * false)` — never `cb(new Error(...))`. @fastify/cors surfaces a callback
 * error as an HTTP 500, so erroring here turns every request carrying an
 * unrecognized Origin header into a server error. Observed live 2026-08-04
 * (GET and OPTIONS with `Origin: https://evil.example` → 500), and a DAST
 * scanner stamps hostile Origins on every request — the scan report fills
 * with 500s. With `false`, @fastify/cors simply omits the CORS headers: the
 * browser blocks the read, non-browser clients proceed to auth as normal.
 */
export type CorsOriginCallback = (
  origin: string | undefined,
  cb: (err: Error | null, allow: boolean) => void,
) => void;

export function makeCorsOriginCallback(
  allowedOrigins: readonly string[],
  isAllowedDevOrigin: (origin: string) => boolean,
): CorsOriginCallback {
  return (origin, cb) => {
    // No Origin header: curl, mobile shells, server-to-server. Allow — CORS
    // only governs browser reads, and these callers still hit auth.
    if (!origin || allowedOrigins.includes(origin) || isAllowedDevOrigin(origin)) {
      cb(null, true);
      return;
    }
    cb(null, false);
  };
}
