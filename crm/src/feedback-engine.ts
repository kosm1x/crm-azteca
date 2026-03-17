/**
 * Feedback Engine — Draft-to-Final Delta Tracking
 *
 * Captures the difference between agent-drafted proposals and what the AE
 * actually sends. Over time, patterns in corrections teach the agent what
 * it consistently gets wrong.
 *
 * Three levels:
 *   1. Delta capture — snapshot original draft, compare to final when promoted
 *   2. Learning generation — after 5+ corrections with same pattern, write to Hindsight
 *   3. Engagement monitoring — zero-delta rate, dismissal rate per AE
 */

import { getDatabase } from "./db.js";
import { logger } from "./logger.js";

function genId(): string {
  return `fb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// Level 1: Delta Capture
// ---------------------------------------------------------------------------

/**
 * Capture the delta between a borrador_agente draft and its final state.
 * Called when modificar_borrador promotes with aceptar=true, or when
 * a borrador_agente is dismissed.
 */
export function captureFeedback(
  propuestaId: string,
  aeId: string,
  resultado: "aceptado_sin_cambios" | "aceptado_con_cambios" | "descartado",
  originalSnapshot: {
    titulo: string;
    valor_estimado: number | null;
    medios: string | null;
    agente_razonamiento: string | null;
    insight_origen_id: string | null;
    fecha_creacion: string | null;
  },
  finalState?: {
    titulo: string;
    valor_estimado: number | null;
    medios: string | null;
  },
): void {
  const db = getDatabase();

  const deltaValor =
    finalState &&
    originalSnapshot.valor_estimado != null &&
    finalState.valor_estimado != null
      ? finalState.valor_estimado - originalSnapshot.valor_estimado
      : null;

  // Generate delta description
  const deltas: string[] = [];
  if (finalState) {
    if (finalState.titulo !== originalSnapshot.titulo) {
      deltas.push(
        `titulo: "${originalSnapshot.titulo}" → "${finalState.titulo}"`,
      );
    }
    if (deltaValor && deltaValor !== 0) {
      const dir = deltaValor > 0 ? "+" : "";
      deltas.push(`valor: ${dir}$${(deltaValor / 1e6).toFixed(1)}M`);
    }
    if (finalState.medios !== originalSnapshot.medios) {
      deltas.push("medios: modificado");
    }
  }

  const deltaDescripcion = deltas.length > 0 ? deltas.join(", ") : null;

  db.prepare(
    `INSERT INTO feedback_propuesta (id, propuesta_id, insight_id, ae_id,
      borrador_titulo, borrador_valor, borrador_medios, borrador_razonamiento,
      final_titulo, final_valor, final_medios,
      delta_valor, delta_descripcion, resultado, fecha_borrador)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    genId(),
    propuestaId,
    originalSnapshot.insight_origen_id,
    aeId,
    originalSnapshot.titulo,
    originalSnapshot.valor_estimado,
    originalSnapshot.medios,
    originalSnapshot.agente_razonamiento,
    finalState?.titulo ?? null,
    finalState?.valor_estimado ?? null,
    finalState?.medios ?? null,
    deltaValor,
    deltaDescripcion,
    resultado,
    originalSnapshot.fecha_creacion,
  );

  logger.info(
    { propuestaId, aeId, resultado, deltaDescripcion },
    "Feedback captured",
  );
}

// ---------------------------------------------------------------------------
// Level 3: Engagement Monitoring
// ---------------------------------------------------------------------------

export interface EngagementMetrics {
  ae_id: string;
  ae_nombre: string;
  total: number;
  aceptado_sin_cambios: number;
  aceptado_con_cambios: number;
  descartado: number;
  zero_delta_rate: number; // 0-100
  healthy_rate: number; // 0-100
  dismissal_rate: number; // 0-100
}

/**
 * Compute engagement metrics per AE for the last N days.
 */
export function getEngagementMetrics(days = 30): EngagementMetrics[] {
  const db = getDatabase();
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();

  const rows = db
    .prepare(
      `SELECT f.ae_id, p.nombre AS ae_nombre,
              COUNT(*) AS total,
              SUM(CASE WHEN f.resultado = 'aceptado_sin_cambios' THEN 1 ELSE 0 END) AS sin_cambios,
              SUM(CASE WHEN f.resultado = 'aceptado_con_cambios' THEN 1 ELSE 0 END) AS con_cambios,
              SUM(CASE WHEN f.resultado = 'descartado' THEN 1 ELSE 0 END) AS descartado
       FROM feedback_propuesta f
       LEFT JOIN persona p ON f.ae_id = p.id
       WHERE f.fecha_accion >= ?
       GROUP BY f.ae_id`,
    )
    .all(cutoff) as any[];

  return rows.map((r) => {
    const total = r.total || 1; // avoid division by zero
    return {
      ae_id: r.ae_id,
      ae_nombre: r.ae_nombre,
      total: r.total,
      aceptado_sin_cambios: r.sin_cambios,
      aceptado_con_cambios: r.con_cambios,
      descartado: r.descartado,
      zero_delta_rate: Math.round((r.sin_cambios / total) * 100),
      healthy_rate: Math.round((r.con_cambios / total) * 100),
      dismissal_rate: Math.round((r.descartado / total) * 100),
    };
  });
}

/**
 * Get aggregate feedback stats for a team (used in briefing).
 */
export function getTeamFeedbackStats(
  teamAeIds: string[],
  days = 30,
): {
  total: number;
  sin_cambios: number;
  con_cambios: number;
  descartados: number;
  tasa_engagement: string;
  alertas: string[];
} {
  if (teamAeIds.length === 0) {
    return {
      total: 0,
      sin_cambios: 0,
      con_cambios: 0,
      descartados: 0,
      tasa_engagement: "sin datos",
      alertas: [],
    };
  }

  const db = getDatabase();
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const ph = teamAeIds.map(() => "?").join(",");

  const stats = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN resultado = 'aceptado_sin_cambios' THEN 1 ELSE 0 END) AS sin_cambios,
         SUM(CASE WHEN resultado = 'aceptado_con_cambios' THEN 1 ELSE 0 END) AS con_cambios,
         SUM(CASE WHEN resultado = 'descartado' THEN 1 ELSE 0 END) AS descartados
       FROM feedback_propuesta
       WHERE ae_id IN (${ph}) AND fecha_accion >= ?`,
    )
    .get(...teamAeIds, cutoff) as any;

  const total = stats?.total || 0;
  const acted = (stats?.con_cambios || 0) + (stats?.sin_cambios || 0);
  const healthyRate =
    acted > 0 ? Math.round(((stats?.con_cambios || 0) / acted) * 100) : 0;

  // Alerts
  const alertas: string[] = [];
  const metrics = getEngagementMetrics(days);
  for (const m of metrics) {
    if (!teamAeIds.includes(m.ae_id)) continue;
    if (m.total >= 3 && m.zero_delta_rate > 80) {
      alertas.push(
        `${m.ae_nombre}: ${m.zero_delta_rate}% sin cambios — posible rubber-stamping`,
      );
    }
    if (m.total >= 3 && m.dismissal_rate > 60) {
      alertas.push(
        `${m.ae_nombre}: ${m.dismissal_rate}% descartados — borradores no utiles`,
      );
    }
  }

  return {
    total,
    sin_cambios: stats?.sin_cambios || 0,
    con_cambios: stats?.con_cambios || 0,
    descartados: stats?.descartados || 0,
    tasa_engagement: total > 0 ? `${healthyRate}%` : "sin datos",
    alertas,
  };
}
