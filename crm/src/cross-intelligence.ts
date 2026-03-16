/**
 * Cross-Agent Intelligence — Lateral Pattern Detection
 *
 * Detects patterns across all agents that no individual agent can see:
 *   1. tendencia_vertical    — category-wide budget shifts (60%+ accounts same direction)
 *   2. movimiento_holding    — coordinated buying signals under same holding
 *   3. conflicto_inventario  — multiple AEs targeting overlapping inventory
 *   4. correlacion_winloss   — systemic win/loss factors across 3+ AEs
 *   5. concentracion_riesgo  — revenue concentration in few deals/AEs
 *
 * Runs as post-analyzer step in overnight batch. Results stored in patron_detectado
 * with role-appropriate nivel_minimo for routing.
 */

import { getDatabase } from "./db.js";
import { logger } from "./logger.js";

function genId(): string {
  return `pat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isDuplicate(
  db: ReturnType<typeof getDatabase>,
  tipo: string,
  descripcion: string,
): boolean {
  const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
  const existing = db
    .prepare(
      `SELECT 1 FROM patron_detectado
       WHERE tipo = ? AND descripcion = ? AND fecha_deteccion >= ? AND activo = 1`,
    )
    .get(tipo, descripcion, cutoff);
  return !!existing;
}

// ---------------------------------------------------------------------------
// 1. Vertical Trends — category-wide budget shifts
// ---------------------------------------------------------------------------

function detectVerticalTrends(
  db: ReturnType<typeof getDatabase>,
  lote: string,
): number {
  // Compare current quarter pipeline value vs same quarter last year per vertical
  const year = new Date().getFullYear();
  const month = new Date().getMonth() + 1;
  const quarter = Math.ceil(month / 3);
  const qStart = `${year}-${String((quarter - 1) * 3 + 1).padStart(2, "0")}-01`;
  const qEnd = `${year}-${String(quarter * 3).padStart(2, "0")}-31`;
  const prevQStart = `${year - 1}-${String((quarter - 1) * 3 + 1).padStart(2, "0")}-01`;
  const prevQEnd = `${year - 1}-${String(quarter * 3).padStart(2, "0")}-31`;

  const verticals = db
    .prepare(
      `SELECT c.vertical, COUNT(DISTINCT c.id) as num_cuentas,
              SUM(CASE WHEN p.fecha_creacion BETWEEN ? AND ? THEN p.valor_estimado ELSE 0 END) as valor_actual,
              SUM(CASE WHEN p.fecha_creacion BETWEEN ? AND ? THEN p.valor_estimado ELSE 0 END) as valor_anterior
       FROM cuenta c
       JOIN propuesta p ON p.cuenta_id = c.id
       WHERE c.vertical IS NOT NULL AND c.estado = 'activo'
         AND p.etapa NOT IN ('cancelada','borrador_agente')
       GROUP BY c.vertical
       HAVING num_cuentas >= 4`,
    )
    .all(qStart, qEnd, prevQStart, prevQEnd) as any[];

  let count = 0;
  const insert = db.prepare(
    `INSERT INTO patron_detectado (id, tipo, descripcion, datos_json, sample_size, confianza, cuentas_afectadas, nivel_minimo, accion_recomendada, lote_nocturno)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  for (const v of verticals) {
    if (!v.valor_anterior || v.valor_anterior === 0) continue;
    const changePct = Math.round(
      ((v.valor_actual - v.valor_anterior) / v.valor_anterior) * 100,
    );
    if (Math.abs(changePct) < 15) continue; // only significant changes

    const direction = changePct > 0 ? "crecimiento" : "contraccion";
    const desc = `Vertical ${v.vertical}: ${direction} de ${Math.abs(changePct)}% vs mismo trimestre del año anterior (${v.num_cuentas} cuentas)`;

    if (isDuplicate(db, "tendencia_vertical", desc)) continue;

    insert.run(
      genId(),
      "tendencia_vertical",
      desc,
      JSON.stringify({
        vertical: v.vertical,
        change_pct: changePct,
        num_cuentas: v.num_cuentas,
        valor_actual: v.valor_actual,
        valor_anterior: v.valor_anterior,
      }),
      v.num_cuentas,
      changePct > 0 ? 0.7 : 0.75,
      null,
      "director",
      changePct < 0
        ? `Retencion proactiva recomendada para cuentas de ${v.vertical}`
        : `Oportunidad de expansion en ${v.vertical}`,
      lote,
    );
    count++;
  }
  return count;
}

