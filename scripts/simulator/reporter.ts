/**
 * Reporter — Generates markdown reports and maintains run history.
 */

import fs from "fs";
import path from "path";
import type { SimulationReport, HistoryEntry } from "./types.js";

const DASHSCOPE_INPUT_RATE = 0.002; // $/1K tokens
const DASHSCOPE_OUTPUT_RATE = 0.006;

export function estimateCost(report: SimulationReport): number {
  const inputCost =
    (report.total_tokens.prompt_tokens / 1000) * DASHSCOPE_INPUT_RATE;
  const outputCost =
    (report.total_tokens.completion_tokens / 1000) * DASHSCOPE_OUTPUT_RATE;
  return Math.round((inputCost + outputCost) * 1000) / 1000;
}

export function generateReport(report: SimulationReport): string {
  const cost = report.estimated_cost_usd;
  const passRate =
    report.scenarios_run > 0
      ? Math.round((report.scenarios_passed / report.scenarios_run) * 100)
      : 0;
  const durationMin = (report.duration_ms / 60000).toFixed(1);

  const lines: string[] = [];

  lines.push(`# CRM Simulator Report`);
  lines.push(`**Date**: ${report.timestamp}`);
  lines.push(`**Mode**: ${report.mode}`);
  lines.push(`**Duration**: ${durationMin}m`);
  lines.push(
    `**Scenarios**: ${report.scenarios_passed}/${report.scenarios_run} passed (${passRate}%)`,
  );
  lines.push(
    `**Tokens**: ${report.total_tokens.prompt_tokens.toLocaleString()} prompt / ${report.total_tokens.completion_tokens.toLocaleString()} completion`,
  );
  lines.push(`**Estimated Cost**: $${cost.toFixed(3)}`);
  lines.push("");

  // Summary table
  lines.push("## Summary");
  lines.push("");
  lines.push("| # | Scenario | Role | Turns | Result | Time | Tokens |");
  lines.push("|---|----------|------|-------|--------|------|--------|");

  for (let i = 0; i < report.results.length; i++) {
    const r = report.results[i];
    const status = r.error ? "ERROR" : r.overall_pass ? "PASS" : "FAIL";
    const time = `${(r.total_latency_ms / 1000).toFixed(1)}s`;
    const tokens = `${((r.total_tokens.prompt_tokens + r.total_tokens.completion_tokens) / 1000).toFixed(1)}k`;
    lines.push(
      `| ${i + 1} | ${r.scenario_name} | ${r.role} | ${r.turns.length} | ${status} | ${time} | ${tokens} |`,
    );
  }
  lines.push("");

  // Failures section
  const failures = report.results.filter((r) => !r.overall_pass);
  if (failures.length > 0) {
    lines.push("## Failures");
    lines.push("");

    for (const f of failures) {
      lines.push(`### ${f.scenario_name} (${f.role})`);
      if (f.error) {
        lines.push(`**Error**: ${f.error}`);
        lines.push("");
        continue;
      }

      for (const t of f.turns) {
        if (!t.scores.overall_pass) {
          lines.push(
            `**Turn ${t.turn_index + 1}**: "${t.user_message.slice(0, 80)}"`,
          );
          for (const d of t.scores.details) {
            lines.push(`- ${d}`);
          }
          lines.push(`- Tools called: [${t.tools_called.join(", ")}]`);
          lines.push(
            `- Response (first 200 chars): ${t.assistant_response.slice(0, 200)}`,
          );
          lines.push("");
        }
      }
    }
  }

  // Full traces (collapsible)
  lines.push("## Full Results");
  lines.push("");
  for (const r of report.results) {
    const status = r.error ? "ERROR" : r.overall_pass ? "PASS" : "FAIL";
    lines.push(`<details>`);
    lines.push(`<summary>${r.scenario_name} (${status})</summary>`);
    lines.push("");
    if (r.error) {
      lines.push(`Error: ${r.error}`);
    }
    for (const t of r.turns) {
      lines.push(
        `**Turn ${t.turn_index + 1}** [${t.scores.overall_pass ? "PASS" : "FAIL"}]`,
      );
      lines.push(`- User: "${t.user_message}"`);
      lines.push(`- Tools: [${t.tools_called.join(", ")}]`);
      lines.push(`- Response: ${t.assistant_response.slice(0, 300)}`);
      lines.push(`- Latency: ${(t.latency_ms / 1000).toFixed(1)}s`);
      lines.push("");
    }
    lines.push(`</details>`);
    lines.push("");
  }

  return lines.join("\n");
}

export function writeReport(
  report: SimulationReport,
  reportDir: string,
): string {
  fs.mkdirSync(reportDir, { recursive: true });
  const filename = `${report.timestamp.replace(/[: ]/g, "-")}.md`;
  const filePath = path.join(reportDir, filename);
  fs.writeFileSync(filePath, generateReport(report), "utf-8");
  return filePath;
}

export function updateHistory(
  report: SimulationReport,
  reportDir: string,
): void {
  const historyPath = path.join(reportDir, "history.json");
  let history: HistoryEntry[] = [];

  if (fs.existsSync(historyPath)) {
    try {
      history = JSON.parse(fs.readFileSync(historyPath, "utf-8"));
    } catch {
      history = [];
    }
  }

  const failures = report.results
    .filter((r) => !r.overall_pass)
    .map((r) => r.scenario_id);

  history.push({
    timestamp: report.timestamp,
    mode: report.mode,
    scenarios_run: report.scenarios_run,
    scenarios_passed: report.scenarios_passed,
    pass_rate:
      report.scenarios_run > 0
        ? Math.round((report.scenarios_passed / report.scenarios_run) * 100)
        : 0,
    duration_ms: report.duration_ms,
    estimated_cost_usd: report.estimated_cost_usd,
    failures,
  });

  // Keep last 90 days of history
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  history = history.filter((h) => new Date(h.timestamp).getTime() > cutoff);

  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), "utf-8");
}
