/**
 * Conversation Runner — Executes scenarios against the CRM inference pipeline.
 *
 * For each turn in a scenario:
 *   1. Builds system prompt (host-side)
 *   2. Gets role-filtered tools + intent filter
 *   3. Wraps executeTool with instrumentation
 *   4. Calls inferWithTools (real LLM via DashScope)
 *   5. Records tool calls, latency, token usage
 */

import { buildSystemPrompt } from "./prompt-builder.js";
import { scoreTurn } from "./scorer.js";
import type {
  Scenario,
  ScenarioResult,
  TurnResult,
  ToolCallDetail,
} from "./types.js";
import {
  getToolsForRole,
  executeTool,
  buildToolContext,
} from "../../crm/src/tools/index.js";
import { filterToolsByIntent } from "../../crm/src/tools/intent-filter.js";
import { inferWithTools } from "../../crm/src/inference-adapter.js";
import type { ChatMessage } from "../../crm/src/inference-adapter.js";
import { getPersonById } from "../../crm/src/hierarchy.js";

export async function runScenario(
  scenario: Scenario,
  verbose: boolean = false,
): Promise<ScenarioResult> {
  const startTime = Date.now();
  const totalTokens = { prompt_tokens: 0, completion_tokens: 0 };
  const turnResults: TurnResult[] = [];

  try {
    // Resolve persona
    const persona = getPersonById(scenario.persona_id);
    if (!persona) {
      return errorResult(
        scenario,
        startTime,
        `Persona not found: ${scenario.persona_id}`,
      );
    }

    // Build tool context
    const toolCtx = buildToolContext(scenario.persona_id);
    if (!toolCtx) {
      return errorResult(
        scenario,
        startTime,
        `Tool context build failed for: ${scenario.persona_id}`,
      );
    }

    // Build system prompt
    const systemPrompt = buildSystemPrompt(scenario.role, persona);

    // Get role-based tools
    const allTools = getToolsForRole(scenario.role);

    // Initialize conversation
    const messages: ChatMessage[] = [{ role: "system", content: systemPrompt }];

    for (let i = 0; i < scenario.turns.length; i++) {
      const turn = scenario.turns[i];
      const turnStart = Date.now();
      const toolsCalled: ToolCallDetail[] = [];

      // Apply intent filter for realistic tool scoping
      const scopedTools = filterToolsByIntent(allTools, turn.user);

      // Instrumented executor — wraps executeTool to record calls
      const executor = async (
        name: string,
        args: Record<string, unknown>,
      ): Promise<string> => {
        try {
          const result = await executeTool(name, args, toolCtx);
          toolsCalled.push({
            name,
            args,
            result_preview:
              typeof result === "string"
                ? result.slice(0, 200)
                : String(result).slice(0, 200),
            success: true,
          });
          return result;
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          toolsCalled.push({
            name,
            args,
            result_preview: `ERROR: ${errMsg.slice(0, 200)}`,
            success: false,
          });
          return JSON.stringify({ error: errMsg });
        }
      };

      // Add user message
      messages.push({ role: "user", content: turn.user });

      if (verbose) {
        process.stderr.write(
          `    Turn ${i + 1}: "${turn.user.slice(0, 60)}..."\n`,
        );
      }

      // Run inference with real LLM
      const maxRounds = turn.expect.max_rounds ?? 10;
      const result = await inferWithTools(
        messages,
        scopedTools,
        executor,
        maxRounds,
      );

      const turnLatency = Date.now() - turnStart;

      // Update conversation for multi-turn
      messages.length = 0;
      messages.push(...result.messages);

      // Count rounds (assistant messages with tool_calls)
      const rounds = result.messages.filter(
        (m) =>
          m.role === "assistant" && m.tool_calls && m.tool_calls.length > 0,
      ).length;

      totalTokens.prompt_tokens += result.totalUsage.prompt_tokens;
      totalTokens.completion_tokens += result.totalUsage.completion_tokens;

      // Score
      const scores = scoreTurn(turn.expect, {
        tools_called: toolsCalled.map((t) => t.name),
        response: result.content,
        rounds,
      });

      if (verbose) {
        const status = scores.overall_pass ? "PASS" : "FAIL";
        process.stderr.write(
          `    → ${status} (${(turnLatency / 1000).toFixed(1)}s, tools: [${toolsCalled.map((t) => t.name).join(", ")}])\n`,
        );
        if (!scores.overall_pass) {
          for (const d of scores.details) {
            process.stderr.write(`      ! ${d}\n`);
          }
        }
      }

      turnResults.push({
        turn_index: i,
        user_message: turn.user,
        assistant_response: result.content,
        tools_called: toolsCalled.map((t) => t.name),
        tool_call_details: toolsCalled,
        rounds,
        latency_ms: turnLatency,
        token_usage: result.totalUsage,
        scores,
      });
    }

    const overallPass = turnResults.every((t) => t.scores.overall_pass);

    return {
      scenario_id: scenario.id,
      scenario_name: scenario.name,
      role: scenario.role,
      persona_id: scenario.persona_id,
      tags: scenario.tags,
      turns: turnResults,
      overall_pass: overallPass,
      total_latency_ms: Date.now() - startTime,
      total_tokens: totalTokens,
    };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return errorResult(scenario, startTime, errMsg, turnResults);
  }
}

function errorResult(
  scenario: Scenario,
  startTime: number,
  error: string,
  turns: TurnResult[] = [],
): ScenarioResult {
  return {
    scenario_id: scenario.id,
    scenario_name: scenario.name,
    role: scenario.role,
    persona_id: scenario.persona_id,
    tags: scenario.tags,
    turns,
    overall_pass: false,
    total_latency_ms: Date.now() - startTime,
    total_tokens: { prompt_tokens: 0, completion_tokens: 0 },
    error,
  };
}