// ---------------------------------------------------------------------------
// 2. Holding Movements — coordinated buying signals
// ---------------------------------------------------------------------------

function detectHoldingMovements(
  db: ReturnType<typeof getDatabase>,
  lote: string,
): number {
  // Find holdings where 2+ agencies show similar recent activity patterns
  const cutoff = new Date(Date.now() - 14 * 86400000).toISOString();

  const holdings = db
    .prepare(
      `SELECT c.holding_agencia, COUNT(DISTINCT c.id) as num_cuentas,
              GROUP_CONCAT(DISTINCT c.nombre) as cuentas,
              COUNT(DISTINCT p.tipo_oportunidad) as tipos_activos,
              SUM(p.valor_estimado) as valor_total
       FROM cuenta c
       JOIN propuesta p ON p.cuenta_id = c.id
       WHERE c.holding_agencia IS NOT NULL AND c.estado = 'activo'
         AND p.fecha_creacion >= ? AND p.etapa NOT IN ('completada','perdida','cancelada','borrador_agente')
       GROUP BY c.holding_agencia
       HAVING num_cuentas >= 2`,
    )
    .all(cutoff) as any[];

  let count = 0;
  const insert = db.prepare(
    `INSERT INTO patron_detectado (id, tipo, descripcion, datos_json, sample_size, confianza, cuentas_afectadas, nivel_minimo, accion_recomendada, lote_nocturno)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  for (const h of holdings) {
    const desc = `Holding ${h.holding_agencia}: ${h.num_cuentas} agencias con actividad reciente (${h.cuentas}). ${h.tipos_activos} tipos en vuelo, $${(h.valor_total / 1e6).toFixed(1)}M total`;

    if (isDuplicate(db, "movimiento_holding", desc)) continue;

    insert.run(
      genId(),
      "movimiento_holding",
      desc,
      JSON.stringify({
        holding: h.holding_agencia,
        num_cuentas: h.num_cuentas,
        cuentas: h.cuentas,
        valor_total: h.valor_total,
      }),
      h.num_cuentas,
      0.65,
      h.cuentas,
      "director",
      `Evaluar paquete consolidado a nivel holding ${h.holding_agencia}`,
      lote,
    );
    count++;
  }
  return count;
}

// ---------------------------------------------------------------------------
// 3. Inventory Conflicts — multiple AEs targeting same blocks
// ---------------------------------------------------------------------------

function detectInventoryConflicts(
  db: ReturnType<typeof getDatabase>,
  lote: string,
): number {
  // Find events where 2+ active proposals from different AEs overlap
  const conflicts = db
    .prepare(
      `SELECT p.gancho_temporal, COUNT(DISTINCT p.ae_id) as num_aes,
              SUM(p.valor_estimado) as valor_total,
              GROUP_CONCAT(DISTINCT per.nombre) as ejecutivos,
              GROUP_CONCAT(DISTINCT c.nombre) as cuentas
       FROM propuesta p
       JOIN cuenta c ON p.cuenta_id = c.id
       JOIN persona per ON p.ae_id = per.id
       WHERE p.gancho_temporal IS NOT NULL
         AND p.etapa NOT IN ('completada','perdida','cancelada','borrador_agente')
       GROUP BY p.gancho_temporal
       HAVING num_aes >= 2`,
    )
    .all() as any[];

  let count = 0;
  const insert = db.prepare(
    `INSERT INTO patron_detectado (id, tipo, descripcion, datos_json, sample_size, confianza, personas_afectadas, cuentas_afectadas, nivel_minimo, accion_recomendada, lote_nocturno)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  for (const c of conflicts) {
    const desc = `Conflicto inventario "${c.gancho_temporal}": ${c.num_aes} Ejecutivos compitiendo (${c.ejecutivos}). Cuentas: ${c.cuentas}. Valor total: $${(c.valor_total / 1e6).toFixed(1)}M`;

    if (isDuplicate(db, "conflicto_inventario", desc)) continue;

    insert.run(
      genId(),
      "conflicto_inventario",
      desc,
      JSON.stringify({
        gancho: c.gancho_temporal,
        num_aes: c.num_aes,
        valor_total: c.valor_total,
      }),
      c.num_aes,
      0.85,
      c.ejecutivos,
      c.cuentas,
      "director",
      `Director debe orquestar asignacion de inventario para "${c.gancho_temporal}"`,
      lote,
    );
    count++;
  }
  return count;
}

// ---------------------------------------------------------------------------
// 4. Win/Loss Correlations — systemic factors across AEs
// ---------------------------------------------------------------------------

function detectWinLossCorrelations(
  db: ReturnType<typeof getDatabase>,
  lote: string,
): number {
  const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();

  // Find loss reasons that appear across 3+ AEs
  const lossPatterns = db
    .prepare(
      `SELECT p.razon_perdida, COUNT(*) as total_losses,
              COUNT(DISTINCT p.ae_id) as num_aes,
              AVG(p.valor_estimado) as avg_valor,
              GROUP_CONCAT(DISTINCT per.nombre) as ejecutivos
       FROM propuesta p
       JOIN persona per ON p.ae_id = per.id
       WHERE p.etapa = 'perdida' AND p.razon_perdida IS NOT NULL
         AND p.fecha_creacion >= ?
       GROUP BY p.razon_perdida
       HAVING num_aes >= 2 AND total_losses >= 3`,
    )
    .all(cutoff) as any[];

  let count = 0;
  const insert = db.prepare(
    `INSERT INTO patron_detectado (id, tipo, descripcion, datos_json, sample_size, confianza, personas_afectadas, nivel_minimo, accion_recomendada, lote_nocturno)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  for (const lp of lossPatterns) {
    const desc = `Razon de perdida "${lp.razon_perdida}" aparece en ${lp.total_losses} propuestas de ${lp.num_aes} Ejecutivos (${lp.ejecutivos}). Valor promedio: $${(lp.avg_valor / 1e6).toFixed(1)}M`;

    if (isDuplicate(db, "correlacion_winloss", desc)) continue;

    insert.run(
      genId(),
      "correlacion_winloss",
      desc,
      JSON.stringify({
        razon: lp.razon_perdida,
        total: lp.total_losses,
        num_aes: lp.num_aes,
        avg_valor: lp.avg_valor,
      }),
      lp.total_losses,
      lp.num_aes >= 3 ? 0.8 : 0.65,
      lp.ejecutivos,
      "gerente",
      `Revisar estrategia de pricing/posicionamiento. Coaching recomendado para: ${lp.ejecutivos}`,
      lote,
    );
    count++;
  }
  return count;
}

// ---------------------------------------------------------------------------
// 5. Concentration Risk — revenue in few deals or AEs
// ---------------------------------------------------------------------------

function detectConcentrationRisk(
  db: ReturnType<typeof getDatabase>,
  lote: string,
): number {
  let count = 0;
  const insert = db.prepare(
    `INSERT INTO patron_detectado (id, tipo, descripcion, datos_json, sample_size, confianza, nivel_minimo, accion_recomendada, lote_nocturno)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  // 5a. Top 3 deals > 50% of total pipeline
  const pipeline = db
    .prepare(
      `SELECT p.id, p.titulo, p.valor_estimado, c.nombre AS cuenta,
              per.nombre AS ejecutivo
       FROM propuesta p
       LEFT JOIN cuenta c ON p.cuenta_id = c.id
       LEFT JOIN persona per ON p.ae_id = per.id
       WHERE p.etapa NOT IN ('completada','perdida','cancelada','borrador_agente')
         AND p.valor_estimado > 0
       ORDER BY p.valor_estimado DESC`,
    )
    .all() as any[];

  if (pipeline.length >= 5) {
    const totalValue = pipeline.reduce(
      (s: number, p: any) => s + (p.valor_estimado || 0),
      0,
    );
    const top3Value = pipeline
      .slice(0, 3)
      .reduce((s: number, p: any) => s + (p.valor_estimado || 0), 0);

    if (totalValue > 0 && top3Value / totalValue > 0.5) {
      const pct = Math.round((top3Value / totalValue) * 100);
      const top3Names = pipeline
        .slice(0, 3)
        .map((p: any) => p.titulo)
        .join(", ");
      const desc = `Top 3 propuestas representan ${pct}% del pipeline ($${(top3Value / 1e6).toFixed(1)}M de $${(totalValue / 1e6).toFixed(1)}M): ${top3Names}`;

      if (!isDuplicate(db, "concentracion_riesgo", desc)) {
        insert.run(
          genId(),
          "concentracion_riesgo",
          desc,
          JSON.stringify({
            top3_pct: pct,
            top3_value: top3Value,
            total_value: totalValue,
            pipeline_count: pipeline.length,
          }),
          pipeline.length,
          0.8,
          "vp",
          `Diversificar pipeline: generar propuestas mid-market para reducir concentracion`,
          lote,
        );
        count++;
      }
    }
  }

  // 5b. Single AE holds > 40% of team pipeline
  const byAe = db
    .prepare(
      `SELECT p.ae_id, per.nombre, per.reporta_a,
              SUM(p.valor_estimado) as valor_ae,
              COUNT(*) as num_props
       FROM propuesta p
       JOIN persona per ON p.ae_id = per.id
       WHERE p.etapa NOT IN ('completada','perdida','cancelada','borrador_agente')
         AND p.valor_estimado > 0
       GROUP BY p.ae_id`,
    )
    .all() as any[];

  // Group by manager to check team-level concentration
  const byManager: Record<string, { total: number; aes: any[] }> = {};
  for (const ae of byAe) {
    const mgr = ae.reporta_a || "none";
    if (!byManager[mgr]) byManager[mgr] = { total: 0, aes: [] };
    byManager[mgr].total += ae.valor_ae;
    byManager[mgr].aes.push(ae);
  }

  for (const [_mgr, team] of Object.entries(byManager)) {
    if (team.aes.length < 2) continue;
    for (const ae of team.aes) {
      const pct = Math.round((ae.valor_ae / team.total) * 100);
      if (pct > 40) {
        const desc = `${ae.nombre} concentra ${pct}% del pipeline de su equipo ($${(ae.valor_ae / 1e6).toFixed(1)}M de $${(team.total / 1e6).toFixed(1)}M)`;
        if (!isDuplicate(db, "concentracion_riesgo", desc)) {
          insert.run(
            genId(),
            "concentracion_riesgo",
            desc,
            JSON.stringify({
              ae: ae.nombre,
              ae_pct: pct,
              ae_value: ae.valor_ae,
              team_total: team.total,
            }),
            team.aes.length,
            0.7,
            "vp",
            `Key-person risk: distribuir cuentas o generar pipeline adicional en el equipo`,
            lote,
          );
          count++;
        }
      }
    }
  }

  return count;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export function detectCrossAgentPatterns(lote: string): {
  vertical: number;
  holding: number;
  inventory: number;
  winloss: number;
  concentration: number;
  total: number;
} {
  const db = getDatabase();

  // Deactivate stale patterns (>30 days)
  db.prepare(
    "UPDATE patron_detectado SET activo = 0 WHERE activo = 1 AND datetime(fecha_deteccion, '+30 days') < datetime('now')",
  ).run();

  const vertical = detectVerticalTrends(db, lote);
  const holding = detectHoldingMovements(db, lote);
  const inventory = detectInventoryConflicts(db, lote);
  const winloss = detectWinLossCorrelations(db, lote);
  const concentration = detectConcentrationRisk(db, lote);
  const total = vertical + holding + inventory + winloss + concentration;

  logger.info(
    { lote, vertical, holding, inventory, winloss, concentration, total },
    "Cross-agent patterns detected",
  );

  return { vertical, holding, inventory, winloss, concentration, total };
}
