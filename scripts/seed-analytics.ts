#!/usr/bin/env tsx
/**
 * Seed Analytics Data — 4 weeks of historical data for analizar_winloss / analizar_tendencias
 *
 * Supplements seed-demo.ts with:
 * - 36 closed proposals: every AE gets 3 (mix of completada/perdida/cancelada)
 * - 240 activities: 5/week/AE with realistic type and sentiment distribution
 * - 4 weeks of cuota data for 12 AEs (managers aggregate at query time)
 * - 4 weeks of descarga data for all 12 accounts
 * - 4 contracts for accounts cta-009 through cta-012 (if missing)
 *
 * Run AFTER seed-demo.ts:
 *   npx tsx scripts/seed-demo.ts
 *   npx tsx scripts/seed-analytics.ts
 */

import { getDatabase } from "../crm/src/db.js";
import { getCurrentWeek, getMxYear } from "../crm/src/tools/helpers.js";

const db = getDatabase();
const YEAR = getMxYear();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString();
}

const CW = getCurrentWeek();

// Persona hierarchy
// VP: per-001 (Roberto Vega)
//   Director: per-002 (Ana Martínez)
//     Gerente: per-004 (Miguel Ríos) → per-010 María, per-011 Carlos
//     Gerente: per-005 (Laura Sánchez) → per-012 José, per-013 Diana, per-014 Pedro
//     Gerente: per-006 (Fernando Castillo) → per-015 Sofía, per-016 Andrés
//   Director: per-003 (Luis Gutiérrez)
//     Gerente: per-007 (Carmen Flores) → per-017 Valentina, per-018 Rodrigo, per-019 Gabriela
//     Gerente: per-008 (Ricardo Moreno) → per-020 Daniel, per-021 Alejandra

const aeIds = [
  "per-010",
  "per-011",
  "per-012",
  "per-013",
  "per-014",
  "per-015",
  "per-016",
  "per-017",
  "per-018",
  "per-019",
  "per-020",
  "per-021",
];

const ctaIds = [
  "cta-001",
  "cta-002",
  "cta-003",
  "cta-004",
  "cta-005",
  "cta-006",
  "cta-007",
  "cta-008",
  "cta-009",
  "cta-010",
  "cta-011",
  "cta-012",
];

// AE index → account index (1:1 mapping)
// per-010→cta-001, per-011→cta-002, ..., per-021→cta-012

// ===========================================================================
// 0. ENSURE CONTRACTS EXIST FOR ALL 12 ACCOUNTS
// ===========================================================================

const missingContracts = [
  { id: "ctr-009", cuenta_id: "cta-009", monto: 25_000_000 }, // Nestlé
  { id: "ctr-010", cuenta_id: "cta-010", monto: 20_000_000 }, // Colgate
  { id: "ctr-011", cuenta_id: "cta-011", monto: 30_000_000 }, // BBVA
  { id: "ctr-012", cuenta_id: "cta-012", monto: 38_000_000 }, // Amazon
];

const insertContrato = db.prepare(`
  INSERT OR IGNORE INTO contrato (id, cuenta_id, año, monto_comprometido, estatus)
  VALUES (?, ?, ?, ?, 'en_ejecucion')
`);

let contratoCount = 0;
for (const c of missingContracts) {
  const result = insertContrato.run(c.id, c.cuenta_id, YEAR, c.monto);
  if (result.changes > 0) contratoCount++;
}

console.log(
  `Inserted ${contratoCount} new contracts (${missingContracts.length - contratoCount} already existed)`,
);

// ===========================================================================
// 1. CLOSED PROPOSALS — 36 (3 per AE: realistic mix)
// ===========================================================================

// Clean old analytics proposals first (idempotent re-run)
db.prepare("DELETE FROM propuesta WHERE id LIKE 'ana-prop-%'").run();

interface ClosedProp {
  titulo: string;
  cta_idx: number;
  ae_idx: number;
  valor: number;
  tipo: string;
  etapa: "completada" | "perdida" | "cancelada";
  razon: string | null;
  week_offset: number;
  cycle_days: number;
}

