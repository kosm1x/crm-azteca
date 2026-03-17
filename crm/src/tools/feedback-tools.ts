/**
 * Feedback Tools — Manager+ access to draft performance metrics
 *
 * consultar_feedback           — Draft performance per AE (Gerente+)
 * generar_reporte_aprendizaje  — Quarterly learning report (Director+)
 */

import { getDatabase } from "../db.js";
import type { ToolContext } from "./index.js";
import {
  getEngagementMetrics,
  getTeamFeedbackStats,
} from "../feedback-engine.js";

const ROLE_RANK: Record<string, number> = {
  ae: 0,
  gerente: 1,
  director: 2,
  vp: 3,
};

export function consultar_feedback(
  args: Record<string, unknown>,
  ctx: ToolContext,
): string {
  if (ROLE_RANK[ctx.rol] < ROLE_RANK.gerente) {
    return JSON.stringify({
      error: "Solo gerentes, directores y VP pueden consultar feedback.",
    });
  }

  const dias = (args.dias as number) || 30;
  const teamIds = ctx.rol === "vp" ? [] : [ctx.persona_id, ...ctx.team_ids];

  // For VP, get all metrics; for others, filter by team
  const metrics = getEngagementMetrics(dias);
  const filtered =
    ctx.rol === "vp"
      ? metrics
      : metrics.filter((m) => teamIds.includes(m.ae_id));

  if (filtered.length === 0) {
    return JSON.stringify({
      mensaje: "No hay datos de feedback en el periodo.",
    });
  }

  const totalDrafts = filtered.reduce((s, m) => s + m.total, 0);
  const totalHealthy = filtered.reduce((s, m) => s + m.aceptado_con_cambios, 0);
  const totalZero = filtered.reduce((s, m) => s + m.aceptado_sin_cambios, 0);
  const totalDismissed = filtered.reduce((s, m) => s + m.descartado, 0);

  return JSON.stringify({
    periodo_dias: dias,
    total_borradores: totalDrafts,
    aceptados_con_cambios: totalHealthy,
    aceptados_sin_cambios: totalZero,
    descartados: totalDismissed,
    por_ejecutivo: filtered.map((m) => ({
      ejecutivo: m.ae_nombre,
      total: m.total,
      engagement_sano: `${m.healthy_rate}%`,
      sin_cambios: `${m.zero_delta_rate}%`,
      descartados: `${m.dismissal_rate}%`,
    })),
  });
}

export function generar_reporte_aprendizaje(
  _args: Record<string, unknown>,
  ctx: ToolContext,
): string {
  if (ROLE_RANK[ctx.rol] < ROLE_RANK.director) {
    return JSON.stringify({
      error: "Solo directores y VP pueden generar reportes de aprendizaje.",
    });
  }

  const db = getDatabase();

  // Top correction patterns (most common delta descriptions)
  const patterns = db
    .prepare(
      `SELECT delta_descripcion, COUNT(*) as c
       FROM feedback_propuesta
       WHERE resultado = 'aceptado_con_cambios' AND delta_descripcion IS NOT NULL
       GROUP BY delta_descripcion
       ORDER BY c DESC LIMIT 10`,
    )
    .all() as any[];

  // Average delta_valor
  const valorStats = db
    .prepare(
      `SELECT AVG(delta_valor) as avg_delta, COUNT(*) as c
       FROM feedback_propuesta
       WHERE resultado = 'aceptado_con_cambios' AND delta_valor IS NOT NULL`,
    )
    .get() as any;

  // Top dismiss reasons
  const dismissStats = db
    .prepare(
      `SELECT COUNT(*) as total_descartados,
              COUNT(DISTINCT ae_id) as aes_que_descartan
       FROM feedback_propuesta
       WHERE resultado = 'descartado'`,
    )
    .get() as any;

  // Trend: are deltas decreasing over time? (split into 2 halves)
  const allFeedback = db
    .prepare(
      `SELECT delta_valor, fecha_accion FROM feedback_propuesta
       WHERE resultado = 'aceptado_con_cambios' AND delta_valor IS NOT NULL
       ORDER BY fecha_accion`,
    )
    .all() as any[];

  let trend = "sin datos";
  if (allFeedback.length >= 6) {
    const mid = Math.floor(allFeedback.length / 2);
    const firstHalfAvg =
      allFeedback
        .slice(0, mid)
        .reduce((s: number, r: any) => s + Math.abs(r.delta_valor), 0) / mid;
    const secondHalfAvg =
      allFeedback
        .slice(mid)
        .reduce((s: number, r: any) => s + Math.abs(r.delta_valor), 0) /
      (allFeedback.length - mid);
    trend =
      secondHalfAvg < firstHalfAvg
        ? "mejorando (deltas decrecientes)"
        : "estable o empeorando";
  }

  return JSON.stringify({
    reporte: "Aprendizaje del sistema de borradores",
    total_feedback: allFeedback.length + (dismissStats?.total_descartados || 0),
    patrones_de_correccion: patterns.map((p: any) => ({
      cambio: p.delta_descripcion,
      frecuencia: p.c,
    })),
    delta_valor_promedio: valorStats?.avg_delta
      ? `$${(valorStats.avg_delta / 1e6).toFixed(1)}M`
      : "sin datos",
    descartados: {
      total: dismissStats?.total_descartados || 0,
      ejecutivos_que_descartan: dismissStats?.aes_que_descartan || 0,
    },
    tendencia: trend,
  });
}
