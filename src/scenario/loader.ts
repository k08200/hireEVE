import { existsSync, readFileSync } from "node:fs";
import yaml from "js-yaml";
import type { Scenario } from "./types.js";

/** Load a scenario from a YAML file */
export function loadScenario(filePath: string): Scenario {
	// File read with clear error messages
	if (!existsSync(filePath)) {
		throw new Error(`File not found: ${filePath}`);
	}

	let raw: string;
	try {
		raw = readFileSync(filePath, "utf-8");
	} catch (err) {
		const code = (err as NodeJS.ErrnoException).code;
		if (code === "EACCES") {
			throw new Error(`Permission denied: ${filePath}`);
		}
		throw new Error(`Cannot read file: ${filePath} (${code ?? "unknown error"})`);
	}

	if (!raw.trim()) {
		throw new Error(`File is empty: ${filePath}`);
	}

	// YAML parse with clear error messages
	let data: unknown;
	try {
		data = yaml.load(raw);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		throw new Error(`Invalid YAML in ${filePath}: ${msg}`);
	}

	if (!data || typeof data !== "object") {
		throw new Error(`Invalid scenario format in ${filePath}: expected a YAML object, got ${typeof data}`);
	}

	// Validate all fields and collect errors
	const errors = validateScenario(data as Record<string, unknown>);
	if (errors.length > 0) {
		throw new Error(`Invalid scenario in ${filePath}:\n  - ${errors.join("\n  - ")}`);
	}

	return data as Scenario;
}

/** Validate scenario structure, returning all errors at once */
function validateScenario(data: Record<string, unknown>): string[] {
	const errors: string[] = [];

	// Required top-level fields
	if (!data.id || typeof data.id !== "string") {
		errors.push("missing or invalid 'id' (must be a string)");
	}
	if (!data.name || typeof data.name !== "string") {
		errors.push("missing or invalid 'name' (must be a string)");
	}

	// Agent validation
	if (!data.agent || typeof data.agent !== "object") {
		errors.push("missing 'agent' section");
	} else {
		const agent = data.agent as Record<string, unknown>;
		if (!agent.type || typeof agent.type !== "string") {
			errors.push("agent.type is required (e.g., 'command')");
		} else if (agent.type !== "command" && agent.type !== "http") {
			errors.push(`agent.type must be 'command' or 'http', got '${agent.type}'`);
		} else if (agent.type === "command" && (!agent.command || typeof agent.command !== "string")) {
			errors.push("agent.command is required when agent.type is 'command'");
		} else if (agent.type === "http" && (!agent.url || typeof agent.url !== "string")) {
			errors.push("agent.url is required when agent.type is 'http'");
		}
	}

	// Steps validation
	if (!data.steps || !Array.isArray(data.steps)) {
		errors.push("missing 'steps' (must be an array)");
	} else if (data.steps.length === 0) {
		errors.push("'steps' must have at least one step");
	} else {
		const validActions = ["send", "wait", "check_file", "check_output"];
		for (let i = 0; i < data.steps.length; i++) {
			const step = data.steps[i] as Record<string, unknown>;
			if (!step.action || typeof step.action !== "string") {
				errors.push(`steps[${i}]: missing 'action'`);
			} else if (!validActions.includes(step.action)) {
				errors.push(`steps[${i}]: unknown action '${step.action}' (valid: ${validActions.join(", ")})`);
			}
		}
	}

	// Evaluate validation
	if (!data.evaluate || typeof data.evaluate !== "object") {
		errors.push("missing 'evaluate' section");
	} else {
		const evaluate = data.evaluate as Record<string, unknown>;
		const validMethods = ["rules", "llm", "hybrid"];
		if (!evaluate.method || typeof evaluate.method !== "string") {
			errors.push("evaluate.method is required (e.g., 'rules', 'llm', 'hybrid')");
		} else if (!validMethods.includes(evaluate.method)) {
			errors.push(`evaluate.method must be one of: ${validMethods.join(", ")} — got '${evaluate.method}'`);
		}
		if (evaluate.passThreshold !== undefined) {
			const t = Number(evaluate.passThreshold);
			if (Number.isNaN(t) || t < 0 || t > 100) {
				errors.push("evaluate.passThreshold must be a number between 0 and 100");
			}
		}
	}

	// Timeout validation
	if (data.timeout !== undefined) {
		const t = Number(data.timeout);
		if (Number.isNaN(t) || t <= 0) {
			errors.push("timeout must be a positive number (seconds)");
		}
	}

	return errors;
}

/** Load multiple scenarios from a list of paths */
export function loadScenarios(filePaths: string[]): Scenario[] {
	if (filePaths.length === 0) {
		throw new Error("No scenario files provided");
	}

	const scenarios: Scenario[] = [];
	const errors: string[] = [];

	for (const filePath of filePaths) {
		try {
			scenarios.push(loadScenario(filePath));
		} catch (err) {
			errors.push(err instanceof Error ? err.message : String(err));
		}
	}

	if (errors.length > 0 && scenarios.length === 0) {
		throw new Error(`All ${filePaths.length} scenario file(s) failed to load:\n${errors.join("\n")}`);
	}

	if (errors.length > 0) {
		console.warn(
			`Warning: ${errors.length} of ${filePaths.length} scenario file(s) failed to load:\n${errors.join("\n")}`,
		);
	}

	return scenarios;
}
