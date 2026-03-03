import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { RunOutput } from "../core/runner.js";
import type { EvalResult } from "../evaluate/index.js";
import type { Scenario } from "../scenario/types.js";

/** Full probe result for a single scenario */
export interface ProbeResult {
	scenario: Scenario;
	output: RunOutput;
	evaluation: EvalResult;
	timestamp: string;
}

/** Save results as JSON */
export function saveJsonReport(results: ProbeResult[], outputDir: string): string {
	mkdirSync(outputDir, { recursive: true });
	const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
	const filePath = resolve(outputDir, `probe-${timestamp}.json`);

	writeFileSync(
		filePath,
		JSON.stringify(
			{
				timestamp: new Date().toISOString(),
				totalScenarios: results.length,
				passed: results.filter((r) => r.evaluation.passed).length,
				failed: results.filter((r) => !r.evaluation.passed).length,
				results: results.map((r) => ({
					id: r.scenario.id,
					name: r.scenario.name,
					score: r.evaluation.score,
					passed: r.evaluation.passed,
					method: r.evaluation.method,
					durationMs: r.output.durationMs,
					llmReasoning: r.evaluation.llmReasoning,
					ruleDetails: r.evaluation.ruleDetails,
				})),
			},
			null,
			2,
		),
	);

	return filePath;
}

/** Generate a markdown report */
export function saveMarkdownReport(results: ProbeResult[], outputDir: string): string {
	mkdirSync(outputDir, { recursive: true });
	const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
	const filePath = resolve(outputDir, `probe-${timestamp}.md`);

	const passed = results.filter((r) => r.evaluation.passed).length;
	const failed = results.length - passed;
	const avgScore = results.length > 0 ? Math.round(results.reduce((s, r) => s + r.evaluation.score, 0) / results.length) : 0;

	let md = `# ProbeAI Report\n\n`;
	md += `**Date**: ${new Date().toISOString()}\n`;
	md += `**Scenarios**: ${results.length} total, ${passed} passed, ${failed} failed\n`;
	md += `**Average Score**: ${avgScore}/100\n\n`;
	md += `---\n\n`;

	for (const r of results) {
		const icon = r.evaluation.passed ? "PASS" : "FAIL";
		md += `## [${icon}] ${r.scenario.name}\n\n`;
		md += `- **ID**: ${r.scenario.id}\n`;
		md += `- **Score**: ${r.evaluation.score}/100\n`;
		md += `- **Method**: ${r.evaluation.method}\n`;
		md += `- **Duration**: ${(r.output.durationMs / 1000).toFixed(1)}s\n`;

		if (r.evaluation.llmReasoning) {
			md += `\n### LLM Reasoning\n${r.evaluation.llmReasoning}\n`;
		}

		if (r.evaluation.ruleDetails && r.evaluation.ruleDetails.length > 0) {
			md += `\n### Rule Results\n`;
			for (const rule of r.evaluation.ruleDetails) {
				const rIcon = rule.passed ? "[x]" : "[ ]";
				md += `- ${rIcon} **${rule.rule}**: ${rule.detail}\n`;
			}
		}

		md += `\n---\n\n`;
	}

	writeFileSync(filePath, md);
	return filePath;
}
