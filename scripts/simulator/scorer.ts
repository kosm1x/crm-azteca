/**
 * Scorer — Evaluates each turn against its expectations.
 *
 * Loose scoring: extra tool calls are allowed (LLMs are non-deterministic).
 * Only checks required tools (must be present) and forbidden tools (must be absent).
 */

import type { TurnExpectation, TurnScore } from "./types.js";

export function scoreTurn(
  expect: TurnExpectation,
  actual: {
    tools_called: string[];
    response: string;
    rounds: number;
  },
): TurnScore {
  const details: string[] = [];
  const responseLower = (actual.response ?? "").toLowerCase();

  // 1. Required tools present
  const tools_called_pass =
    !expect.tools_called ||
    expect.tools_called.length === 0 ||
    expect.tools_called.every((t) => actual.tools_called.includes(t));
  if (!tools_called_pass) {
    const missing = expect.tools_called!.filter(
      (t) => !actual.tools_called.includes(t),
    );
    details.push(
      `Missing tools: ${missing.join(", ")} (called: ${actual.tools_called.join(", ") || "none"})`,
    );
  }

  // 2. Forbidden tools absent
  const tools_not_called_pass =
    !expect.tools_not_called ||
    expect.tools_not_called.length === 0 ||
    expect.tools_not_called.every((t) => !actual.tools_called.includes(t));
  if (!tools_not_called_pass) {
    const forbidden = expect.tools_not_called!.filter((t) =>
      actual.tools_called.includes(t),
    );
    details.push(`Forbidden tools called: ${forbidden.join(", ")}`);
  }

  // 3. Response must contain substrings (case-insensitive)
  const response_contains_pass =
    !expect.response_contains ||
    expect.response_contains.length === 0 ||
    expect.response_contains.every((s) =>
      responseLower.includes(s.toLowerCase()),
    );
  if (!response_contains_pass) {
    const missing = expect.response_contains!.filter(
      (s) => !responseLower.includes(s.toLowerCase()),
    );
    details.push(`Response missing: "${missing.join('", "')}"`);
  }

  // 4. Response must NOT contain substrings
  const response_not_contains_pass =
    !expect.response_not_contains ||
    expect.response_not_contains.length === 0 ||
    expect.response_not_contains.every(
      (s) => !responseLower.includes(s.toLowerCase()),
    );
  if (!response_not_contains_pass) {
    const found = expect.response_not_contains!.filter((s) =>
      responseLower.includes(s.toLowerCase()),
    );
    details.push(`Response contains forbidden: "${found.join('", "')}"`);
  }

  // 5. Max rounds
  const max_rounds_pass =
    !expect.max_rounds || actual.rounds <= expect.max_rounds;
  if (!max_rounds_pass) {
    details.push(
      `Exceeded max rounds: ${actual.rounds} > ${expect.max_rounds}`,
    );
  }

  return {
    tools_called_pass,
    tools_not_called_pass,
    response_contains_pass,
    response_not_contains_pass,
    max_rounds_pass,
    overall_pass:
      tools_called_pass &&
      tools_not_called_pass &&
      response_contains_pass &&
      response_not_contains_pass &&
      max_rounds_pass,
    details,
  };
}
