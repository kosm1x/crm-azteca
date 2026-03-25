/**
 * Template A/B selector — Thompson Sampling over template_score data.
 *
 * Given a role, selects which template variant to serve based on observed
 * positive/negative outcomes. Uses Beta distribution sampling to balance
 * exploration (trying new variants) vs exploitation (using the best).
 *
 * Zero external deps — just Math.random() + Jorgensen beta approximation.
 *
 * Not wired into container startup yet (would need engine hook modification).
 * Prepared for future per-container template injection.
 */

import { getDatabase } from "../../engine/src/db.js";

export interface TemplateSelection {
  version: string;
  isExperimental: boolean;
}

const MIN_SAMPLES_FOR_SAMPLING = 5;

/**
 * Select the template variant to use for a given role.
 *
 * Uses Thompson Sampling:
 * 1. Query positive/negative counts per variant from template_score
 * 2. Sample from Beta(positive + 1, negative + 1) for each
 * 3. Return the variant with the highest sample
 */
export function selectTemplateForRole(rol: string): TemplateSelection {
  const db = getDatabase();

  // Get active + candidate variants
  const variants = db
    .prepare(
      `SELECT id, version_tag, status FROM template_variant
       WHERE rol = ? AND status IN ('active', 'candidate')`,
    )
    .all(rol) as Array<{
    id: string;
    version_tag: string;
    status: string;
  }>;

  if (variants.length === 0) {
    // No variants registered — fall back to current template
    return { version: "default", isExperimental: false };
  }

  if (variants.length === 1) {
    return {
      version: variants[0].version_tag,
      isExperimental: variants[0].status === "candidate",
    };
  }

  // Gather scores for each variant
  const scored = variants.map((v) => {
    const row = db
      .prepare(
        `SELECT
           SUM(CASE WHEN outcome_type IN ('actividad_positiva','propuesta_avanzada','feedback_aceptado') THEN sample_size ELSE 0 END) AS positive,
           SUM(CASE WHEN outcome_type IN ('actividad_negativa','propuesta_perdida','feedback_descartado') THEN sample_size ELSE 0 END) AS negative
         FROM template_score
         WHERE template_version = ? AND rol = ? AND fecha >= datetime('now', '-30 days')`,
      )
      .get(v.version_tag, rol) as {
      positive: number | null;
      negative: number | null;
    };

    const positive = row.positive ?? 0;
    const negative = row.negative ?? 0;
    const total = positive + negative;

    return {
      ...v,
      positive,
      negative,
      total,
    };
  });

  // If any variant has fewer than MIN_SAMPLES, use uniform random (pure exploration)
  const allAboveMin = scored.every((s) => s.total >= MIN_SAMPLES_FOR_SAMPLING);
  if (!allAboveMin) {
    const pick = scored[Math.floor(Math.random() * scored.length)];
    return {
      version: pick.version_tag,
      isExperimental: pick.status === "candidate",
    };
  }

  // Thompson Sampling: sample from Beta(positive+1, negative+1) for each
  let bestSample = -1;
  let bestVariant = scored[0];

  for (const s of scored) {
    const sample = sampleBeta(s.positive + 1, s.negative + 1);
    if (sample > bestSample) {
      bestSample = sample;
      bestVariant = s;
    }
  }

  return {
    version: bestVariant.version_tag,
    isExperimental: bestVariant.status === "candidate",
  };
}

/**
 * Sample from Beta(alpha, beta) distribution.
 * Uses the Jorgensen (1982) approximation via Gamma sampling.
 * For alpha, beta >= 1 (our case: always +1 prior), this is accurate enough.
 */
function sampleBeta(alpha: number, beta: number): number {
  const x = sampleGamma(alpha);
  const y = sampleGamma(beta);
  return x / (x + y);
}

/**
 * Sample from Gamma(shape, 1) using Marsaglia & Tsang's method.
 * Works for shape >= 1. For shape < 1 (not our case), would need adjustment.
 */
function sampleGamma(shape: number): number {
  if (shape < 1) {
    // Ahrens-Dieter: Gamma(a) = Gamma(a+1) * U^(1/a)
    return sampleGamma(shape + 1) * Math.pow(Math.random(), 1 / shape);
  }

  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  for (;;) {
    let x: number;
    let v: number;

    do {
      x = randn();
      v = 1 + c * x;
    } while (v <= 0);

    v = v * v * v;
    const u = Math.random();

    if (u < 1 - 0.0331 * (x * x) * (x * x)) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/** Standard normal sample via Box-Muller. */
function randn(): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
