#!/usr/bin/env tsx
/**
 * CRM Conversation Simulator — CLI Entry Point
 *
 * Usage:
 *   npx tsx scripts/simulator/index.ts                    # Full regression + dynamic
 *   npx tsx scripts/simulator/index.ts --mode morning     # Morning briefing focus
 *   npx tsx scripts/simulator/index.ts --mode evening     # End-of-day review focus
 *   npx tsx scripts/simulator/index.ts --mode regression  # Static scenarios only
 *   npx tsx scripts/simulator/index.ts --role ae          # Filter by role
 *   npx tsx scripts/simulator/index.ts --scenario ae-briefing  # Single scenario
 *   npx tsx scripts/simulator/index.ts --tag confidentiality   # By tag
 *   npx tsx scripts/simulator/index.ts --dry-run          # Validate only
 *   npx tsx scripts/simulator/index.ts --verbose          # Full traces
 */

import fs from "fs";
import path from "path";
import {
  initSandbox,
  beforeScenario,
  afterScenario,
  cleanupSandbox,
} from "./db-sandbox.js";
import { runScenario } from "./runner.js";
import { estimateCost, writeReport, updateHistory } from "./reporter.js";
import {
  generateMorningScenarios,
  generateEveningScenarios,
  generateFullDynamicScenarios,
} from "./generator.js";
import type {
  Scenario,
  ScenarioResult,
  SimulationReport,
  SimulatorOptions,
} from "./types.js";

// ---------------------------------------------------------------------------
// Load .env (lightweight, no dependency)
// ---------------------------------------------------------------------------

function loadEnv(): void {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // Strip quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseArgs(): SimulatorOptions {
  const args = process.argv.slice(2);
  const opts: SimulatorOptions = {
    mode: "full",
    verbose: false,
    dryRun: false,
    reportDir: path.join(process.cwd(), "scripts", "simulator", "reports"),
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--role":
        opts.role = args[++i];
        break;
      case "--scenario":
        opts.scenario = args[++i];
        break;
      case "--tag":
        opts.tag = args[++i];
        break;
      case "--mode":
        opts.mode = args[++i] as SimulatorOptions["mode"];
        break;
      case "--verbose":
        opts.verbose = true;
        break;
      case "--dry-run":
        opts.dryRun = true;
        break;
      case "--report-dir":
        opts.reportDir = args[++i];
        break;
    }
  }

  return opts;
}

// ---------------------------------------------------------------------------
// Scenario loading
// ---------------------------------------------------------------------------

function loadStaticScenarios(): Scenario[] {
  const scenarioDir = path.join(
    process.cwd(),
    "scripts",
    "simulator",
    "scenarios",
  );
  if (!fs.existsSync(scenarioDir)) return [];

  const files = fs.readdirSync(scenarioDir).filter((f) => f.endsWith(".json"));
  const scenarios: Scenario[] = [];

  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(scenarioDir, file), "utf-8");
      const scenario = JSON.parse(raw) as Scenario;
      scenarios.push(scenario);
    } catch (err) {
      console.error(`  Warning: Failed to parse ${file}: ${err}`);
    }
  }

  return scenarios;
}

function filterScenarios(
  scenarios: Scenario[],
  opts: SimulatorOptions,
): Scenario[] {
  let filtered = scenarios;

  if (opts.scenario) {
    filtered = filtered.filter((s) => s.id === opts.scenario);
  }
  if (opts.role) {
    filtered = filtered.filter((s) => s.role === opts.role);
  }
  if (opts.tag) {
    filtered = filtered.filter((s) => s.tags.includes(opts.tag!));
  }

  return filtered;
}

// ---------------------------------------------------------------------------
// Dry run validation
// ---------------------------------------------------------------------------

