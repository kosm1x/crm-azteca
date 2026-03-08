#!/usr/bin/env tsx
/**
 * Seed Analytics Data — 4 weeks of historical data for analizar_winloss / analizar_tendencias
 *
 * Supplements seed-demo.ts with:
 * - 20 closed proposals (12 won, 5 lost, 3 cancelled) spread across 4 weeks
 * - 120 activities with weekly structure and realistic sentiment distribution
 * - 4 weeks of cuota data for all 12 AEs (current week backwards)
 * - 4 weeks of descarga data for 8 accounts
 *
 * Run AFTER seed-demo.ts:
 *   npx tsx scripts/seed-demo.ts
 *   npx tsx scripts/seed-analytics.ts
 */

import { getDatabase } from '../crm/src/db.js';

const db = getDatabase();
const YEAR = new Date().getFullYear();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCurrentWeek(): number {
  const d = new Date();
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7);
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString();
}

function id(prefix: string, n: number): string {
  return `${prefix}-${String(n).padStart(3, '0')}`;
}

const CW = getCurrentWeek();

// AE IDs from seed-demo (per-010 through per-021)
const aeIds = [
  'per-010', 'per-011', 'per-012', 'per-013', 'per-014',
  'per-015', 'per-016', 'per-017', 'per-018', 'per-019',
  'per-020', 'per-021',
];

// Account IDs from seed-demo
const ctaIds = [
  'cta-001', 'cta-002', 'cta-003', 'cta-004', 'cta-005', 'cta-006',
  'cta-007', 'cta-008', 'cta-009', 'cta-010', 'cta-011', 'cta-012',
];

// ===========================================================================
// 1. CLOSED PROPOSALS — 20 across last 4 weeks
// ===========================================================================

interface ClosedProp {
  titulo: string;
  cta_idx: number;
  ae_idx: number;
  valor: number;
  tipo: string;
  etapa: 'completada' | 'perdida' | 'cancelada';
  razon: string | null;
  week_offset: number; // 0 = this week, 1 = last week, etc.
  cycle_days: number;  // how long from creation to close
}

const closedProposals: ClosedProp[] = [
  // Week 0 (this week): 3 won, 1 lost
  { titulo: 'Coca-Cola Digital Marzo', cta_idx: 0, ae_idx: 0, valor: 6_500_000, tipo: 'estacional', etapa: 'completada', razon: null, week_offset: 0, cycle_days: 18 },
  { titulo: 'Bimbo Radio Spot Q1', cta_idx: 1, ae_idx: 1, valor: 3_200_000, tipo: 'reforzamiento', etapa: 'completada', razon: null, week_offset: 0, cycle_days: 25 },
  { titulo: 'P&G CTV Pre-roll', cta_idx: 2, ae_idx: 2, valor: 4_800_000, tipo: 'lanzamiento', etapa: 'completada', razon: null, week_offset: 0, cycle_days: 14 },
  { titulo: 'Unilever Banner Digital', cta_idx: 3, ae_idx: 3, valor: 2_100_000, tipo: 'estacional', etapa: 'perdida', razon: 'precio', week_offset: 0, cycle_days: 30 },

  // Week 1 (last week): 3 won, 2 lost
  { titulo: 'Telcel TV Abierta Marzo', cta_idx: 5, ae_idx: 5, valor: 18_500_000, tipo: 'reforzamiento', etapa: 'completada', razon: null, week_offset: 1, cycle_days: 22 },
  { titulo: 'Liverpool Digital Always-On', cta_idx: 6, ae_idx: 6, valor: 5_000_000, tipo: 'prospeccion', etapa: 'completada', razon: null, week_offset: 1, cycle_days: 35 },
  { titulo: 'Nestlé Video Instream', cta_idx: 8, ae_idx: 8, valor: 3_800_000, tipo: 'estacional', etapa: 'completada', razon: null, week_offset: 1, cycle_days: 12 },
  { titulo: 'VW Radio Nacional', cta_idx: 7, ae_idx: 7, valor: 4_200_000, tipo: 'lanzamiento', etapa: 'perdida', razon: 'competencia', week_offset: 1, cycle_days: 28 },
  { titulo: 'BBVA Digital Q1', cta_idx: 10, ae_idx: 10, valor: 3_500_000, tipo: 'prospeccion', etapa: 'perdida', razon: 'presupuesto', week_offset: 1, cycle_days: 40 },

  // Week 2: 3 won, 1 lost, 2 cancelled
  { titulo: 'Coca-Cola Radio Deportes', cta_idx: 0, ae_idx: 0, valor: 7_200_000, tipo: 'evento_especial', etapa: 'completada', razon: null, week_offset: 2, cycle_days: 20 },
  { titulo: 'Amazon Newsletter Sponsor', cta_idx: 11, ae_idx: 11, valor: 2_500_000, tipo: 'prospeccion', etapa: 'completada', razon: null, week_offset: 2, cycle_days: 15 },
  { titulo: 'Colgate TV Spot Verano', cta_idx: 9, ae_idx: 9, valor: 5_600_000, tipo: 'estacional', etapa: 'completada', razon: null, week_offset: 2, cycle_days: 32 },
  { titulo: "L'Oréal CTV Mid-Roll", cta_idx: 4, ae_idx: 4, valor: 3_000_000, tipo: 'lanzamiento', etapa: 'perdida', razon: 'competencia', week_offset: 2, cycle_days: 26 },
  { titulo: 'Bimbo Evento Especial', cta_idx: 1, ae_idx: 1, valor: 1_800_000, tipo: 'evento_especial', etapa: 'cancelada', razon: 'Cliente canceló evento', week_offset: 2, cycle_days: 10 },
  { titulo: 'P&G Radio Regional', cta_idx: 2, ae_idx: 2, valor: 1_200_000, tipo: 'reforzamiento', etapa: 'cancelada', razon: 'Cambio de estrategia', week_offset: 2, cycle_days: 8 },

  // Week 3: 3 won, 1 lost, 1 cancelled
  { titulo: 'Telcel Digital Paquete', cta_idx: 5, ae_idx: 5, valor: 12_000_000, tipo: 'tentpole', etapa: 'completada', razon: null, week_offset: 3, cycle_days: 45 },
  { titulo: 'Unilever TV Q1', cta_idx: 3, ae_idx: 3, valor: 8_500_000, tipo: 'estacional', etapa: 'completada', razon: null, week_offset: 3, cycle_days: 38 },
  { titulo: 'Liverpool Radio Navidad', cta_idx: 6, ae_idx: 6, valor: 4_000_000, tipo: 'tentpole', etapa: 'completada', razon: null, week_offset: 3, cycle_days: 28 },
  { titulo: 'Amazon TV Abierta Test', cta_idx: 11, ae_idx: 11, valor: 6_000_000, tipo: 'prospeccion', etapa: 'perdida', razon: 'precio', week_offset: 3, cycle_days: 20 },
  { titulo: 'Nestlé CTV Test', cta_idx: 8, ae_idx: 8, valor: 1_500_000, tipo: 'lanzamiento', etapa: 'cancelada', razon: 'Producto pospuesto', week_offset: 3, cycle_days: 5 },
];

