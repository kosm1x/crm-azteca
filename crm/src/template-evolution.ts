/**
 * Template evolution — closes the scoring loop for persona templates.
 *
 * Tracks template variants as candidates, evaluates them against the active
 * version using template_score data, and generates promotion recommendations
 * when a candidate consistently outperforms.
 *
 * Adapted from HyperAgents (Meta FAIR) evolutionary archive pattern.
 */

import type Database from "better-sqlite3";
import { getDatabase } from "../../engine/src/db.js";
import { logger } from "./logger.js";

function genId(): string {
  return `tvar-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// Variant registration
// ---------------------------------------------------------------------------

export function registerVariant(
  rol: string,
  versionTag: string,
  parentVersion: string | null,
  diffDescription: string,
  diffPatch?: string,
): void {
  const db = getDatabase();
  db.prepare(
    `INSERT INTO template_variant
       (id, rol, version_tag, parent_version, diff_description, diff_patch)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    genId(),
    rol,
    versionTag,
    parentVersion,
    diffDescription,
    diffPatch ?? null,
  );
}

// ---------------------------------------------------------------------------
// Score summary
// ---------------------------------------------------------------------------

export interface VariantScoreSummary {
  id: string;
  version_tag: string;
  positive_rate: number;
  sample_size: number;
  status: string;
}

export function getVariantScoreSummary(rol: string): VariantScoreSummary[] {
  const db = getDatabase();

  // Get all variants for this role
  const variants = db
    .prepare(
      `SELECT id, version_tag, status FROM template_variant WHERE rol = ?`,
    )
    .all(rol) as Array<{ id: string; version_tag: string; status: string }>;

  return variants.map((v) => {
    const scores = db
      .prepare(
        `SELECT
           SUM(CASE WHEN outcome_type IN ('actividad_positiva','propuesta_avanzada','feedback_aceptado') THEN sample_size ELSE 0 END) AS positive,
           SUM(CASE WHEN outcome_type IN ('actividad_negativa','propuesta_perdida','feedback_descartado') THEN sample_size ELSE 0 END) AS negative,
           SUM(sample_size) AS total
         FROM template_score
         WHERE template_version = ? AND rol = ? AND fecha >= datetime('now', '-30 days')`,
      )
      .get(v.version_tag, rol) as {
      positive: number | null;
      negative: number | null;
      total: number | null;
    };

    const total = (scores.positive ?? 0) + (scores.negative ?? 0);
    return {
      id: v.id,
      version_tag: v.version_tag,
      positive_rate: total > 0 ? (scores.positive ?? 0) / total : 0,
      sample_size: scores.total ?? 0,
      status: v.status,
    };
  });
}

// ---------------------------------------------------------------------------
// Promotion evaluation (called from overnight engine)
// ---------------------------------------------------------------------------

const MIN_SAMPLE_SIZE = 10;
const PROMOTE_THRESHOLD_PP = 0.05; // 5 percentage points better
const REJECT_THRESHOLD_PP = 0.1; // 10 percentage points worse

