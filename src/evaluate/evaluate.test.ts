import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluate } from "./index.js";
import type { RunOutput } from "../core/runner.js";
import type { EvaluationConfig } from "../scenario/types.js";

const baseOutput: RunOutput = {
	stdout: "hello world",
	stderr: "",
	exitCode: 0,
	durationMs: 100,
	stepResults: [],
};

describe("evaluate", () => {
	it("throws on invalid method", async () => {
		const config = { method: "magic" as EvaluationConfig["method"] };
		await assert.rejects(() => evaluate(config, baseOutput), /Unknown evaluation method/);
	});

	it("throws on threshold out of range", async () => {
		const config: EvaluationConfig = { method: "rules", passThreshold: 150 };
		await assert.rejects(() => evaluate(config, baseOutput), /Invalid passThreshold/);
	});

	it("throws on negative threshold", async () => {
		const config: EvaluationConfig = { method: "rules", passThreshold: -10 };
		await assert.rejects(() => evaluate(config, baseOutput), /Invalid passThreshold/);
	});

	it("rules method with empty rules returns score 0", async () => {
		const config: EvaluationConfig = { method: "rules", rules: [] };
		const result = await evaluate(config, baseOutput);
		assert.equal(result.score, 0);
		assert.equal(result.passed, false);
		assert.equal(result.method, "rules");
	});

	it("rules method scores correctly", async () => {
		const config: EvaluationConfig = {
			method: "rules",
			passThreshold: 100,
			rules: [
				{ type: "exit_code", target: "exit", value: "0", weight: 1 },
				{ type: "contains", target: "stdout", value: "hello", weight: 1 },
			],
		};
		const result = await evaluate(config, baseOutput);
		assert.equal(result.score, 100);
		assert.equal(result.passed, true);
		assert.equal(result.ruleDetails?.length, 2);
	});

	it("rules method respects threshold", async () => {
		const config: EvaluationConfig = {
			method: "rules",
			passThreshold: 80,
			rules: [
				{ type: "exit_code", target: "exit", value: "0", weight: 1 },
				{ type: "contains", target: "stdout", value: "missing", weight: 1 },
			],
		};
		const result = await evaluate(config, baseOutput);
		assert.equal(result.score, 50);
		assert.equal(result.passed, false);
	});

	it("defaults threshold to 60", async () => {
		const config: EvaluationConfig = {
			method: "rules",
			rules: [{ type: "exit_code", target: "exit", value: "0", weight: 1 }],
		};
		const result = await evaluate(config, baseOutput);
		assert.equal(result.score, 100);
		assert.equal(result.passed, true);
	});
});
