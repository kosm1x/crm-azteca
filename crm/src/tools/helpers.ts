/**
 * Shared tool helpers
 *
 * scopeFilter — role-based SQL WHERE clause builder (canonical, single copy)
 * findCuentaId — fuzzy account lookup by name
 * getCurrentWeek — US-style Sunday-anchored week number (NOT ISO week)
 * personaIdFromName — fuzzy persona lookup by name
 */

import { getDatabase } from "../db.js";
import type { ToolContext } from "./index.js";

// ---------------------------------------------------------------------------
// Role-based scope filter (single source of truth)
// ---------------------------------------------------------------------------

export function scopeFilter(
  ctx: ToolContext,
  alias = "ae_id",
): { where: string; params: string[] } {
  if (ctx.rol === "vp") return { where: "", params: [] };
  if (ctx.rol === "director") {
    const ids = [ctx.persona_id, ...ctx.full_team_ids];
    return {
      where: `AND ${alias} IN (${ids.map(() => "?").join(",")})`,
      params: ids,
    };
  }
  if (ctx.rol === "gerente") {
    const ids = [ctx.persona_id, ...ctx.team_ids];
    return {
      where: `AND ${alias} IN (${ids.map(() => "?").join(",")})`,
      params: ids,
    };
  }
  return { where: `AND ${alias} = ?`, params: [ctx.persona_id] };
}

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/**
 * Estado filter for approval workflow.
 * Non-active records are hidden unless the caller created them.
 * Returns a SQL fragment and params to inject into WHERE clauses.
 */
export function estadoFilter(
  ctx: ToolContext,
  alias = "c",
): { where: string; params: string[] } {
  return {
    where: `AND (${alias}.estado IN ('activo','activo_en_revision') OR ${alias}.creado_por = ?)`,
    params: [ctx.persona_id],
  };
}

export function findCuentaId(nombre: string, ctx?: ToolContext): string | null {
  const db = getDatabase();
  if (ctx) {
    const ef = estadoFilter(ctx, "cuenta");
    const row = db
      .prepare(`SELECT id FROM cuenta WHERE nombre LIKE ? ${ef.where}`)
      .get(`%${nombre}%`, ...ef.params) as any;
    return row?.id ?? null;
  }
  const row = db
    .prepare("SELECT id FROM cuenta WHERE nombre LIKE ?")
    .get(`%${nombre}%`) as any;
  return row?.id ?? null;
}

export function personaIdFromName(nombre: string): string | null {
  const db = getDatabase();
  const row = db
    .prepare("SELECT id FROM persona WHERE nombre LIKE ?")
    .get(`%${nombre}%`) as any;
  return row?.id ?? null;
}

/**
 * Current week number using US convention: weeks start Sunday, week 1
 * contains Jan 1, no Thursday rule. NOT ISO 8601 week numbering — these
 * differ by 1 in early January and rarely later in the year.
 *
 * All historical CRM data (semana columns in propuesta, descarga, etc.)
 * is keyed by this US-Sunday formula. Changing it to ISO would break
 * year-over-year comparisons. If you need ISO weeks for an external
 * integration, write a separate helper — do not change this one.
 *
 * Anchored to MX date (not UTC) so the result doesn't slide between
 * 18:00–23:59 UTC when MX is still on the previous day.
 */
export function getCurrentWeek(): number {
  const mxDate = getMxDateStr();
  const [y, m, d] = mxDate.split("-").map(Number);
  const now = Date.UTC(y, m - 1, d);
  const start = Date.UTC(y, 0, 1);
  const startDay = new Date(start).getUTCDay();
  return Math.ceil(((now - start) / 86400000 + startDay + 1) / 7);
}

export function getPersonaEmail(personaId: string): string | null {
  const db = getDatabase();
  const row = db
    .prepare("SELECT email FROM persona WHERE id = ?")
    .get(personaId) as any;
  return row?.email ?? null;
}

// ---------------------------------------------------------------------------
// Mexico City timezone helpers — ALL user-facing dates must use these
// ---------------------------------------------------------------------------

/** All user-facing dates MUST use America/Mexico_City. sv-SE locale = YYYY-MM-DD (ISO 8601). */
const MX_TZ = "America/Mexico_City";

/** YYYY-MM-DD in Mexico City timezone. Accepts optional Date for future/past dates. */
export function getMxDateStr(date?: Date): string {
  return (date ?? new Date()).toLocaleDateString("sv-SE", { timeZone: MX_TZ });
}

/** Current year in Mexico City timezone (avoids UTC year-boundary bug on Dec 31 evening). */
export function getMxYear(): number {
  return parseInt(getMxDateStr().split("-")[0], 10);
}

/**
 * YYYY-MM-DD HH:MM:SS in Mexico City timezone — SQLite datetime-compatible.
 * Use this where you'd otherwise call `datetime('now')` in SQL but need a JS
 * value (e.g., when binding as a parameter). For pure SQL defaults, prefer
 * `datetime('now','-6 hours')` directly.
 */
export function getMxDateTimeStr(date?: Date): string {
  // sv-SE locale produces "YYYY-MM-DD HH:MM:SS" which matches SQLite.
  return (date ?? new Date()).toLocaleString("sv-SE", { timeZone: MX_TZ });
}

/**
 * Compute a date cutoff string for use as a SQL parameter against
 * `datetime('now', ...)`-stored columns. Returns YYYY-MM-DD in MX time so
 * lexical text comparison with `YYYY-MM-DD HH:MM:SS` columns works under
 * `>=` ("rows from N MX-days ago onward"). The previous UTC ISO format
 * (`...T...Z`) sorted after the SQLite space-separated format and silently
 * dropped same-day rows.
 *
 * **MUST be used with `>=` semantics, not `<`.** `dateCutoff(7)` means
 * "the start of the MX day 7 days ago" — a row from 7 days 23 hours ago
 * is INCLUDED, not excluded. Inverting to `< dateCutoff(7)` would silently
 * drop rows from the cutoff day itself. If you need exclusive-window
 * semantics, write a separate helper.
 */
export function dateCutoff(daysAgo: number): string {
  const cutoff = new Date(Date.now() - daysAgo * 86400000);
  return getMxDateStr(cutoff);
}

/**
 * Compute data freshness metadata for a set of rows.
 * Tells the agent how old the most recent data point is so it can
 * express appropriate confidence (or uncertainty) to the user.
 */
export function dataFreshness(
  rows: any[],
  dateField: string,
): {
  latest: string | null;
  days_old: number;
  stale: boolean;
} {
  if (!rows.length) return { latest: null, days_old: -1, stale: true };
  const withDate = rows.filter((r) => r[dateField] != null);
  if (!withDate.length) return { latest: null, days_old: -1, stale: true };
  const latest = withDate.reduce(
    (max, r) => (r[dateField] > max ? r[dateField] : max),
    "",
  );
  const daysOld = Math.floor(
    (Date.now() - new Date(latest).getTime()) / 86400000,
  );
  return { latest, days_old: daysOld, stale: daysOld > 3 };
}
