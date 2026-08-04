/**
 * OpenRouter key-headroom tripwire.
 *
 * The catalog check next door watches the MODELS we depend on. This watches the
 * KEY we depend on — the failure mode that took the judge down on 2026-07-26
 * and stayed undetected until 08-02.
 *
 * What happened: the shared key carried a spend cap set on the key itself. The
 * account still held credit, so no billing alert fired, but every call came
 * back `403 Key limit exceeded (total limit)`. With a single provider (the
 * Gemini secondary is retired) that is a fleet-wide outage: judgeEmail drops to
 * the keyword fallback, which caps confidence at 0.55 and therefore cannot
 * reach the PUSH floor of 0.7 — no urgent mail is interrupted for anyone.
 *
 * Detection only, once a day, one request. It reports the number the incident
 * turned on — the key's remaining allowance — while there is still headroom to
 * act on. An uncapped key is the intended hosted setup and never alarms.
 */

import { captureError } from "../sentry.js";

const KEY_STATUS_URL = "https://openrouter.ai/api/v1/key";
const FETCH_TIMEOUT_MS = 15_000;

/**
 * Warn once the key is below this share of its own cap. 15% of a monthly cap is
 * roughly four days of dogfood judging — enough lead time to raise the cap
 * before the first 403, which is the entire point of the tripwire.
 */
export const KEY_HEADROOM_LOW_FRACTION = 0.15;

export interface KeyHeadroom {
  /** Credits spent against this key. */
  usage: number;
  /** The cap configured ON THE KEY, or null when the key is uncapped. */
  limit: number | null;
  /** Allowance left before the cap, or null when uncapped. */
  remaining: number | null;
}

export type KeyHeadroomStatus = "unlimited" | "healthy" | "low" | "exhausted" | "unknown";

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Parse OpenRouter's `/api/v1/key` envelope. Returns null when the payload is
 * not the shape we expect — an upstream change must degrade to "unknown", never
 * to a false alarm on the only provider we have.
 */
export function parseKeyHeadroom(body: unknown): KeyHeadroom | null {
  if (typeof body !== "object" || body === null) return null;
  const data = (body as { data?: unknown }).data;
  if (typeof data !== "object" || data === null) return null;

  const record = data as Record<string, unknown>;
  const usage = finiteOrNull(record.usage);
  if (usage === null) return null;

  const limit = finiteOrNull(record.limit);
  if (limit === null) return { usage, limit: null, remaining: null };

  // `limit_remaining` is authoritative when present; derive it otherwise so a
  // slimmer payload still yields a usable signal.
  const remaining = finiteOrNull(record.limit_remaining) ?? limit - usage;
  return { usage, limit, remaining };
}

export function classifyKeyHeadroom(headroom: KeyHeadroom): KeyHeadroomStatus {
  const { limit, remaining } = headroom;
  if (limit === null || remaining === null) return "unlimited";
  if (remaining <= 0) return "exhausted";
  return remaining < limit * KEY_HEADROOM_LOW_FRACTION ? "low" : "healthy";
}

/**
 * Fetch the env key's headroom and alarm on it. Returns the status so a caller
 * (or a test) can assert on it; failures are swallowed into "unknown" — this is
 * an observability probe and must never break the scheduler tick.
 */
export async function runOpenRouterKeyCheck(): Promise<KeyHeadroomStatus> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return "unknown";

  let headroom: KeyHeadroom | null = null;
  try {
    const res = await fetch(KEY_STATUS_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      // A 401 here means the key itself is gone — worth saying out loud, since
      // the same condition surfaced as "401 User not found" mid-judge in July.
      console.warn(`[KEY-HEALTH] OpenRouter /key returned ${res.status}; headroom unknown`);
      return "unknown";
    }
    headroom = parseKeyHeadroom(await res.json());
  } catch (err) {
    console.warn("[KEY-HEALTH] OpenRouter key check failed:", err);
    return "unknown";
  }

  if (!headroom) {
    console.warn("[KEY-HEALTH] OpenRouter /key payload unparseable; headroom unknown");
    return "unknown";
  }

  const status = classifyKeyHeadroom(headroom);
  const spend = `usage $${headroom.usage.toFixed(2)} of cap $${headroom.limit?.toFixed(2) ?? "∞"}`;

  if (status === "exhausted") {
    const message = `OpenRouter key spend cap is exhausted (${spend}) — every LLM call now returns "403 Key limit exceeded (total limit)". With no secondary provider the judge is on the keyword fallback, which cannot emit PUSH. Raise or clear the cap on the key.`;
    console.error(`[KEY-HEALTH] ${message}`);
    captureError(new Error(message), { tags: { scope: "llm.key_cap_exhausted" } });
    return status;
  }

  if (status === "low") {
    const message = `OpenRouter key headroom low: $${(headroom.remaining ?? 0).toFixed(2)} left (${spend}). At zero every call 403s and the judge falls back to keywords.`;
    console.warn(`[KEY-HEALTH] ${message}`);
    captureError(new Error(message), { tags: { scope: "llm.key_cap_low" } });
    return status;
  }

  console.log(`[KEY-HEALTH] OpenRouter key ${status} (${spend})`);
  return status;
}
