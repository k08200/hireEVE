import type { RunOutput } from "../core/runner.js";

/** Result of LLM-based evaluation */
export interface LlmEvalResult {
  score: number;
  reasoning: string;
  passed: boolean;
}

/** Default timeout for LLM requests (60 seconds) */
const LLM_TIMEOUT_MS = 60_000;

/**
 * Evaluate agent output using an LLM judge.
 *
 * Uses Ollama as the LLM backend.
 * The rubric defines what the LLM should evaluate against.
 */
export async function evaluateWithLlm(
  rubric: string,
  output: RunOutput,
  ollamaHost = "http://localhost:11434",
  model = "qwen2.5:14b",
  passThreshold = 60,
): Promise<LlmEvalResult> {
  const prompt = buildEvalPrompt(rubric, output);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(`${ollamaHost}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      if (response.status === 404) {
        return {
          score: 0,
          reasoning: `Model "${model}" not found on Ollama at ${ollamaHost}. Run: ollama pull ${model}`,
          passed: false,
        };
      }
      return {
        score: 0,
        reasoning: `Ollama error ${response.status}: ${body.slice(0, 200) || response.statusText}`,
        passed: false,
      };
    }

    const data = (await response.json()) as Record<string, unknown>;
    if (!data.response || typeof data.response !== "string") {
      return { score: 0, reasoning: "Ollama returned empty or invalid response", passed: false };
    }

    return parseLlmResponse(data.response, passThreshold);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return {
        score: 0,
        reasoning: `LLM evaluation timed out after ${LLM_TIMEOUT_MS / 1000}s — is Ollama running at ${ollamaHost}?`,
        passed: false,
      };
    }
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
      return {
        score: 0,
        reasoning: `Cannot connect to Ollama at ${ollamaHost} — is it running? Start with: ollama serve`,
        passed: false,
      };
    }
    return { score: 0, reasoning: `LLM evaluation failed: ${msg}`, passed: false };
  }
}

function buildEvalPrompt(rubric: string, output: RunOutput): string {
  return `You are an AI agent evaluator. Score the agent's output based on the rubric below.

## Rubric
${rubric}

## Agent Output
### stdout
${output.stdout.slice(-3000)}

### stderr
${output.stderr.slice(-1000)}

### Exit Code
${output.exitCode}

### Duration
${output.durationMs}ms

## Instructions
Evaluate the agent's performance. Respond in this exact JSON format:
{"score": <0-100>, "reasoning": "<brief explanation>"}

Only output the JSON, nothing else.`;
}

function parseLlmResponse(text: string, passThreshold: number): LlmEvalResult {
  try {
    // Extract JSON from response (LLM might add extra text)
    const jsonMatch = text.match(/\{[\s\S]*"score"[\s\S]*"reasoning"[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        score: 0,
        reasoning: `Could not parse LLM response (no JSON found): ${text.slice(0, 200)}`,
        passed: false,
      };
    }

    const parsed = JSON.parse(jsonMatch[0]) as { score: unknown; reasoning: unknown };

    // Validate score
    const score = Number(parsed.score);
    if (Number.isNaN(score)) {
      return {
        score: 0,
        reasoning: `LLM returned invalid score: ${String(parsed.score)}`,
        passed: false,
      };
    }
    const clampedScore = Math.round(Math.max(0, Math.min(100, score)));

    // Validate reasoning
    const reasoning =
      typeof parsed.reasoning === "string"
        ? parsed.reasoning
        : String(parsed.reasoning ?? "No reasoning provided");

    return {
      score: clampedScore,
      reasoning,
      passed: clampedScore >= passThreshold,
    };
  } catch {
    return {
      score: 0,
      reasoning: `JSON parse failed from LLM response: ${text.slice(0, 200)}`,
      passed: false,
    };
  }
}
