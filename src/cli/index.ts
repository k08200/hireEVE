#!/usr/bin/env node
import { program } from "commander";
import chalk from "chalk";
import { loadScenarios } from "../scenario/loader.js";
import { probe } from "../core/probe.js";

program
	.name("probeai")
	.description("Test and evaluate AI coding agents")
	.version("0.1.0");

program
	.command("run")
	.description("Run scenario(s) against an agent")
	.argument("<files...>", "YAML scenario file(s)")
	.option("-o, --output <dir>", "Output directory for reports", "./results")
	.option("--md", "Generate markdown report", false)
	.option("-v, --verbose", "Verbose output", false)
	.action(async (files: string[], opts: { output: string; md: boolean; verbose: boolean }) => {
		try {
			const scenarios = loadScenarios(files);
			const results = await probe(scenarios, {
				outputDir: opts.output,
				markdown: opts.md,
				verbose: opts.verbose,
			});

			const failed = results.filter((r) => !r.evaluation.passed).length;
			process.exit(failed > 0 ? 1 : 0);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			console.error(chalk.red(`Error: ${msg}`));
			process.exit(1);
		}
	});

program
	.command("validate")
	.description("Validate scenario file(s) without running")
	.argument("<files...>", "YAML scenario file(s)")
	.action((files: string[]) => {
		let hasError = false;
		for (const file of files) {
			try {
				loadScenarios([file]);
				console.log(chalk.green(`  OK: ${file}`));
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				console.log(chalk.red(`  FAIL: ${file} — ${msg}`));
				hasError = true;
			}
		}
		process.exit(hasError ? 1 : 0);
	});

program.parse();
