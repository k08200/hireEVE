import { existsSync, readFileSync } from "node:fs";
import type { RunOutput } from "../core/runner.js";
import type { RuleCheck } from "../scenario/types.js";

/** Result of evaluating a single rule */
export interface RuleResult {
	rule: RuleCheck;
	passed: boolean;
	detail: string;
}

/** Evaluate all rules against a run output */
export function evaluateRules(rules: RuleCheck[], output: RunOutput): RuleResult[] {
	if (!rules || rules.length === 0) {
		return [];
	}
	return rules.map((rule) => evaluateRule(rule, output));
}

/** Calculate a score (0-100) from rule results */
export function calculateRuleScore(results: RuleResult[]): number {
	if (results.length === 0) return 0;

	let totalWeight = 0;
	let earnedWeight = 0;

	for (const r of results) {
		const weight = r.rule.weight ?? 1;
		if (weight < 0) continue; // skip invalid weights
		totalWeight += weight;
		if (r.passed) earnedWeight += weight;
	}

	return totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0;
}

function evaluateRule(rule: RuleCheck, output: RunOutput): RuleResult {
	const targetResult = resolveTarget(rule.target, output);

	if (targetResult.error) {
		return { rule, passed: false, detail: targetResult.error };
	}

	const target = targetResult.value;

	switch (rule.type) {
		case "contains":
			return {
				rule,
				passed: target.includes(rule.value),
				detail: target.includes(rule.value) ? `Found "${rule.value}"` : `"${rule.value}" not found in ${rule.target}`,
			};

		case "regex": {
			let re: RegExp;
			try {
				re = new RegExp(rule.value, "i");
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return { rule, passed: false, detail: `Invalid regex "/${rule.value}/": ${msg}` };
			}
			const match = re.test(target);
			return {
				rule,
				passed: match,
				detail: match ? `Regex /${rule.value}/ matched` : `Regex /${rule.value}/ did not match`,
			};
		}

		case "file_exists": {
			const exists = existsSync(rule.value);
			return {
				rule,
				passed: exists,
				detail: exists ? `File ${rule.value} exists` : `File ${rule.value} not found`,
			};
		}

		case "exit_code": {
			const expected = Number.parseInt(rule.value, 10);
			if (Number.isNaN(expected)) {
				return { rule, passed: false, detail: `Invalid exit_code value "${rule.value}" — must be an integer` };
			}
			const actual = output.exitCode;
			return {
				rule,
				passed: actual === expected,
				detail: actual === expected ? `Exit code ${actual} matches` : `Expected exit ${expected}, got ${actual}`,
			};
		}

		case "json_match": {
			try {
				const parsed = JSON.parse(target) as Record<string, unknown>;
				const expected = JSON.parse(rule.value) as Record<string, unknown>;
				const match = shallowMatch(parsed, expected);
				return {
					rule,
					passed: match,
					detail: match ? "JSON structure matches" : "JSON structure mismatch",
				};
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return { rule, passed: false, detail: `JSON parse failed: ${msg}` };
			}
		}

		default:
			return { rule, passed: false, detail: `Unknown rule type: "${rule.type}"` };
	}
}

function resolveTarget(target: string, output: RunOutput): { value: string; error?: string } {
	if (target === "stdout") return { value: output.stdout };
	if (target === "stderr") return { value: output.stderr };
	if (target === "exit") return { value: String(output.exitCode) };
	if (target.startsWith("file:")) {
		const path = target.slice(5);
		if (!path) {
			return { value: "", error: `Invalid file target: "${target}" — path is empty` };
		}
		try {
			return { value: readFileSync(path, "utf-8") };
		} catch (err) {
			const code = (err as NodeJS.ErrnoException).code;
			if (code === "ENOENT") {
				return { value: "", error: `Target file not found: ${path}` };
			}
			return { value: "", error: `Cannot read target file "${path}": ${code ?? "unknown error"}` };
		}
	}
	return { value: "", error: `Unknown target "${target}" — valid targets: stdout, stderr, exit, file:<path>` };
}

function shallowMatch(actual: Record<string, unknown>, expected: Record<string, unknown>): boolean {
	for (const key of Object.keys(expected)) {
		if (actual[key] !== expected[key]) return false;
	}
	return true;
}
