/**
 * Pattern Tools — Cross-agent intelligence interaction
 *
 * consultar_patrones   — View detected patterns (Gerente+)
 * desactivar_patron    — Dismiss a pattern (Director+)
 */

import { getDatabase } from "../db.js";
import type { ToolContext } from "./index.js";

const ROLE_RANK: Record<string, number> = {
  ae: 0,
  gerente: 1,
  director: 2,
  vp: 3,
};

export function consultar_patrones(
  args: Record<string, unknown>,
  ctx: ToolContext,
): string {
  const db = getDatabase();

  if (ctx.rol === "ae") {
    return JSON.stringify({
      error: "Solo gerentes, directores y VP pueden consultar patrones.",
    });
  }

  const callerRank = ROLE_RANK[ctx.rol] ?? 0;

  // Filter by nivel_minimo: only show patterns at or below caller's level
  const nivelFilter = Object.entries(ROLE_RANK)
    .filter(([, rank]) => rank <= callerRank)
    .map(([rol]) => `'${rol}'`)
    .join(",");

  let where = `WHERE activo = 1 AND nivel_minimo IN (${nivelFilter})`;
  const params: unknown[] = [];

  if (args.tipo) {
    where += " AND tipo = ?";
    params.push(args.tipo);
  }

  const rows = db
    .prepare(
      `SELECT id, tipo, descripcion, datos_json, sample_size, confianza,
              personas_afectadas, cuentas_afectadas, nivel_minimo,
              accion_recomendada, fecha_deteccion
       FROM patron_detectado
       ${where}
       ORDER BY confianza DESC, fecha_deteccion DESC
       LIMIT 20`,
    )
    .all(...params) as any[];

  if (rows.length === 0) {
    return JSON.stringify({ mensaje: "No hay patrones activos detectados." });
  }

  return JSON.stringify({
    total: rows.length,
    patrones: rows.map((r: any) => ({
      id: r.id,
      tipo: r.tipo,
      descripcion: r.descripcion,
      confianza: r.confianza,
      sample_size: r.sample_size,
      nivel: r.nivel_minimo,
      accion: r.accion_recomendada,
      fecha: r.fecha_deteccion,
      personas: r.personas_afectadas,
      cuentas: r.cuentas_afectadas,
    })),
  });
}

export function desactivar_patron(
  args: Record<string, unknown>,
  ctx: ToolContext,
): string {
  const db = getDatabase();
  const patronId = args.patron_id as string;

  if (!patronId) {
    return JSON.stringify({ error: "patron_id es requerido." });
  }

  if (ROLE_RANK[ctx.rol] < ROLE_RANK.director) {
    return JSON.stringify({
      error: "Solo directores y VP pueden desactivar patrones.",
    });
  }

  const patron = db
    .prepare(
      "SELECT id, descripcion, activo FROM patron_detectado WHERE id = ?",
    )
    .get(patronId) as any;

  if (!patron) {
    return JSON.stringify({ error: `No encontré patrón "${patronId}".` });
  }
  if (!patron.activo) {
    return JSON.stringify({ error: "Este patrón ya está desactivado." });
  }

  db.prepare("UPDATE patron_detectado SET activo = 0 WHERE id = ?").run(
    patronId,
  );

  return JSON.stringify({
    mensaje: `Patrón desactivado: "${patron.descripcion.slice(0, 80)}..."`,
    patron_id: patronId,
  });
}
