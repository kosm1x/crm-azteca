/**
 * Package Builder — Creative Package Composition
 *
 * Composes optimized multi-media advertising packages for accounts/events
 * using historical mix, peer benchmarks, inventory availability, and rate cards.
 */

import type Database from "better-sqlite3";
import { getAccountMediaMix } from "./analysis/media-mix.js";
import { comparePeers } from "./analysis/peer-comparison.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PackageOptions {
  presupuesto_objetivo?: number;
  evento_nombre?: string;
  medios_excluir?: string[];
}

export interface PackageItem {
  medio: string;
  porcentaje: number;
  monto: number;
  razon: string;
}

export interface PackageConfig {
  presupuesto_total: number;
  items: PackageItem[];
}

export interface PackageResult {
  cuenta: string;
  vertical: string;
  paquete_principal: PackageConfig;
  alternativa_menor?: PackageConfig;
  alternativa_mayor?: PackageConfig;
  razonamiento: string;
}

export interface EventInventoryDetail {
  medio: string;
  total: number;
  vendido: number;
  disponible: number;
  disponible_pct: number;
}

export interface EventInventory {
  evento: {
    nombre: string;
    tipo: string;
    fecha_inicio: string;
    fecha_fin: string;
    prioridad: number;
    meta_ingresos: number;
    ingresos_actual: number;
  };
  inventario: EventInventoryDetail[];
}

export interface ComparisonRow {
  medio: string;
  paquetes: Array<{
    label: string;
    porcentaje: number;
    monto: number;
  }>;
  max_diff_pct: number;
}

