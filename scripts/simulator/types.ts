/**
 * CRM Conversation Simulator — Type Definitions
 */

// ---------------------------------------------------------------------------
// Scenario schema (JSON files)
// ---------------------------------------------------------------------------

export interface Scenario {
  id: string;
  name: string;
  description: string;
  role: "ae" | "gerente" | "director" | "vp";
  persona_id: string;
  tags: string[];
  /** Optional SQL to run before scenario (seed extra data). */
  setup_sql?: string[];
  turns: Turn[];
}

export interface Turn {
  user: string;
  expect: TurnExpectation;
}

export interface TurnExpectation {
  /** Tools that MUST be called (order-independent, extra tools allowed). */
  tools_called?: string[];
  /** Tools that must NOT be called. */
  tools_not_called?: string[];
  /** Substrings that must appear in the response (case-insensitive). */
  response_contains?: string[];
  /** Substrings that must NOT appear in the response (case-insensitive). */
  response_not_contains?: string[];
  /** Max tool-call rounds before a text response. */
  max_rounds?: number;
}

// ---------------------------------------------------------------------------
// Execution results
// ---------------------------------------------------------------------------

export interface ToolCallDetail {
  name: string;
  args: Record<string, unknown>;
  result_preview: string;
  success: boolean;
}

export interface TurnScore {
  tools_called_pass: boolean;
  tools_not_called_pass: boolean;
  response_contains_pass: boolean;
  response_not_contains_pass: boolean;
  max_rounds_pass: boolean;
  overall_pass: boolean;
  details: string[];
}

export interface TurnResult {
  turn_index: number;
  user_message: string;
  assistant_response: string;
  tools_called: string[];
  tool_call_details: ToolCallDetail[];
  rounds: number;
  latency_ms: number;
  token_usage: { prompt_tokens: number; completion_tokens: number };
  scores: TurnScore;
}

export interface ScenarioResult {
  scenario_id: string;
  scenario_name: string;
  role: string;
  persona_id: string;
  tags: string[];
  turns: TurnResult[];
  overall_pass: boolean;
  total_latency_ms: number;
  total_tokens: { prompt_tokens: number; completion_tokens: number };
  error?: string;
}

export interface SimulationReport {
  timestamp: string;
  mode: string;
  duration_ms: number;
  scenarios_run: number;
  scenarios_passed: number;
  scenarios_failed: number;
  total_tokens: { prompt_tokens: number; completion_tokens: number };
  estimated_cost_usd: number;
  results: ScenarioResult[];
}

// ---------------------------------------------------------------------------
// History tracking
// ---------------------------------------------------------------------------

export interface HistoryEntry {
  timestamp: string;
  mode: string;
  scenarios_run: number;
  scenarios_passed: number;
  pass_rate: number;
  duration_ms: number;
  estimated_cost_usd: number;
  failures: string[];
}

// ---------------------------------------------------------------------------
// CLI options
// ---------------------------------------------------------------------------

export interface SimulatorOptions {
  role?: string;
  scenario?: string;
  tag?: string;
  mode: "full" | "morning" | "evening" | "regression";
  verbose: boolean;
  dryRun: boolean;
  reportDir: string;
}
