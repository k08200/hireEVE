/** A single test scenario that defines what to probe an agent with */
export interface Scenario {
  /** Unique scenario identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** What this scenario tests */
  description: string;
  /** The agent to test */
  agent: AgentTarget;
  /** Steps to execute in order */
  steps: Step[];
  /** How to evaluate the results */
  evaluate: EvaluationConfig;
  /** Optional timeout per scenario (seconds) */
  timeout?: number;
}

/** Which agent to target */
export interface AgentTarget {
  /** Agent type: "command" runs a CLI, "http" calls an API */
  type: "command" | "http";
  /** For "command": the shell command to start the agent */
  command?: string;
  /** For "http": base URL of the agent API */
  url?: string;
  /** Environment variables to pass */
  env?: Record<string, string>;
}

/** A single step in a scenario */
export interface Step {
  /** What to send to the agent */
  action: "send" | "wait" | "check_file" | "check_output";
  /** Input text (for "send") */
  input?: string;
  /** Wait duration in ms (for "wait") */
  duration?: number;
  /** File path to check (for "check_file") */
  path?: string;
  /** Expected pattern or content */
  expect?: string;
}

/** How to evaluate agent output */
export interface EvaluationConfig {
  /** Evaluation method */
  method: "llm" | "rules" | "hybrid";
  /** For LLM evaluation: the rubric/prompt */
  rubric?: string;
  /** For rules: list of rule checks */
  rules?: RuleCheck[];
  /** Pass threshold (0-100) */
  passThreshold?: number;
  /** Ollama host for LLM evaluation */
  ollamaHost?: string;
  /** Model to use for LLM evaluation */
  model?: string;
}

/** A single rule-based check */
export interface RuleCheck {
  /** What to check */
  type: "contains" | "regex" | "file_exists" | "exit_code" | "json_match";
  /** Target: "stdout", "stderr", "file:<path>", or "exit" */
  target: string;
  /** Expected value or pattern */
  value: string;
  /** Points awarded if this rule passes */
  weight?: number;
}