export interface ComparisonResult {
  medios: ComparisonRow[];
  totales: Array<{ label: string; presupuesto_total: number }>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALL_MEDIOS = ["tv_abierta", "ctv", "radio", "digital"];
const DEFAULT_EQUAL_PCT = 25; // equal split when no history

// ---------------------------------------------------------------------------
// buildPackage
// ---------------------------------------------------------------------------

export function buildPackage(
  db: Database.Database,
  cuentaId: string,
  options: PackageOptions = {},
): PackageResult {
  // 1. Look up account
  const cuenta = db
    .prepare("SELECT id, nombre, vertical FROM cuenta WHERE id = ?")
    .get(cuentaId) as any;
  if (!cuenta) {
    throw new Error(`Cuenta no encontrada: ${cuentaId}`);
  }

  // 2. Historical media mix
  const mediaMix = getAccountMediaMix(db, cuentaId);

  // 3. Peer benchmark
  const peers = comparePeers(db, cuentaId, cuenta.vertical);

  // 4. Determine budget
  const budget =
    options.presupuesto_objetivo ??
    (mediaMix.total_spend > 0
      ? Math.round(mediaMix.total_spend / Math.max(mediaMix.entries.length, 1))
      : (peers.peer_avg_total_value ?? 1_000_000));

  // 5. Event inventory (optional)
  let eventInventory: EventInventory | null = null;
  if (options.evento_nombre) {
    eventInventory = getEventInventoryDetails(db, options.evento_nombre);
  }

  // 6. Rate card minimums
  const rateCard = getRateCard(db);

  // 7. Compose primary mix
  const excludeSet = new Set(options.medios_excluir ?? []);
  const activeMedios = ALL_MEDIOS.filter((m) => !excludeSet.has(m));

  const mix = composeMix(
    activeMedios,
    mediaMix,
    peers,
    eventInventory,
    rateCard,
    budget,
  );

  const paquetePrincipal = buildConfig(mix, budget);

  // 8. Generate alternatives at ±20%
  const budgetMenor = Math.round(budget * 0.8);
  const budgetMayor = Math.round(budget * 1.2);

  const alternativaMenor = buildConfig(mix, budgetMenor);
  const alternativaMayor = buildConfig(mix, budgetMayor);

  // 9. Build reasoning
  const razonamiento = buildReasoning(
    mediaMix,
    peers,
    eventInventory,
    excludeSet,
    budget,
  );

  return {
    cuenta: cuenta.nombre,
    vertical: cuenta.vertical || "sin_vertical",
    paquete_principal: paquetePrincipal,
    alternativa_menor: alternativaMenor,
    alternativa_mayor: alternativaMayor,
    razonamiento,
  };
}

// ---------------------------------------------------------------------------
// getEventInventoryDetails
// ---------------------------------------------------------------------------

export function getEventInventoryDetails(
  db: Database.Database,
  eventoNombre: string,
): EventInventory | null {
  const evento = db
    .prepare("SELECT * FROM crm_events WHERE nombre LIKE ?")
    .get(`%${eventoNombre}%`) as any;

  if (!evento) return null;

  const inventario: EventInventoryDetail[] = [];

  try {
    const total = evento.inventario_total
      ? JSON.parse(evento.inventario_total)
      : {};
    const vendido = evento.inventario_vendido
      ? JSON.parse(evento.inventario_vendido)
      : {};

    for (const medio of Object.keys(total)) {
      const t = Number(total[medio]) || 0;
      const v = Number(vendido[medio]) || 0;
      inventario.push({
        medio,
        total: t,
        vendido: v,
        disponible: t - v,
        disponible_pct: t > 0 ? Math.round((1 - v / t) * 100) : 100,
      });
    }
  } catch {
    return null;
  }

  return {
    evento: {
      nombre: evento.nombre,
      tipo: evento.tipo,
      fecha_inicio: evento.fecha_inicio,
      fecha_fin: evento.fecha_fin,
      prioridad: evento.prioridad ?? 0,
      meta_ingresos: evento.meta_ingresos ?? 0,
      ingresos_actual: evento.ingresos_actual ?? 0,
    },
    inventario,
  };
}

// ---------------------------------------------------------------------------
// comparePackages
// ---------------------------------------------------------------------------

export function comparePackages(
  configs: Array<{ label: string; config: PackageConfig }>,
): ComparisonResult {
  // Collect all unique medios across packages
  const allMedios = new Set<string>();
  for (const { config } of configs) {
    for (const item of config.items) {
      allMedios.add(item.medio);
    }
  }

  const medios: ComparisonRow[] = [];

  for (const medio of allMedios) {
    const paquetes = configs.map(({ label, config }) => {
      const item = config.items.find((i) => i.medio === medio);
      return {
        label,
        porcentaje: item?.porcentaje ?? 0,
        monto: item?.monto ?? 0,
      };
    });

    const pcts = paquetes.map((p) => p.porcentaje);
    const maxDiff = pcts.length > 1 ? Math.max(...pcts) - Math.min(...pcts) : 0;

    medios.push({
      medio,
      paquetes,
      max_diff_pct: maxDiff,
    });
  }

  // Sort by largest difference first
  medios.sort((a, b) => b.max_diff_pct - a.max_diff_pct);

  const totales = configs.map(({ label, config }) => ({
    label,
    presupuesto_total: config.presupuesto_total,
  }));

  return { medios, totales };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface RateCardEntry {
  medio: string;
  precio_referencia: number;
  precio_piso: number;
}

function getRateCard(db: Database.Database): RateCardEntry[] {
  return db
    .prepare(
      `SELECT medio, AVG(precio_referencia) as precio_referencia, AVG(precio_piso) as precio_piso
       FROM inventario
       WHERE precio_referencia IS NOT NULL
       GROUP BY medio`,
    )
    .all() as RateCardEntry[];
}

interface MedioPct {
  medio: string;
  pct: number;
}

function composeMix(
  activeMedios: string[],
  mediaMix: ReturnType<typeof getAccountMediaMix>,
  peers: ReturnType<typeof comparePeers>,
  eventInventory: EventInventory | null,
  _rateCard: RateCardEntry[],
  _budget: number,
): MedioPct[] {
  if (activeMedios.length === 0) return [];

  // Start with historical mix or equal split
  const pctMap: Record<string, number> = {};

  if (mediaMix.entries.length > 0) {
    // Use historical mix as template, filtered to active medios
    for (const entry of mediaMix.entries) {
      if (activeMedios.includes(entry.medio)) {
        pctMap[entry.medio] = entry.pct;
      }
    }
    // Add missing active medios with 0%
    for (const m of activeMedios) {
      if (!(m in pctMap)) pctMap[m] = 0;
    }
  } else {
    // No history: equal split
    const equalPct = Math.floor(100 / activeMedios.length);
    for (const m of activeMedios) {
      pctMap[m] = equalPct;
    }
  }

  // Adjust for peer gaps — if account has 0% in a medio and peers avg >15%, add some
  if (peers.peer_tipos.length > 0) {
    // Check peer media mix indirectly through tipo_gaps
    // If peers have types this account doesn't, suggest diversifying
    for (const m of activeMedios) {
      if ((pctMap[m] ?? 0) === 0 && mediaMix.entries.length > 0) {
        // Account has history but doesn't use this medio — add 15% baseline
        pctMap[m] = 15;
      }
    }
  }

  // Adjust for event inventory scarcity
  if (eventInventory) {
    for (const inv of eventInventory.inventario) {
      if (inv.medio in pctMap && inv.disponible_pct < 15) {
        // Very scarce (<15% available) — reduce allocation
        const current = pctMap[inv.medio] ?? 0;
        pctMap[inv.medio] = Math.max(Math.round(current * 0.3), 0);

        // Redistribute to CTV if TV is scarce
        if (inv.medio === "tv_abierta" && "ctv" in pctMap) {
          pctMap["ctv"] = (pctMap["ctv"] ?? 0) + Math.round(current * 0.5);
        }
      }
    }
  }

  // Normalize to 100%
  const totalPct = Object.values(pctMap).reduce((s, v) => s + v, 0);
  if (totalPct > 0 && totalPct !== 100) {
    const scale = 100 / totalPct;
    for (const m of Object.keys(pctMap)) {
      pctMap[m] = Math.round(pctMap[m] * scale);
    }
  }

  // Fix rounding — adjust largest to make sum exactly 100
  const entries = Object.entries(pctMap)
    .filter(([, p]) => p > 0)
    .sort((a, b) => b[1] - a[1]);

  const currentSum = entries.reduce((s, [, p]) => s + p, 0);
  if (entries.length > 0 && currentSum !== 100) {
    entries[0][1] += 100 - currentSum;
  }

  return entries.map(([medio, pct]) => ({ medio, pct }));
}

function buildConfig(mix: MedioPct[], budget: number): PackageConfig {
  const items: PackageItem[] = mix.map(({ medio, pct }) => ({
    medio,
    porcentaje: pct,
    monto: Math.round((pct / 100) * budget),
    razon: getDefaultReason(medio),
  }));

  return {
    presupuesto_total: budget,
    items,
  };
}

function getDefaultReason(medio: string): string {
  switch (medio) {
    case "tv_abierta":
      return "Alcance masivo y posicionamiento de marca";
    case "ctv":
      return "Audiencia digital con experiencia premium";
    case "radio":
      return "Frecuencia y cobertura local";
    case "digital":
      return "Segmentacion precisa y medicion directa";
    default:
      return "Complemento de mix";
  }
}

function buildReasoning(
  mediaMix: ReturnType<typeof getAccountMediaMix>,
  peers: ReturnType<typeof comparePeers>,
  eventInventory: EventInventory | null,
  excludeSet: Set<string>,
  budget: number,
): string {
  const parts: string[] = [];

  // Budget source
  if (mediaMix.total_spend > 0) {
    parts.push(
      `Presupuesto basado en gasto historico de $${formatMoney(mediaMix.total_spend)}.`,
    );
  } else if (peers.peer_avg_total_value) {
    parts.push(
      `Sin historial de compra. Presupuesto referenciado del promedio de peers ($${formatMoney(peers.peer_avg_total_value)}).`,
    );
  }

  // Mix source
  if (mediaMix.entries.length > 0) {
    const topMedios = mediaMix.entries
      .slice(0, 3)
      .map((e) => `${e.medio} (${e.pct}%)`)
      .join(", ");
    parts.push(`Mix historico: ${topMedios}.`);
  } else {
    parts.push("Sin historial — mix dividido equitativamente entre medios.");
  }

  // Peer insights
  if (peers.value_gap && peers.value_gap > 0) {
    parts.push(
      `Oportunidad de upsell: peers gastan $${formatMoney(peers.value_gap)} mas en promedio.`,
    );
  }

  // Event inventory
  if (eventInventory) {
    const scarce = eventInventory.inventario.filter(
      (i) => i.disponible_pct < 15,
    );
    if (scarce.length > 0) {
      const scarceNames = scarce.map((s) => s.medio).join(", ");
      parts.push(
        `Inventario escaso en ${scarceNames} para ${eventInventory.evento.nombre} — ajustado hacia medios disponibles.`,
      );
    }
  }

  // Exclusions
  if (excludeSet.size > 0) {
    parts.push(`Medios excluidos: ${[...excludeSet].join(", ")}.`);
  }

  parts.push(`Presupuesto objetivo: $${formatMoney(budget)}.`);

  return parts.join(" ");
}

function formatMoney(amount: number): string {
  if (amount >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(1)}M`;
  }
  if (amount >= 1_000) {
    return `${(amount / 1_000).toFixed(0)}K`;
  }
  return amount.toFixed(0);
}