const closedProposals: ClosedProp[] = [
  // --- per-010 María (cta-001 Coca-Cola) ---
  {
    titulo: "Coca-Cola Digital Marzo",
    cta_idx: 0,
    ae_idx: 0,
    valor: 6_500_000,
    tipo: "estacional",
    etapa: "completada",
    razon: null,
    week_offset: 0,
    cycle_days: 18,
  },
  {
    titulo: "Coca-Cola Radio Deportes",
    cta_idx: 0,
    ae_idx: 0,
    valor: 7_200_000,
    tipo: "evento_especial",
    etapa: "completada",
    razon: null,
    week_offset: 2,
    cycle_days: 20,
  },
  {
    titulo: "Coca-Cola CTV Prueba",
    cta_idx: 0,
    ae_idx: 0,
    valor: 2_800_000,
    tipo: "prospeccion",
    etapa: "perdida",
    razon: "presupuesto",
    week_offset: 3,
    cycle_days: 15,
  },

  // --- per-011 Carlos (cta-002 Bimbo) ---
  {
    titulo: "Bimbo Radio Spot Q1",
    cta_idx: 1,
    ae_idx: 1,
    valor: 3_200_000,
    tipo: "reforzamiento",
    etapa: "completada",
    razon: null,
    week_offset: 0,
    cycle_days: 25,
  },
  {
    titulo: "Bimbo Evento Especial",
    cta_idx: 1,
    ae_idx: 1,
    valor: 1_800_000,
    tipo: "evento_especial",
    etapa: "cancelada",
    razon: "Cliente canceló evento",
    week_offset: 2,
    cycle_days: 10,
  },
  {
    titulo: "Bimbo Digital Q1",
    cta_idx: 1,
    ae_idx: 1,
    valor: 4_500_000,
    tipo: "lanzamiento",
    etapa: "perdida",
    razon: "competencia",
    week_offset: 3,
    cycle_days: 22,
  },

  // --- per-012 José (cta-003 P&G) ---
  {
    titulo: "P&G CTV Pre-roll",
    cta_idx: 2,
    ae_idx: 2,
    valor: 4_800_000,
    tipo: "lanzamiento",
    etapa: "completada",
    razon: null,
    week_offset: 0,
    cycle_days: 14,
  },
  {
    titulo: "P&G Radio Regional",
    cta_idx: 2,
    ae_idx: 2,
    valor: 1_200_000,
    tipo: "reforzamiento",
    etapa: "cancelada",
    razon: "Cambio de estrategia",
    week_offset: 2,
    cycle_days: 8,
  },
  {
    titulo: "P&G TV Verano",
    cta_idx: 2,
    ae_idx: 2,
    valor: 5_500_000,
    tipo: "estacional",
    etapa: "completada",
    razon: null,
    week_offset: 3,
    cycle_days: 30,
  },

  // --- per-013 Diana (cta-004 Unilever) ---
  {
    titulo: "Unilever Banner Digital",
    cta_idx: 3,
    ae_idx: 3,
    valor: 2_100_000,
    tipo: "estacional",
    etapa: "perdida",
    razon: "precio",
    week_offset: 0,
    cycle_days: 30,
  },
  {
    titulo: "Unilever TV Q1",
    cta_idx: 3,
    ae_idx: 3,
    valor: 8_500_000,
    tipo: "estacional",
    etapa: "completada",
    razon: null,
    week_offset: 3,
    cycle_days: 38,
  },
  {
    titulo: "Unilever Radio Nacional",
    cta_idx: 3,
    ae_idx: 3,
    valor: 3_600_000,
    tipo: "reforzamiento",
    etapa: "completada",
    razon: null,
    week_offset: 1,
    cycle_days: 20,
  },

  // --- per-014 Pedro (cta-005 L'Oréal) ---
  {
    titulo: "L'Oréal CTV Mid-Roll",
    cta_idx: 4,
    ae_idx: 4,
    valor: 3_000_000,
    tipo: "lanzamiento",
    etapa: "perdida",
    razon: "competencia",
    week_offset: 2,
    cycle_days: 26,
  },
  {
    titulo: "L'Oréal Digital Always-On",
    cta_idx: 4,
    ae_idx: 4,
    valor: 4_200_000,
    tipo: "prospeccion",
    etapa: "completada",
    razon: null,
    week_offset: 1,
    cycle_days: 18,
  },
  {
    titulo: "L'Oréal Radio Primavera",
    cta_idx: 4,
    ae_idx: 4,
    valor: 2_000_000,
    tipo: "estacional",
    etapa: "cancelada",
    razon: "Reestructura interna",
    week_offset: 3,
    cycle_days: 12,
  },

  // --- per-015 Sofía (cta-006 Telcel) — Fernando's team ---
  {
    titulo: "Telcel TV Abierta Marzo",
    cta_idx: 5,
    ae_idx: 5,
    valor: 18_500_000,
    tipo: "reforzamiento",
    etapa: "completada",
    razon: null,
    week_offset: 1,
    cycle_days: 22,
  },
  {
    titulo: "Telcel Digital Paquete",
    cta_idx: 5,
    ae_idx: 5,
    valor: 12_000_000,
    tipo: "tentpole",
    etapa: "completada",
    razon: null,
    week_offset: 3,
    cycle_days: 45,
  },
  {
    titulo: "Telcel CTV Streaming",
    cta_idx: 5,
    ae_idx: 5,
    valor: 5_500_000,
    tipo: "lanzamiento",
    etapa: "perdida",
    razon: "precio",
    week_offset: 0,
    cycle_days: 28,
  },

  // --- per-016 Andrés (cta-007 Liverpool) — Fernando's team ---
  {
    titulo: "Liverpool Digital Always-On",
    cta_idx: 6,
    ae_idx: 6,
    valor: 5_000_000,
    tipo: "prospeccion",
    etapa: "completada",
    razon: null,
    week_offset: 1,
    cycle_days: 35,
  },
  {
    titulo: "Liverpool Radio Navidad",
    cta_idx: 6,
    ae_idx: 6,
    valor: 4_000_000,
    tipo: "tentpole",
    etapa: "completada",
    razon: null,
    week_offset: 3,
    cycle_days: 28,
  },
  {
    titulo: "Liverpool TV Verano",
    cta_idx: 6,
    ae_idx: 6,
    valor: 3_800_000,
    tipo: "estacional",
    etapa: "perdida",
    razon: "competencia",
    week_offset: 2,
    cycle_days: 32,
  },

  // --- per-017 Valentina (cta-008 VW) ---
  {
    titulo: "VW Radio Nacional",
    cta_idx: 7,
    ae_idx: 7,
    valor: 4_200_000,
    tipo: "lanzamiento",
    etapa: "perdida",
    razon: "competencia",
    week_offset: 1,
    cycle_days: 28,
  },
  {
    titulo: "VW Digital Q2",
    cta_idx: 7,
    ae_idx: 7,
    valor: 6_800_000,
    tipo: "estacional",
    etapa: "completada",
    razon: null,
    week_offset: 0,
    cycle_days: 35,
  },
  {
    titulo: "VW CTV Lanzamiento",
    cta_idx: 7,
    ae_idx: 7,
    valor: 9_200_000,
    tipo: "lanzamiento",
    etapa: "completada",
    razon: null,
    week_offset: 2,
    cycle_days: 40,
  },

  // --- per-018 Rodrigo (cta-009 Nestlé) ---
  {
    titulo: "Nestlé Video Instream",
    cta_idx: 8,
    ae_idx: 8,
    valor: 3_800_000,
    tipo: "estacional",
    etapa: "completada",
    razon: null,
    week_offset: 1,
    cycle_days: 12,
  },
  {
    titulo: "Nestlé CTV Test",
    cta_idx: 8,
    ae_idx: 8,
    valor: 1_500_000,
    tipo: "lanzamiento",
    etapa: "cancelada",
    razon: "Producto pospuesto",
    week_offset: 3,
    cycle_days: 5,
  },
  {
    titulo: "Nestlé Radio Verano",
    cta_idx: 8,
    ae_idx: 8,
    valor: 4_100_000,
    tipo: "estacional",
    etapa: "completada",
    razon: null,
    week_offset: 0,
    cycle_days: 22,
  },

  // --- per-019 Gabriela (cta-010 Colgate) ---
  {
    titulo: "Colgate TV Spot Verano",
    cta_idx: 9,
    ae_idx: 9,
    valor: 5_600_000,
    tipo: "estacional",
    etapa: "completada",
    razon: null,
    week_offset: 2,
    cycle_days: 32,
  },
  {
    titulo: "Colgate Digital Q1",
    cta_idx: 9,
    ae_idx: 9,
    valor: 3_300_000,
    tipo: "prospeccion",
    etapa: "perdida",
    razon: "presupuesto",
    week_offset: 0,
    cycle_days: 25,
  },
  {
    titulo: "Colgate Radio Nacional",
    cta_idx: 9,
    ae_idx: 9,
    valor: 2_700_000,
    tipo: "reforzamiento",
    etapa: "completada",
    razon: null,
    week_offset: 3,
    cycle_days: 18,
  },

  // --- per-020 Daniel (cta-011 BBVA) ---
  {
    titulo: "BBVA Digital Q1",
    cta_idx: 10,
    ae_idx: 10,
    valor: 3_500_000,
    tipo: "prospeccion",
    etapa: "perdida",
    razon: "presupuesto",
    week_offset: 1,
    cycle_days: 40,
  },
  {
    titulo: "BBVA TV Financiero",
    cta_idx: 10,
    ae_idx: 10,
    valor: 7_000_000,
    tipo: "reforzamiento",
    etapa: "completada",
    razon: null,
    week_offset: 0,
    cycle_days: 30,
  },
  {
    titulo: "BBVA Radio Spot",
    cta_idx: 10,
    ae_idx: 10,
    valor: 2_200_000,
    tipo: "estacional",
    etapa: "cancelada",
    razon: "Regulación bancaria",
    week_offset: 3,
    cycle_days: 14,
  },

  // --- per-021 Alejandra (cta-012 Amazon) ---
  {
    titulo: "Amazon Newsletter Sponsor",
    cta_idx: 11,
    ae_idx: 11,
    valor: 2_500_000,
    tipo: "prospeccion",
    etapa: "completada",
    razon: null,
    week_offset: 2,
    cycle_days: 15,
  },
  {
    titulo: "Amazon TV Abierta Test",
    cta_idx: 11,
    ae_idx: 11,
    valor: 6_000_000,
    tipo: "prospeccion",
    etapa: "perdida",
    razon: "precio",
    week_offset: 3,
    cycle_days: 20,
  },
  {
    titulo: "Amazon CTV Prime Video",
    cta_idx: 11,
    ae_idx: 11,
    valor: 8_800_000,
    tipo: "lanzamiento",
    etapa: "completada",
    razon: null,
    week_offset: 0,
    cycle_days: 42,
  },
];