export function evaluateVariantPromotion(
  db: Database.Database,
  lote: string,
): number {
  let generated = 0;

  const roles = ["ae", "gerente", "director", "vp"];

  for (const rol of roles) {
    // Get active variant for this role
    const active = db
      .prepare(
        `SELECT id, version_tag FROM template_variant
         WHERE rol = ? AND status = 'active' LIMIT 1`,
      )
      .get(rol) as { id: string; version_tag: string } | undefined;

    // Get candidate variants
    const candidates = db
      .prepare(
        `SELECT id, version_tag FROM template_variant
         WHERE rol = ? AND status = 'candidate'`,
      )
      .all(rol) as Array<{ id: string; version_tag: string }>;

    if (candidates.length === 0) continue;

    // Get active's score (if exists)
    const activeRate = active
      ? getPositiveRate(db, active.version_tag, rol)
      : null;

    for (const candidate of candidates) {
      const candidateStats = getScoreStats(db, candidate.version_tag, rol);

      // Skip if insufficient samples
      if (candidateStats.total < MIN_SAMPLE_SIZE) continue;

      const candidateRate = candidateStats.positiveRate;

      // Compare against active
      if (activeRate !== null) {
        const delta = candidateRate - activeRate;

        if (delta >= PROMOTE_THRESHOLD_PP) {
          // Candidate beats active — generate promotion recommendation
          const pctDelta = Math.round(delta * 100);
          db.prepare(
            `INSERT INTO insight_comercial
               (id, tipo, titulo, descripcion, accion_recomendada, confianza, sample_size, fecha_generacion, fecha_expiracion, lote_nocturno)
             VALUES (?, 'recomendacion', ?, ?, ?, ?, ?, datetime('now'), datetime('now', '+14 days'), ?)`,
          ).run(
            `ins-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            `Promover plantilla ${rol}: ${candidate.version_tag}`,
            `La variante ${candidate.version_tag} del rol ${rol} supera a la activa (${active!.version_tag}) por +${pctDelta}pp en tasa positiva (${Math.round(candidateRate * 100)}% vs ${Math.round(activeRate * 100)}%) con ${candidateStats.total} actividades evaluadas.`,
            `Revisar cambios de la variante y promoverla a activa si los resultados son consistentes.`,
            Math.min(0.9, 0.5 + candidateStats.total * 0.01), // confidence grows with sample size
            candidateStats.total,
            lote,
          );
          generated++;
          logger.info(
            `[template-evolution] ${rol}: candidate ${candidate.version_tag} beats active by +${pctDelta}pp`,
          );
        } else if (delta <= -REJECT_THRESHOLD_PP) {
          // Candidate is significantly worse — mark rejected
          db.prepare(
            `UPDATE template_variant SET status = 'rejected', retired_at = datetime('now')
             WHERE id = ?`,
          ).run(candidate.id);
          logger.info(
            `[template-evolution] ${rol}: rejected ${candidate.version_tag} (${Math.round(delta * 100)}pp worse)`,
          );
        }
      } else {
        // No active variant — first candidate with enough samples becomes recommendation
        db.prepare(
          `INSERT INTO insight_comercial
             (id, tipo, titulo, descripcion, accion_recomendada, confianza, sample_size, fecha_generacion, fecha_expiracion, lote_nocturno)
           VALUES (?, 'recomendacion', ?, ?, ?, ?, ?, datetime('now'), datetime('now', '+14 days'), ?)`,
        ).run(
          `ins-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          `Activar plantilla ${rol}: ${candidate.version_tag}`,
          `No hay plantilla activa para el rol ${rol}. La variante ${candidate.version_tag} tiene una tasa positiva del ${Math.round(candidateRate * 100)}% con ${candidateStats.total} actividades evaluadas.`,
          `Revisar y activar como plantilla base para este rol.`,
          0.6,
          candidateStats.total,
          lote,
        );
        generated++;
      }
    }
  }

  return generated;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getPositiveRate(
  db: Database.Database,
  versionTag: string,
  rol: string,
): number {
  const stats = getScoreStats(db, versionTag, rol);
  return stats.total >= MIN_SAMPLE_SIZE ? stats.positiveRate : 0;
}

function getScoreStats(
  db: Database.Database,
  versionTag: string,
  rol: string,
): { positiveRate: number; total: number } {
  const row = db
    .prepare(
      `SELECT
         SUM(CASE WHEN outcome_type IN ('actividad_positiva','propuesta_avanzada','feedback_aceptado') THEN sample_size ELSE 0 END) AS positive,
         SUM(CASE WHEN outcome_type IN ('actividad_negativa','propuesta_perdida','feedback_descartado') THEN sample_size ELSE 0 END) AS negative
       FROM template_score
       WHERE template_version = ? AND rol = ? AND fecha >= datetime('now', '-30 days')`,
    )
    .get(versionTag, rol) as {
    positive: number | null;
    negative: number | null;
  };

  const total = (row.positive ?? 0) + (row.negative ?? 0);
  return {
    positiveRate: total > 0 ? (row.positive ?? 0) / total : 0,
    total,
  };
}
