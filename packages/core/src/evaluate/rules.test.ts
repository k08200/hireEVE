import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RunOutput } from "../core/runner.js";
import type { RuleCheck } from "../scenario/types.js";
import { calculateRuleScore, evaluateRules } from "./rules.js";

const baseOutput: RunOutput = {
  stdout: "hello world",
  stderr: "",
  exitCode: 0,
  durationMs: 100,
  stepResults: [],
};

describe("evaluateRules", () => {
  it("returns empty array for empty rules", () => {
    const results = evaluateRules([], baseOutput);
    assert.equal(results.length, 0);
  });

  it("contains rule passes when string found", () => {
    const rules: RuleCheck[] = [{ type: "contains", target: "stdout", value: "hello", weight: 1 }];
    const results = evaluateRules(rules, baseOutput);
    assert.equal(results[0].passed, true);
    assert.match(results[0].detail, /Found "hello"/);
  });

  it("contains rule fails when string not found", () => {
    const rules: RuleCheck[] = [
      { type: "contains", target: "stdout", value: "goodbye", weight: 1 },
    ];
    const results = evaluateRules(rules, baseOutput);
    assert.equal(results[0].passed, false);
  });

  it("regex rule handles invalid regex gracefully", () => {
    const rules: RuleCheck[] = [{ type: "regex", target: "stdout", value: "[invalid(", weight: 1 }];
    const results = evaluateRules(rules, baseOutput);
    assert.equal(results[0].passed, false);
    assert.match(results[0].detail, /Invalid regex/);
  });

  it("regex rule works with valid regex", () => {
    const rules: RuleCheck[] = [{ type: "regex", target: "stdout", value: "hel+o", weight: 1 }];
    const results = evaluateRules(rules, baseOutput);
    assert.equal(results[0].passed, true);
  });

  it("exit_code rule handles NaN value", () => {
    const rules: RuleCheck[] = [{ type: "exit_code", target: "exit", value: "abc", weight: 1 }];
    const results = evaluateRules(rules, baseOutput);
    assert.equal(results[0].passed, false);
    assert.match(results[0].detail, /must be an integer/);
  });

  it("exit_code rule passes on match", () => {
    const rules: RuleCheck[] = [{ type: "exit_code", target: "exit", value: "0", weight: 1 }];
    const results = evaluateRules(rules, baseOutput);
    assert.equal(results[0].passed, true);
  });

  it("exit_code rule fails on mismatch", () => {
    const rules: RuleCheck[] = [{ type: "exit_code", target: "exit", value: "1", weight: 1 }];
    const results = evaluateRules(rules, baseOutput);
    assert.equal(results[0].passed, false);
    assert.match(results[0].detail, /Expected exit 1, got 0/);
  });

  it("unknown target returns error", () => {
    const rules: RuleCheck[] = [
      { type: "contains", target: "unknown_target", value: "x", weight: 1 },
    ];
    const results = evaluateRules(rules, baseOutput);
    assert.equal(results[0].passed, false);
    assert.match(results[0].detail, /Unknown target/);
  });

  it("unknown rule type returns error", () => {
    const rules: RuleCheck[] = [
      { type: "magic" as RuleCheck["type"], target: "stdout", value: "x", weight: 1 },
    ];
    const results = evaluateRules(rules, baseOutput);
    assert.equal(results[0].passed, false);
    assert.match(results[0].detail, /Unknown rule type/);
  });

  it("json_match works with valid JSON", () => {
    const output = { ...baseOutput, stdout: '{"status":"ok","count":5}' };
    const rules: RuleCheck[] = [
      { type: "json_match", target: "stdout", value: '{"status":"ok"}', weight: 1 },
    ];
    const results = evaluateRules(rules, output);
    assert.equal(results[0].passed, true);
  });

  it("json_match fails on invalid JSON in output", () => {
    const output = { ...baseOutput, stdout: "not json" };
    const rules: RuleCheck[] = [
      { type: "json_match", target: "stdout", value: '{"a":"b"}', weight: 1 },
    ];
    const results = evaluateRules(rules, output);
    assert.equal(results[0].passed, false);
    assert.match(results[0].detail, /JSON parse failed/);
  });
});

describe("calculateRuleScore", () => {
  it("returns 0 for empty results", () => {
    assert.equal(calculateRuleScore([]), 0);
  });

  it("returns 100 when all pass", () => {
    const rule: RuleCheck = { type: "contains", target: "stdout", value: "x", weight: 1 };
    const results = [
      { rule, passed: true, detail: "ok" },
      { rule, passed: true, detail: "ok" },
    ];
    assert.equal(calculateRuleScore(results), 100);
  });

  it("returns 50 when half pass with equal weight", () => {
    const rule: RuleCheck = { type: "contains", target: "stdout", value: "x", weight: 1 };
    const results = [
      { rule, passed: true, detail: "ok" },
      { rule, passed: false, detail: "fail" },
    ];
    assert.equal(calculateRuleScore(results), 50);
  });

  it("respects weights", () => {
    const results = [
      {
        rule: { type: "contains" as const, target: "stdout", value: "x", weight: 3 },
        passed: true,
        detail: "ok",
      },
      {
        rule: { type: "contains" as const, target: "stdout", value: "y", weight: 1 },
        passed: false,
        detail: "fail",
      },
    ];
    assert.equal(calculateRuleScore(results), 75);
  });
});
