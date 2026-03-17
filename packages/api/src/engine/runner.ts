/**
 * HTTP Agent Runner
 * Sends test messages to an agent's HTTP endpoint and captures responses.
 */

export interface AgentResponse {
  status: number;
  body: unknown;
  latencyMs: number;
  error?: string;
}

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * Call an agent's HTTP endpoint with a message.
 * Supports common chat API formats (OpenAI-compatible, simple JSON).
 */
export async function callAgent(
  endpoint: string,
  message: string,
  history: ConversationTurn[] = [],
  apiKey?: string,
  timeoutMs = 30_000,
): Promise<AgentResponse> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const body = JSON.stringify({
    messages: [
      ...history.map((t) => ({ role: t.role, content: t.content })),
      { role: "user", content: message },
    ],
  });

  const start = Date.now();

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });
    clearTimeout(timer);

    const latencyMs = Date.now() - start;
    const responseBody = await res.text();

    let parsed: unknown;
    try {
      parsed = JSON.parse(responseBody);
    } catch {
      parsed = responseBody;
    }

    return { status: res.status, body: parsed, latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const message_ = err instanceof Error ? err.message : String(err);
    return {
      status: 0,
      body: null,
      latencyMs,
      error: message_.includes("abort") ? `Timeout after ${timeoutMs}ms` : message_,
    };
  }
}

/**
 * Extract the assistant's text reply from various response formats.
 */
export function extractReply(body: unknown): string {
  if (typeof body === "string") return body;
  if (!body || typeof body !== "object") return JSON.stringify(body);

  const obj = body as Record<string, unknown>;

  // OpenAI-compatible: { choices: [{ message: { content: "..." } }] }
  if (Array.isArray(obj.choices)) {
    const first = obj.choices[0] as Record<string, unknown> | undefined;
    if (first?.message && typeof first.message === "object") {
      const msg = first.message as Record<string, unknown>;
      if (typeof msg.content === "string") return msg.content;
    }
  }

  // Simple: { response: "..." } or { message: "..." } or { content: "..." }
  for (const key of ["response", "message", "content", "reply", "text", "answer"]) {
    if (typeof obj[key] === "string") return obj[key] as string;
  }

  return JSON.stringify(body);
}