const insertPropuesta = db.prepare(`
  INSERT INTO propuesta (id, cuenta_id, ae_id, titulo, valor_estimado, tipo_oportunidad, etapa,
    fecha_creacion, fecha_ultima_actividad, razon_perdida, dias_sin_actividad)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
`);

for (let i = 0; i < closedProposals.length; i++) {
  const p = closedProposals[i];
  const closeDaysAgo = p.week_offset * 7 + (i % 5); // deterministic spread within week
  const closeDate = daysAgo(closeDaysAgo);
  const createDate = daysAgo(closeDaysAgo + p.cycle_days);

  insertPropuesta.run(
    `ana-prop-${String(i + 1).padStart(3, "0")}`,
    ctaIds[p.cta_idx],
    aeIds[p.ae_idx],
    p.titulo,
    p.valor,
    p.tipo,
    p.etapa,
    createDate,
    closeDate,
    p.razon,
  );
}

console.log(`Inserted ${closedProposals.length} closed proposals`);

// ===========================================================================
// 2. ACTIVITIES — 240 across 4 weeks (5/week per AE = 60/week)
// ===========================================================================

// Clean old analytics activities (idempotent re-run)
db.prepare("DELETE FROM actividad WHERE id LIKE 'ana-act-%'").run();

const tipos = [
  "llamada",
  "whatsapp",
  "email",
  "reunion",
  "visita",
  "comida",
  "envio_propuesta",
];
const sentimientoDist = [
  "positivo",
  "positivo",
  "positivo",
  "positivo", // 40%
  "neutral",
  "neutral",
  "neutral", // 30%
  "negativo",
  "negativo", // 20%
  "urgente", // 10%
];