function validateScenarios(scenarios: Scenario[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  for (const s of scenarios) {
    if (!s.id) errors.push(`Scenario missing id`);
    if (!s.role) errors.push(`${s.id}: missing role`);
    if (!s.persona_id) errors.push(`${s.id}: missing persona_id`);
    if (!s.turns || s.turns.length === 0) errors.push(`${s.id}: no turns`);
    for (let i = 0; i < (s.turns?.length ?? 0); i++) {
      const turn = s.turns[i];
      if (!turn.user) errors.push(`${s.id} turn ${i}: empty user message`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const startTime = Date.now();
  loadEnv();
  const opts = parseArgs();

  const mxTime = new Date().toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
  });
  console.log(`CRM Conversation Simulator v0.1`);
  console.log(`Mode: ${opts.mode} | Time: ${mxTime}`);
  console.log("");

  // Load static scenarios
  const staticScenarios = loadStaticScenarios();
  console.log(`Loaded ${staticScenarios.length} static scenarios`);

  // Generate dynamic scenarios based on mode
  let dynamicScenarios: Scenario[] = [];
  if (opts.mode !== "regression" && !opts.dryRun) {
    // Need DB sandbox for dynamic generation (reads DB state)
    initSandbox();
    try {
      await beforeScenario("dynamic-gen");
      switch (opts.mode) {
        case "morning":
          dynamicScenarios = generateMorningScenarios();
          break;
        case "evening":
          dynamicScenarios = generateEveningScenarios();
          break;
        case "full":
        default:
          dynamicScenarios = generateFullDynamicScenarios();
          break;
      }
      await afterScenario();
    } catch (err) {
      console.error(`Warning: Dynamic generation failed: ${err}`);
    }
    console.log(`Generated ${dynamicScenarios.length} dynamic scenarios`);
  }

  // Combine and filter
  let allScenarios: Scenario[];
  switch (opts.mode) {
    case "regression":
      allScenarios = staticScenarios;
      break;
    case "morning":
      allScenarios = [
        ...staticScenarios.filter(
          (s) => s.tags.includes("morning") || s.tags.includes("briefing"),
        ),
        ...dynamicScenarios,
      ];
      break;
    case "evening":
      allScenarios = [
        ...staticScenarios.filter(
          (s) =>
            s.tags.includes("evening") ||
            s.tags.includes("confidentiality") ||
            s.tags.includes("approvals"),
        ),
        ...dynamicScenarios,
      ];
      break;
    case "full":
    default:
      allScenarios = [...staticScenarios, ...dynamicScenarios];
      break;
  }

  allScenarios = filterScenarios(allScenarios, opts);
  console.log(
    `Running ${allScenarios.length} scenarios${opts.dryRun ? " (dry run)" : ""}`,
  );
  console.log("");

  // Dry run — validate and exit
  if (opts.dryRun) {
    const { valid, errors } = validateScenarios(allScenarios);
    if (valid) {
      console.log("All scenarios validated successfully.");
      for (const s of allScenarios) {
        console.log(`  [OK] ${s.id} (${s.role}, ${s.turns.length} turns)`);
      }
    } else {
      console.error("Validation errors:");
      for (const e of errors) {
        console.error(`  [ERR] ${e}`);
      }
    }
    process.exit(valid ? 0 : 2);
  }

  // Initialize DB sandbox (if not already done for dynamic gen)
  if (opts.mode === "regression") {
    initSandbox();
  }

  // Run scenarios
  const results: ScenarioResult[] = [];
  for (let i = 0; i < allScenarios.length; i++) {
    const scenario = allScenarios[i];
    const prefix = `[${i + 1}/${allScenarios.length}]`;

    process.stdout.write(` ${prefix} ${scenario.name} `);

    try {
      await beforeScenario(scenario.id, scenario.setup_sql);
      const result = await runScenario(scenario, opts.verbose);
      results.push(result);

      const status = result.error
        ? "ERROR"
        : result.overall_pass
          ? "PASS"
          : "FAIL";
      const time = `${(result.total_latency_ms / 1000).toFixed(1)}s`;
      const tokens = `${((result.total_tokens.prompt_tokens + result.total_tokens.completion_tokens) / 1000).toFixed(1)}k`;
      const dots = ".".repeat(Math.max(1, 50 - scenario.name.length));
      console.log(`${dots} ${status} (${time}, ${tokens} tokens)`);

      if (!result.overall_pass && !opts.verbose) {
        // Print failure details inline
        if (result.error) {
          console.log(`         Error: ${result.error}`);
        }
        for (const t of result.turns) {
          if (!t.scores.overall_pass) {
            for (const d of t.scores.details) {
              console.log(`         Turn ${t.turn_index + 1}: ${d}`);
            }
          }
        }
      }
    } catch (err) {
      console.log(`... ERROR: ${err}`);
      results.push({
        scenario_id: scenario.id,
        scenario_name: scenario.name,
        role: scenario.role,
        persona_id: scenario.persona_id,
        tags: scenario.tags,
        turns: [],
        overall_pass: false,
        total_latency_ms: 0,
        total_tokens: { prompt_tokens: 0, completion_tokens: 0 },
        error: String(err),
      });
    } finally {
      await afterScenario();
    }
  }

  // Cleanup
  cleanupSandbox();

  // Build report
  const totalTokens = results.reduce(
    (acc, r) => ({
      prompt_tokens: acc.prompt_tokens + r.total_tokens.prompt_tokens,
      completion_tokens:
        acc.completion_tokens + r.total_tokens.completion_tokens,
    }),
    { prompt_tokens: 0, completion_tokens: 0 },
  );

  const report: SimulationReport = {
    timestamp: new Date().toISOString().replace("T", " ").slice(0, 19),
    mode: opts.mode,
    duration_ms: Date.now() - startTime,
    scenarios_run: results.length,
    scenarios_passed: results.filter((r) => r.overall_pass).length,
    scenarios_failed: results.filter((r) => !r.overall_pass).length,
    total_tokens: totalTokens,
    estimated_cost_usd: 0,
    results,
  };
  report.estimated_cost_usd = estimateCost(report);

  // Write report and history
  const reportPath = writeReport(report, opts.reportDir);
  updateHistory(report, opts.reportDir);

  // Summary
  console.log("");
  console.log(`Report: ${reportPath}`);
  console.log(
    `Results: ${report.scenarios_passed}/${report.scenarios_run} passed (${report.scenarios_run > 0 ? Math.round((report.scenarios_passed / report.scenarios_run) * 100) : 0}%)`,
  );
  console.log(
    `Duration: ${(report.duration_ms / 60000).toFixed(1)}m | Cost: ~$${report.estimated_cost_usd.toFixed(3)}`,
  );

  process.exit(report.scenarios_failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`Fatal: ${err}`);
  process.exit(2);
});
