/**
 * Proposal Draft Engine
 *
 * Converts commercial insights into agent-drafted proposals (borrador_agente).
 * Derives value from historical data, media mix from shared analysis modules,
 * and generates natural language reasoning.
 */

import { getDatabase } from "./db.js";
import { getAccountMediaMix } from "./analysis/media-mix.js";
import {
  getAccountPropHistory,
  getPeerMetrics,
} from "./analysis/peer-comparison.js";

export interface DraftResult {
  propuesta_id: string;
  titulo: string;
  valor_estimado: number | null;
  medios: string | null;
  tipo_oportunidad: string | null;
  gancho_temporal: string | null;
  fecha_vuelo_inicio: string | null;
  fecha_vuelo_fin: string | null;
  agente_razonamiento: string;
  confianza: number;
}

interface InsightData {
  id: string;
  tipo: string;
  cuenta_id: string;
  ae_id: string | null;
  titulo: string;
  descripcion: string;
  valor_potencial: number | null;
  confianza: number;
  datos_soporte: string | null;
  evento_id: string | null;
}

function genId(): string {
  return `prop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function deriveValue(
  db: ReturnType<typeof getDatabase>,
  cuentaId: string,
  insightValor: number | null,
  tipoOportunidad: string | null,
): { valor: number | null; reasoning: string } {
  if (insightValor && insightValor > 0) {
    return {
      valor: insightValor,
      reasoning: `Valor basado en estimacion del insight ($${(insightValor / 1e6).toFixed(1)}M)`,
    };
  }

  const histQuery = tipoOportunidad
    ? (db
        .prepare(
          `SELECT AVG(valor_estimado) as avg_val, COUNT(*) as c
           FROM propuesta WHERE cuenta_id = ? AND tipo_oportunidad = ? AND etapa = 'completada' AND valor_estimado > 0`,
        )
        .get(cuentaId, tipoOportunidad) as any)
    : null;

  if (histQuery?.avg_val && histQuery.c >= 1) {
    return {
      valor: Math.round(histQuery.avg_val),
      reasoning: `Valor basado en promedio historico de ${histQuery.c} propuesta(s) del mismo tipo ($${(histQuery.avg_val / 1e6).toFixed(1)}M)`,
    };
  }

  const overallAvg = db
    .prepare(
      `SELECT AVG(valor_estimado) as avg_val, COUNT(*) as c
       FROM propuesta WHERE cuenta_id = ? AND etapa = 'completada' AND valor_estimado > 0`,
    )
    .get(cuentaId) as any;

  if (overallAvg?.avg_val && overallAvg.c >= 1) {
    return {
      valor: Math.round(overallAvg.avg_val),
      reasoning: `Valor basado en promedio general de ${overallAvg.c} propuesta(s) de la cuenta ($${(overallAvg.avg_val / 1e6).toFixed(1)}M)`,
    };
  }

  return { valor: null, reasoning: "Sin datos historicos para estimar valor" };
}

function deriveMediaMix(
  db: ReturnType<typeof getDatabase>,
  cuentaId: string,
  vertical: string | null,
): { medios: string | null; reasoning: string } {
  const mix = getAccountMediaMix(db, cuentaId);

  if (mix.entries.length > 0 && mix.total_spend > 0) {
    const mixObj: Record<string, number> = {};
    for (const e of mix.entries) {
      if (e.medio !== "sin_desglose") mixObj[e.medio] = e.pct;
    }
    if (Object.keys(mixObj).length > 0) {
      return {
        medios: JSON.stringify(mixObj),
        reasoning: `Media mix basado en historial: ${mix.entries
          .filter((e) => e.medio !== "sin_desglose")
          .map((e) => `${e.medio} ${e.pct}%`)
          .join(", ")}`,
      };
    }
  }

  if (vertical) {
    const peers = getPeerMetrics(db, vertical, cuentaId);
    if (peers.tipos.length > 0) {
      return {
        medios: null,
        reasoning: `Sin historial de media mix. Peers de vertical ${vertical} tienen ${peers.tipos.length} tipos activos`,
      };
    }
  }

  return { medios: null, reasoning: "Sin datos de media mix disponibles" };
}

function getEventData(
  db: ReturnType<typeof getDatabase>,
  eventoId: string | null,
): {
  gancho: string | null;
  fechaInicio: string | null;
  fechaFin: string | null;
} {
  if (!eventoId) return { gancho: null, fechaInicio: null, fechaFin: null };
  const ev = db
    .prepare(
      "SELECT nombre, fecha_inicio, fecha_fin FROM crm_events WHERE id = ?",
    )
    .get(eventoId) as any;
  return ev
    ? {
        gancho: ev.nombre,
        fechaInicio: ev.fecha_inicio,
        fechaFin: ev.fecha_fin,
      }
    : { gancho: null, fechaInicio: null, fechaFin: null };
}

function buildReasoning(
  insight: InsightData,
  valueReasoning: string,
  mixReasoning: string,
  accountHistory: ReturnType<typeof getAccountPropHistory>,
): string {
  const parts: string[] = [];
  parts.push(`Insight: ${insight.descripcion}`);
  parts.push(`Valor: ${valueReasoning}`);
  parts.push(`Medios: ${mixReasoning}`);
  if (accountHistory.valor_total_ganado > 0) {
    parts.push(
      `Historial: ${accountHistory.tipos_comprados.size} tipos comprados, $${(accountHistory.valor_total_ganado / 1e6).toFixed(1)}M total ganado`,
    );
  }
  if (accountHistory.tipos_en_vuelo.size > 0) {
    parts.push(
      `En vuelo: ${Array.from(accountHistory.tipos_en_vuelo).join(", ")}`,
    );
  }
  return parts.join(". ");
}

export function draftProposalFromInsight(
  insightId: string,
): DraftResult | { error: string } {
  const db = getDatabase();

  const insight = db
    .prepare("SELECT * FROM insight_comercial WHERE id = ?")
    .get(insightId) as InsightData | undefined;
  if (!insight) return { error: `Insight "${insightId}" no encontrado.` };
  if (!insight.cuenta_id)
    return { error: "El insight no tiene cuenta asociada." };

  const cuenta = db
    .prepare("SELECT id, nombre, vertical, ae_id FROM cuenta WHERE id = ?")
    .get(insight.cuenta_id) as any;
  if (!cuenta) return { error: "Cuenta del insight no encontrada." };

  let tipoOportunidad: string | null = null;
  try {
    const soporte = JSON.parse(insight.datos_soporte ?? "{}");
    tipoOportunidad = soporte.tipo ?? soporte.tipo_oportunidad ?? null;
  } catch {
    /* ignore */
  }

  const { valor, reasoning: valueReasoning } = deriveValue(
    db,
    insight.cuenta_id,
    insight.valor_potencial,
    tipoOportunidad,
  );
  const { medios, reasoning: mixReasoning } = deriveMediaMix(
    db,
    insight.cuenta_id,
    cuenta.vertical,
  );
  const eventData = getEventData(db, insight.evento_id);
  const accountHistory = getAccountPropHistory(db, insight.cuenta_id);
  const razonamiento = buildReasoning(
    insight,
    valueReasoning,
    mixReasoning,
    accountHistory,
  );

  const titulo = eventData.gancho
    ? `${cuenta.nombre} — ${eventData.gancho}`
    : `${cuenta.nombre} — ${insight.titulo}`;

  const propId = genId();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO propuesta (id, cuenta_id, ae_id, titulo, valor_estimado, medios, tipo_oportunidad,
      gancho_temporal, fecha_vuelo_inicio, fecha_vuelo_fin, etapa, fecha_creacion, fecha_ultima_actividad,
      agente_razonamiento, confianza, insight_origen_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'borrador_agente', ?, ?, ?, ?, ?)`,
  ).run(
    propId,
    insight.cuenta_id,
    insight.ae_id ?? cuenta.ae_id,
    titulo,
    valor,
    medios,
    tipoOportunidad,
    eventData.gancho,
    eventData.fechaInicio,
    eventData.fechaFin,
    now,
    now,
    razonamiento,
    insight.confianza,
    insightId,
  );

  db.prepare(
    "UPDATE insight_comercial SET estado = 'convertido', propuesta_generada_id = ?, fecha_accion = ? WHERE id = ?",
  ).run(propId, now, insightId);

  return {
    propuesta_id: propId,
    titulo,
    valor_estimado: valor,
    medios,
    tipo_oportunidad: tipoOportunidad,
    gancho_temporal: eventData.gancho,
    fecha_vuelo_inicio: eventData.fechaInicio,
    fecha_vuelo_fin: eventData.fechaFin,
    agente_razonamiento: razonamiento,
    confianza: insight.confianza,
  };
}
