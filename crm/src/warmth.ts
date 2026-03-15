/**
 * Warmth Computation — executive relationship health scoring.
 *
 * Score = recency (0-40) + frequency (0-30) + quality (0-30) = 0-100.
 * Recency decays linearly over 90 days. Frequency is step-based.
 * Quality weights interaction type × quality rating.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InteractionRow {
  tipo: string;
  calidad: string;
  fecha: string;
}

export type WarmthLabel = "caliente" | "tibia" | "fria" | "congelada";

// ---------------------------------------------------------------------------
// Weights
// ---------------------------------------------------------------------------

const TYPE_WEIGHT: Record<string, number> = {
  comida: 3,
  evento: 3,
  reunion: 2,
  presentacion: 2,
  llamada: 1.5,
  regalo: 2.5,
  email: 1,
  otro: 1,
};

const QUALITY_WEIGHT: Record<string, number> = {
  excepcional: 4,
  buena: 3,
  normal: 2,
  superficial: 1,
};

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function recencyComponent(interactions: InteractionRow[]): number {
  if (interactions.length === 0) return 0;

  const now = Date.now();
  let minDays = Infinity;

  for (const i of interactions) {
    const days = (now - new Date(i.fecha).getTime()) / 86_400_000;
    if (days < minDays) minDays = days;
  }

  // Linear decay: 40 points at 0 days, 0 at 90+ days
  return Math.max(0, 40 * (1 - minDays / 90));
}

function frequencyComponent(interactions: InteractionRow[]): number {
  // Count interactions in last 90 days
  const cutoff = Date.now() - 90 * 86_400_000;
  const recent = interactions.filter(
    (i) => new Date(i.fecha).getTime() >= cutoff,
  ).length;

  if (recent === 0) return 0;
  if (recent === 1) return 5;
  if (recent <= 3) return 10;
  if (recent <= 6) return 20;
  return 30;
}

function qualityComponent(interactions: InteractionRow[]): number {
  // Weighted average of recent interactions (last 90 days)
  const cutoff = Date.now() - 90 * 86_400_000;
  const recent = interactions.filter(
    (i) => new Date(i.fecha).getTime() >= cutoff,
  );

  if (recent.length === 0) return 0;

  let totalWeight = 0;
  let weightedSum = 0;

  for (const i of recent) {
    const tw = TYPE_WEIGHT[i.tipo] ?? 1;
    const qw = QUALITY_WEIGHT[i.calidad] ?? 2;
    const combined = tw * qw;
    weightedSum += combined;
    totalWeight += 1;
  }

  // Max possible per interaction: 3 (comida) × 4 (excepcional) = 12
  // Normalize to 0-30 range
  const avg = weightedSum / totalWeight;
  return Math.min(30, (avg / 12) * 30);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Compute composite warmth score (0-100) from interaction history. */
export function computeWarmth(interactions: InteractionRow[]): number {
  if (interactions.length === 0) return 0;

  const score =
    recencyComponent(interactions) +
    frequencyComponent(interactions) +
    qualityComponent(interactions);

  return Math.round(Math.min(100, Math.max(0, score)) * 10) / 10;
}

/** Human-readable warmth label. */
export function warmthLabel(score: number): WarmthLabel {
  if (score >= 70) return "caliente";
  if (score >= 40) return "tibia";
  if (score >= 15) return "fria";
  return "congelada";
}
