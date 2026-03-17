/**
 * Test Engine Worker
 * Runs test scenarios against an agent endpoint in the background.
 * No queue system needed — just async execution.
 */

import { prisma } from "../db.js";
import type { ConversationTurn } from "./runner.js";
import { callAgent, extractReply } from "./runner.js";
import type { TestScenario } from "./scenarios.js";
import { DEFAULT_SCENARIOS } from "./scenarios.js";

/**
 * Execute a test run: call agent with each scenario, evaluate, store results.
 * This runs in the background — fire and forget from the route handler.
 */
export async function executeTestRun(testRunId: string): Promise<void> {
  try {
    // 1. Load test run + agent info
    const testRun = await prisma.testRun.findUnique({
      where: { id: testRunId },
      include: { agent: true },
    });

    if (!testRun) {
      console.error(`[worker] TestRun ${testRunId} not found`);
      return;
    }

    // 2. Mark as RUNNING
    await prisma.testRun.update({
      where: { id: testRunId },
      data: { status: "RUNNING", startedAt: new Date() },
    });

    const { endpoint, apiKey } = testRun.agent;

    // 3. Pick scenarios (up to scenarioCount)
    const scenarios = DEFAULT_SCENARIOS.slice(0, testRun.scenarioCount);

    let passCount = 0;
    let failCount = 0;
    let warnCount = 0;

    // 4. Run each scenario
    for (const scenario of scenarios) {
      const result = await runSingleScenario(scenario, endpoint, apiKey ?? undefined);

      // 5. Store evaluation
      await prisma.evaluation.create({
        data: {
          testRunId,
          scenario: scenario.name,
          category: scenario.category,
          verdict: result.verdict,
          reason: result.reason,
          confidence: result.confidence,
          latencyMs: result.latencyMs,
        },
      });

      if (result.verdict === "PASS") passCount++;
      else if (result.verdict === "FAIL") failCount++;
      else warnCount++;
    }

    // 6. Calculate score (0-100)
    const total = scenarios.length;
    const score = total > 0 ? Math.round(((passCount + warnCount * 0.5) / total) * 100) : 0;

    // 7. Mark as COMPLETED
    await prisma.testRun.update({
      where: { id: testRunId },
      data: {
        status: "COMPLETED",
        score,
        passCount,
        failCount,
        warnCount,
        completedAt: new Date(),
      },
    });

    console.log(
      `[worker] TestRun ${testRunId} completed: score=${score} (${passCount}P/${failCount}F/${warnCount}W)`,
    );
  } catch (err) {
    console.error(`[worker] TestRun ${testRunId} failed:`, err);

    await prisma.testRun
      .update({
        where: { id: testRunId },
        data: { status: "FAILED", completedAt: new Date() },
      })
      .catch(() => {});
  }
}

async function runSingleScenario(
  scenario: TestScenario,
  endpoint: string,
  apiKey?: string,
): Promise<{
  verdict: "PASS" | "FAIL" | "WARNING";
  reason: string;
  confidence: number;
  latencyMs: number;
}> {
  const history: ConversationTurn[] = [];
  const responses: string[] = [];
  let totalLatency = 0;

  try {
    for (const message of scenario.messages) {
      const result = await callAgent(endpoint, message, history, apiKey);
      totalLatency += result.latencyMs;

      if (result.error) {
        return {
          verdict: "FAIL",
          reason: `Agent error: ${result.error}`,
          confidence: 0.95,
          latencyMs: totalLatency,
        };
      }

      if (result.status >= 400) {
        return {
          verdict: "FAIL",
          reason: `Agent returned HTTP ${result.status}`,
          confidence: 0.95,
          latencyMs: totalLatency,
        };
      }

      const reply = extractReply(result.body);
      responses.push(reply);
      history.push({ role: "user", content: message });
      history.push({ role: "assistant", content: reply });
    }

    const evalResult = scenario.evaluate(responses);
    return { ...evalResult, latencyMs: totalLatency };
  } catch (err) {
    return {
      verdict: "FAIL",
      reason: `Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
      confidence: 0.9,
      latencyMs: totalLatency,
    };
  }
}
