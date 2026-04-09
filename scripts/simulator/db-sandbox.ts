/**
 * DB Sandbox — Isolates each scenario with a fresh database copy.
 *
 * Flow:
 *   1. initSandbox() — copies production DB as read-only template
 *   2. beforeScenario(id) — copies template → active DB, resets singletons
 *   3. afterScenario() — closes DB, deletes active copy
 *   4. cleanupSandbox() — deletes template
 *
 * CRM_DB_PATH env var is set dynamically so getDatabase() opens the sandbox copy.
 */

import fs from "fs";
import path from "path";

const PROD_DB = path.join(process.cwd(), "data", "store", "crm.db");
let templatePath: string | null = null;
let activePath: string | null = null;

export function initSandbox(): void {
  if (!fs.existsSync(PROD_DB)) {
    throw new Error(
      `Production DB not found: ${PROD_DB}. Run seed-demo.ts first.`,
    );
  }
  templatePath = `/tmp/crm-sim-template-${Date.now()}.db`;
  fs.copyFileSync(PROD_DB, templatePath);
}

export async function beforeScenario(
  scenarioId: string,
  setupSql?: string[],
): Promise<void> {
  if (!templatePath) throw new Error("Call initSandbox() first");

  activePath = `/tmp/crm-sim-${scenarioId}-${Date.now()}.db`;
  fs.copyFileSync(templatePath, activePath);

  // Point CRM to the sandbox copy
  process.env.CRM_DB_PATH = activePath;

  // Reset CRM singletons so they reconnect to the new path
  const { _resetDatabase } = await import("../../crm/src/db.js");
  _resetDatabase();

  // hierarchy.ts caches prepared statements — must also reset
  try {
    const { _resetStatementCache } = await import("../../crm/src/hierarchy.js");
    if (typeof _resetStatementCache === "function") _resetStatementCache();
  } catch {
    // hierarchy may not export this in all versions
  }

  // Run setup SQL if provided
  if (setupSql && setupSql.length > 0) {
    const { getDatabase } = await import("../../crm/src/db.js");
    const db = getDatabase();
    for (const sql of setupSql) {
      db.exec(sql);
    }
  }
}

export async function afterScenario(): Promise<void> {
  try {
    const { _resetDatabase } = await import("../../crm/src/db.js");
    _resetDatabase();
  } catch {
    // Best effort
  }

  try {
    const { _resetStatementCache } = await import("../../crm/src/hierarchy.js");
    if (typeof _resetStatementCache === "function") _resetStatementCache();
  } catch {
    // Best effort
  }

  if (activePath && fs.existsSync(activePath)) {
    fs.unlinkSync(activePath);
    activePath = null;
  }
}

export function cleanupSandbox(): void {
  if (templatePath && fs.existsSync(templatePath)) {
    fs.unlinkSync(templatePath);
    templatePath = null;
  }
}
