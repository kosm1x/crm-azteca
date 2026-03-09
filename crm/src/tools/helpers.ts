/**
 * Shared tool helpers
 *
 * scopeFilter — role-based SQL WHERE clause builder (canonical, single copy)
 * findCuentaId — fuzzy account lookup by name
 * getCurrentWeek — ISO week number
 * personaIdFromName — fuzzy persona lookup by name
 */

import { getDatabase } from '../db.js';
import type { ToolContext } from './index.js';

// ---------------------------------------------------------------------------
// Role-based scope filter (single source of truth)
// ---------------------------------------------------------------------------

export function scopeFilter(ctx: ToolContext, alias = 'ae_id'): { where: string; params: string[] } {
  if (ctx.rol === 'vp') return { where: '', params: [] };
  if (ctx.rol === 'director') {
    const ids = [ctx.persona_id, ...ctx.full_team_ids];
    return { where: `AND ${alias} IN (${ids.map(() => '?').join(',')})`, params: ids };
  }
  if (ctx.rol === 'gerente') {
    const ids = [ctx.persona_id, ...ctx.team_ids];
    return { where: `AND ${alias} IN (${ids.map(() => '?').join(',')})`, params: ids };
  }
  return { where: `AND ${alias} = ?`, params: [ctx.persona_id] };
}

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

export function findCuentaId(nombre: string): string | null {
  const db = getDatabase();
  const row = db.prepare('SELECT id FROM cuenta WHERE nombre LIKE ?').get(`%${nombre}%`) as any;
  return row?.id ?? null;
}

export function personaIdFromName(nombre: string): string | null {
  const db = getDatabase();
  const row = db.prepare('SELECT id FROM persona WHERE nombre LIKE ?').get(`%${nombre}%`) as any;
  return row?.id ?? null;
}

export function getCurrentWeek(): number {
  const d = new Date();
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7);
}

export function getPersonaEmail(personaId: string): string | null {
  const db = getDatabase();
  const row = db.prepare('SELECT email FROM persona WHERE id = ?').get(personaId) as any;
  return row?.email ?? null;
}

/**
 * Compute a date cutoff string for use as a SQL parameter.
 * Replaces template-interpolated `datetime('now', '-N days')` patterns.
 */
export function dateCutoff(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 86400000).toISOString();
}
