import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { loadScenario, loadScenarios } from "./loader.js";

const TMP = join(import.meta.dirname, "../../.tmp-test");

function setup() {
  mkdirSync(TMP, { recursive: true });
}

function cleanup() {
  rmSync(TMP, { recursive: true, force: true });
}

function writeYaml(name: string, content: string): string {
  const path = join(TMP, name);
  writeFileSync(path, content);
  return path;
}

const validYaml = `
id: test-1
name: "Test Scenario"
description: "A test"
agent:
  type: command
  command: "echo hello"
steps:
  - action: check_output
    expect: "hello"
evaluate:
  method: rules
  passThreshold: 100
  rules:
    - type: exit_code
      target: exit
      value: "0"
`;

describe("loadScenario", () => {
  it("loads a valid scenario", () => {
    setup();
    const path = writeYaml("valid.yaml", validYaml);
    const scenario = loadScenario(path);
    assert.equal(scenario.id, "test-1");
    assert.equal(scenario.name, "Test Scenario");
    assert.equal(scenario.agent.type, "command");
    cleanup();
  });

  it("throws on missing file", () => {
    assert.throws(() => loadScenario("/nonexistent/file.yaml"), /File not found/);
  });

  it("throws on empty file", () => {
    setup();
    const path = writeYaml("empty.yaml", "   ");
    assert.throws(() => loadScenario(path), /File is empty/);
    cleanup();
  });

  it("throws on invalid YAML syntax", () => {
    setup();
    const path = writeYaml("bad.yaml", "foo: [invalid\nyaml: broken");
    assert.throws(() => loadScenario(path), /Invalid YAML/);
    cleanup();
  });

  it("throws on non-object YAML", () => {
    setup();
    const path = writeYaml("string.yaml", "just a string");
    assert.throws(() => loadScenario(path), /expected a YAML object/);
    cleanup();
  });

  it("collects all validation errors at once", () => {
    setup();
    const path = writeYaml("missing-fields.yaml", "foo: bar\n");
    try {
      loadScenario(path);
      assert.fail("should have thrown");
    } catch (err) {
      const msg = (err as Error).message;
      assert.match(msg, /missing or invalid 'id'/);
      assert.match(msg, /missing or invalid 'name'/);
      assert.match(msg, /missing 'agent'/);
      assert.match(msg, /missing 'steps'/);
      assert.match(msg, /missing 'evaluate'/);
    }
    cleanup();
  });

  it("validates agent.type", () => {
    setup();
    const yaml = validYaml.replace("type: command", "type: ftp");
    const path = writeYaml("bad-agent.yaml", yaml);
    assert.throws(() => loadScenario(path), /agent\.type must be/);
    cleanup();
  });

  it("validates agent.command required for command type", () => {
    setup();
    const yaml = validYaml.replace('command: "echo hello"', "");
    const path = writeYaml("no-cmd.yaml", yaml);
    assert.throws(() => loadScenario(path), /agent\.command is required/);
    cleanup();
  });

  it("validates evaluate.method", () => {
    setup();
    const yaml = validYaml.replace("method: rules", "method: magic");
    const path = writeYaml("bad-method.yaml", yaml);
    assert.throws(() => loadScenario(path), /evaluate\.method must be/);
    cleanup();
  });

  it("validates steps[].action", () => {
    setup();
    const yaml = validYaml.replace("action: check_output", "action: fly");
    const path = writeYaml("bad-step.yaml", yaml);
    assert.throws(() => loadScenario(path), /unknown action 'fly'/);
    cleanup();
  });

  it("validates passThreshold range", () => {
    setup();
    const yaml = validYaml.replace("passThreshold: 100", "passThreshold: 200");
    const path = writeYaml("bad-threshold.yaml", yaml);
    assert.throws(() => loadScenario(path), /passThreshold must be/);
    cleanup();
  });
});

describe("loadScenarios", () => {
  it("throws on empty file list", () => {
    assert.throws(() => loadScenarios([]), /No scenario files provided/);
  });

  it("throws when all files fail", () => {
    assert.throws(
      () => loadScenarios(["/no/a.yaml", "/no/b.yaml"]),
      /All 2 scenario file\(s\) failed/,
    );
  });

  it("returns valid ones and warns on partial failures", () => {
    setup();
    const good = writeYaml("good.yaml", validYaml);
    const scenarios = loadScenarios([good, "/no/bad.yaml"]);
    assert.equal(scenarios.length, 1);
    assert.equal(scenarios[0].id, "test-1");
    cleanup();
  });
});