const insertPropuesta = db.prepare(`
  INSERT INTO propuesta (id, cuenta_id, ae_id, titulo, valor_estimado, tipo_oportunidad, etapa,
    fecha_creacion, fecha_ultima_actividad, razon_perdida, dias_sin_actividad)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
`);

for (let i = 0; i < closedProposals.length; i++) {
  const p = closedProposals[i];
  const closeDaysAgo = p.week_offset * 7 + Math.floor(Math.random() * 5); // spread within the week
  const closeDate = daysAgo(closeDaysAgo);
  const createDate = daysAgo(closeDaysAgo + p.cycle_days);

  insertPropuesta.run(
    `ana-prop-${String(i + 1).padStart(3, '0')}`,
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
// 2. ACTIVITIES — 120 across 4 weeks (30/week)
// ===========================================================================

const tipos = ['llamada', 'whatsapp', 'email', 'reunion', 'visita', 'comida', 'envio_propuesta'];
const sentimientoDist = [
  'positivo', 'positivo', 'positivo', 'positivo',   // 40%
  'neutral', 'neutral', 'neutral',                    // 30%
  'negativo', 'negativo',                             // 20%
  'urgente',                                          // 10%
];

const actResumenes = [
  'Llamada de seguimiento para revisar avance de propuesta.',
  'Recibí WhatsApp confirmando interés en ampliar pauta.',
  'Email con cotización actualizada enviado.',
  'Reunión de presentación del plan de medios.',
  'Visita al corporativo para cerrar negociación.',
  'Comida con equipo de marketing para fortalecer relación.',
  'Envié la propuesta formal con desglose completo.',
  'Llamada para aclarar dudas sobre precios de CTV.',
  'WhatsApp para confirmar reunión de mañana.',
  'Email de seguimiento post-reunión con minuta.',
  'Reunión de cierre con equipo de compras.',
  'Visita para presentar resultados de campaña anterior.',
  'Comida con director de marketing para discutir renovación.',
  'Llamada urgente — cliente quiere acelerar calendario.',
  'Email con brief recibido del cliente para nueva campaña.',
];

const insertActividad = db.prepare(`
  INSERT INTO actividad (id, ae_id, cuenta_id, tipo, resumen, sentimiento, fecha)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

let actCount = 0;
for (let week = 0; week < 4; week++) {
  for (let j = 0; j < 30; j++) {
    const aeIdx = j % aeIds.length;
    const ctaIdx = j % ctaIds.length;
    const dayInWeek = Math.floor(Math.random() * 5); // Mon-Fri
    const dayOffset = week * 7 + dayInWeek;
    const fecha = daysAgo(dayOffset);

    insertActividad.run(
      `ana-act-${String(actCount + 1).padStart(3, '0')}`,
      aeIds[aeIdx],
      ctaIds[ctaIdx],
      tipos[j % tipos.length],
      actResumenes[j % actResumenes.length],
      sentimientoDist[j % sentimientoDist.length],
      fecha,
    );
    actCount++;
  }
}

console.log(`Inserted ${actCount} activities`);

// ===========================================================================
// 3. CUOTAS — 4 weeks × 12 AEs = 48 rows
// ===========================================================================

// Different performance profiles per AE
const aeProfiles: { meta: number; trend: 'up' | 'stable' | 'down' }[] = [
  { meta: 1_200_000, trend: 'up' },     // María — strong, improving
  { meta: 1_000_000, trend: 'stable' },  // Carlos — steady
  { meta: 800_000, trend: 'down' },      // José — declining
  { meta: 900_000, trend: 'up' },        // Diana — recovering
  { meta: 700_000, trend: 'stable' },    // Pedro — average
  { meta: 1_500_000, trend: 'up' },      // Sofía — star performer
  { meta: 600_000, trend: 'down' },      // Andrés — struggling
  { meta: 1_100_000, trend: 'stable' },  // Valentina — reliable
  { meta: 850_000, trend: 'up' },        // Rodrigo — improving
  { meta: 950_000, trend: 'down' },      // Gabriela — slipping
  { meta: 750_000, trend: 'stable' },    // Daniel — average
  { meta: 1_300_000, trend: 'up' },      // Alejandra — high growth
];

const insertCuota = db.prepare(`
  INSERT OR IGNORE INTO cuota (id, persona_id, rol, año, semana, meta_total, logro)
  VALUES (?, ?, 'ae', ?, ?, ?, ?)
`);

let cuotaCount = 0;
for (let a = 0; a < aeIds.length; a++) {
  const profile = aeProfiles[a];
  for (let w = 0; w < 4; w++) {
    const semana = CW - w;
    if (semana < 1) continue;

    // Base attainment varies by trend
    let attainment: number;
    const weekPos = 3 - w; // 0=oldest, 3=newest
    switch (profile.trend) {
      case 'up':
        attainment = 0.70 + weekPos * 0.08 + Math.random() * 0.10; // 70→94% improving
        break;
      case 'down':
        attainment = 0.95 - weekPos * 0.08 + Math.random() * 0.10; // 95→71% declining
        break;
      default:
        attainment = 0.80 + Math.random() * 0.15; // 80-95% stable
        break;
    }

    const logro = Math.round(profile.meta * attainment);
    insertCuota.run(
      `ana-quo-${String(a * 4 + w + 1).padStart(3, '0')}`,
      aeIds[a],
      YEAR,
      semana,
      profile.meta,
      logro,
    );
    cuotaCount++;
  }
}

console.log(`Inserted ${cuotaCount} cuota records`);

// ===========================================================================
// 4. DESCARGAS — 4 weeks × 8 accounts (contract accounts)
// ===========================================================================

const contratoMontos = [45_000_000, 32_000_000, 28_000_000, 22_000_000, 18_000_000, 40_000_000, 15_000_000, 35_000_000];

const insertDescarga = db.prepare(`
  INSERT OR IGNORE INTO descarga (id, cuenta_id, contrato_id, semana, año, planificado, facturado, gap_acumulado)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

let descargaCount = 0;
for (let c = 0; c < 8; c++) {
  const weeklyPlan = Math.round(contratoMontos[c] / 52);
  let gapAcum = 0;

  for (let w = 0; w < 4; w++) {
    const semana = CW - 3 + w; // oldest to newest
    if (semana < 1) continue;

    // Variance: founders run ahead, others mixed
    let factor = 0.92 + Math.random() * 0.16; // 92-108%
    if (c === 0 || c === 1) factor = 1.01 + Math.random() * 0.06; // Coca-Cola, Bimbo ahead
    if (c === 3) factor = 0.75 + Math.random() * 0.10;             // Unilever behind

    const planned = weeklyPlan;
    const billed = Math.round(weeklyPlan * factor);
    gapAcum += (planned - billed);

    insertDescarga.run(
      `ana-desc-${String(c * 4 + w + 1).padStart(3, '0')}`,
      ctaIds[c],
      id('ctr', c + 1),
      semana,
      YEAR,
      planned,
      billed,
      Math.round(gapAcum),
    );
    descargaCount++;
  }
}

console.log(`Inserted ${descargaCount} descarga records`);

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
    completadas: closedProposals.filter(p => p.etapa === 'completada').length,
    perdidas: closedProposals.filter(p => p.etapa === 'perdida').length,
    canceladas: closedProposals.filter(p => p.etapa === 'cancelada').length,
  },
  valor_total_ganado: closedProposals
    .filter(p => p.etapa === 'completada')
    .reduce((s, p) => s + p.valor, 0),
  valor_total_perdido: closedProposals
    .filter(p => p.etapa === 'perdida')
    .reduce((s, p) => s + p.valor, 0),
};

console.log('\nAnalytics seed summary:');
console.log(JSON.stringify(summary, null, 2));
