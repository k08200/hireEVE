import type { RunOutput } from "../core/runner.js";
import type { EvaluationConfig } from "../scenario/types.js";
import { evaluateWithLlm } from "./llm.js";
import { calculateRuleScore, evaluateRules } from "./rules.js";

/** Combined evaluation result */
export interface EvalResult {
	score: number;
	passed: boolean;
	method: "llm" | "rules" | "hybrid";
	ruleScore?: number;
	llmScore?: number;
	llmReasoning?: string;
	ruleDetails?: Array<{ rule: string; passed: boolean; detail: string }>;
}

/** Run the evaluation pipeline based on config */
export async function evaluate(config: EvaluationConfig, output: RunOutput): Promise<EvalResult> {
	const threshold = config.passThreshold ?? 60;

	if (threshold < 0 || threshold > 100) {
		throw new Error(`Invalid passThreshold: ${threshold} (must be 0-100)`);
	}

	const validMethods = ["rules", "llm", "hybrid"];
	if (!validMethods.includes(config.method)) {
		throw new Error(`Unknown evaluation method: "${config.method}" (valid: ${validMethods.join(", ")})`);
	}

	if (config.method === "rules") {
		const rules = config.rules ?? [];
		if (rules.length === 0) {
			return { score: 0, passed: false, method: "rules", ruleScore: 0, ruleDetails: [] };
		}
		const results = evaluateRules(rules, output);
		const score = calculateRuleScore(results);
		return {
			score,
			passed: score >= threshold,
			method: "rules",
			ruleScore: score,
			ruleDetails: results.map((r) => ({
				rule: `${r.rule.type}:${r.rule.target}`,
				passed: r.passed,
				detail: r.detail,
			})),
		};
	}

	if (config.method === "llm") {
		const rubric = config.rubric ?? "Evaluate the agent's output quality and correctness.";
		const llmResult = await evaluateWithLlm(rubric, output, config.ollamaHost, config.model, threshold);
		return {
			score: llmResult.score,
			passed: llmResult.score >= threshold,
			method: "llm",
			llmScore: llmResult.score,
			llmReasoning: llmResult.reasoning,
		};
	}

	// Hybrid: both rules and LLM, average the scores
	const rules = config.rules ?? [];
	const rubric = config.rubric ?? "Evaluate the agent's output quality and correctness.";

	const ruleResults = evaluateRules(rules, output);
	const ruleScore = calculateRuleScore(ruleResults);
	const llmResult = await evaluateWithLlm(rubric, output, config.ollamaHost, config.model, threshold);

	const score = Math.round((ruleScore + llmResult.score) / 2);

	return {
		score,
		passed: score >= threshold,
		method: "hybrid",
		ruleScore,
		llmScore: llmResult.score,
		llmReasoning: llmResult.reasoning,
		ruleDetails: ruleResults.map((r) => ({
			rule: `${r.rule.type}:${r.rule.target}`,
			passed: r.passed,
			detail: r.detail,
		})),
	};
}