const actResumenes = [
  "Llamada de seguimiento para revisar avance de propuesta.",
  "Recibí WhatsApp confirmando interés en ampliar pauta.",
  "Email con cotización actualizada enviado.",
  "Reunión de presentación del plan de medios.",
  "Visita al corporativo para cerrar negociación.",
  "Comida con equipo de marketing para fortalecer relación.",
  "Envié la propuesta formal con desglose completo.",
  "Llamada para aclarar dudas sobre precios de CTV.",
  "WhatsApp para confirmar reunión de mañana.",
  "Email de seguimiento post-reunión con minuta.",
  "Reunión de cierre con equipo de compras.",
  "Visita para presentar resultados de campaña anterior.",
  "Comida con director de marketing para discutir renovación.",
  "Llamada urgente — cliente quiere acelerar calendario.",
  "Email con brief recibido del cliente para nueva campaña.",
];

const insertActividad = db.prepare(`
  INSERT INTO actividad (id, ae_id, cuenta_id, tipo, resumen, sentimiento, fecha)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

let actCount = 0;
for (let week = 0; week < 4; week++) {
  for (let aeIdx = 0; aeIdx < aeIds.length; aeIdx++) {
    // 5 activities per AE per week
    for (let a = 0; a < 5; a++) {
      const dayInWeek = a; // Mon through Fri (0-4)
      const dayOffset = week * 7 + dayInWeek;
      const fecha = daysAgo(dayOffset);
      const seqNum = actCount; // deterministic

      insertActividad.run(
        `ana-act-${String(actCount + 1).padStart(3, "0")}`,
        aeIds[aeIdx],
        ctaIds[aeIdx], // each AE's own account
        tipos[seqNum % tipos.length],
        actResumenes[seqNum % actResumenes.length],
        sentimientoDist[seqNum % sentimientoDist.length],
        fecha,
      );
      actCount++;
    }
  }
}

console.log(`Inserted ${actCount} activities`);

// ===========================================================================
// 3. CUOTAS — 12 AEs × 4 weeks = 48 rows
// ===========================================================================
// NOTE: Only seed AE-level cuotas. Managers/directors/VP aggregate from their
// team's AE data at query time (tendenciaCuota SUM + GROUP BY). Seeding
// aggregated rows would cause double-counting since the query includes
// persona_id IN (gerente_id, ...team_ae_ids).

// Delete existing cuota rows for the analytics period to avoid UNIQUE conflicts
const minWeek = Math.max(1, CW - 3);
db.prepare(
  "DELETE FROM cuota WHERE año = ? AND semana >= ? AND semana <= ?",
).run(YEAR, minWeek, CW);

// AE performance profiles
const aeProfiles: { meta: number; trend: "up" | "stable" | "down" }[] = [
  { meta: 1_200_000, trend: "up" }, // per-010 María — strong, improving
  { meta: 1_000_000, trend: "stable" }, // per-011 Carlos — steady
  { meta: 800_000, trend: "down" }, // per-012 José — declining
  { meta: 900_000, trend: "up" }, // per-013 Diana — recovering
  { meta: 700_000, trend: "stable" }, // per-014 Pedro — average
  { meta: 1_500_000, trend: "up" }, // per-015 Sofía — star performer
  { meta: 600_000, trend: "down" }, // per-016 Andrés — struggling
  { meta: 1_100_000, trend: "stable" }, // per-017 Valentina — reliable
  { meta: 850_000, trend: "up" }, // per-018 Rodrigo — improving
  { meta: 950_000, trend: "down" }, // per-019 Gabriela — slipping
  { meta: 750_000, trend: "stable" }, // per-020 Daniel — average
  { meta: 1_300_000, trend: "up" }, // per-021 Alejandra — high growth
];

function computeAttainment(
  trend: "up" | "stable" | "down",
  weekPos: number,
  seed: number,
): number {
  // weekPos: 0=oldest, 3=newest. seed provides deterministic variance.
  const variance = ((seed * 7 + 3) % 10) / 100; // 0.00 – 0.09
  switch (trend) {
    case "up":
      return 0.7 + weekPos * 0.08 + variance; // 70→94% improving
    case "down":
      return 0.95 - weekPos * 0.08 + variance; // 95→71% declining
    default:
      return 0.8 + variance + 0.05; // 80-94% stable
  }
}

const insertCuota = db.prepare(`
  INSERT INTO cuota (id, persona_id, rol, año, semana, meta_total, logro)
  VALUES (?, ?, 'ae', ?, ?, ?, ?)
`);

let cuotaCount = 0;
for (let a = 0; a < aeIds.length; a++) {
  const profile = aeProfiles[a];
  for (let w = 0; w < 4; w++) {
    const semana = CW - w;
    if (semana < 1) continue;

    const weekPos = 3 - w; // 0=oldest, 3=newest
    const attainment = computeAttainment(profile.trend, weekPos, a * 4 + w);
    const logro = Math.round(profile.meta * attainment);

    insertCuota.run(
      `ana-quo-${String(cuotaCount + 1).padStart(3, "0")}`,
      aeIds[a],
      YEAR,
      semana,
      profile.meta,
      logro,
    );
    cuotaCount++;
  }
}

console.log(`Inserted ${cuotaCount} cuota records (12 AEs × 4 weeks)`);

// ===========================================================================
// 4. DESCARGAS — 4 weeks × 12 accounts (all have contracts now)
// ===========================================================================

// Clean old analytics descargas (idempotent re-run)
db.prepare("DELETE FROM descarga WHERE id LIKE 'ana-desc-%'").run();

const contratoMontos = [
  45_000_000, 32_000_000, 28_000_000, 22_000_000, 18_000_000, 40_000_000,
  15_000_000, 35_000_000, 25_000_000, 20_000_000, 30_000_000, 38_000_000,
];

const insertDescarga = db.prepare(`
  INSERT OR IGNORE INTO descarga (id, cuenta_id, contrato_id, semana, año, planificado, facturado, gap_acumulado)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

let descargaCount = 0;
for (let c = 0; c < 12; c++) {
  const weeklyPlan = Math.round(contratoMontos[c] / 52);
  let gapAcum = 0;

  for (let w = 0; w < 4; w++) {
    const semana = CW - 3 + w; // oldest to newest
    if (semana < 1) continue;

    // Deterministic variance based on account + week
    const seed = (c * 7 + w * 13) % 20;
    let factor: number;

    // Different performance profiles per account
    if (c === 0 || c === 1) {
      // Coca-Cola, Bimbo — founders, running ahead
      factor = 1.01 + seed * 0.003;
    } else if (c === 3) {
      // Unilever — behind
      factor = 0.75 + seed * 0.005;
    } else if (c === 5) {
      // Telcel — strong (Fernando's team, Sofía)
      factor = 1.02 + seed * 0.002;
    } else if (c === 6) {
      // Liverpool — slight gap (Fernando's team, Andrés)
      factor = 0.9 + seed * 0.005;
    } else {
      // Everyone else — mixed
      factor = 0.92 + seed * 0.008;
    }

    const planned = weeklyPlan;
    const billed = Math.round(weeklyPlan * factor);
    gapAcum += planned - billed;

    insertDescarga.run(
      `ana-desc-${String(c * 4 + w + 1).padStart(3, "0")}`,
      ctaIds[c],
      `ctr-${String(c + 1).padStart(3, "0")}`,
      semana,
      YEAR,
      planned,
      billed,
      Math.round(gapAcum),
    );
    descargaCount++;
  }
}

console.log(
  `Inserted ${descargaCount} descarga records (12 accounts × 4 weeks)`,
);

// ===========================================================================
// Summary
// ===========================================================================

const summary = {
  propuestas_cerradas: closedProposals.length,
  actividades: actCount,
  cuotas: cuotaCount,
  descargas: descargaCount,
  periodo: `semanas ${CW - 3} a ${CW} (${YEAR})`,
  distribucion_propuestas: {
    completadas: closedProposals.filter((p) => p.etapa === "completada").length,
    perdidas: closedProposals.filter((p) => p.etapa === "perdida").length,
    canceladas: closedProposals.filter((p) => p.etapa === "cancelada").length,
  },
  cobertura: {
    aes_con_propuestas: new Set(closedProposals.map((p) => p.ae_idx)).size,
    aes_con_cuotas: aeIds.length,
    cuentas_con_descarga: 12,
  },
  valor_total_ganado: closedProposals
    .filter((p) => p.etapa === "completada")
    .reduce((s, p) => s + p.valor, 0),
  valor_total_perdido: closedProposals
    .filter((p) => p.etapa === "perdida")
    .reduce((s, p) => s + p.valor, 0),
};

console.log("\nAnalytics seed summary:");
console.log(JSON.stringify(summary, null, 2));
