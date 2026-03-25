/**
 * Prospect Research Tool — Sequential Sales Intelligence Pipeline
 *
 * Runs a structured multi-step research pipeline on a prospect account:
 *   1. Web search for company profile + recent news
 *   2. Extract key data points (vertical, size, decision-makers, media spend)
 *   3. Cross-reference against CRM data (existing account? past proposals?)
 *   4. Score prospect readiness and generate talking points
 *
 * This is NOT an agent — it's a mechanical pipeline that uses web search
 * and CRM data to produce structured intelligence. The LLM in the agent
 * runner synthesizes the final output from the raw data collected here.
 */

import { getDatabase } from "../db.js";
import type { ToolContext } from "./index.js";
import { findCuentaId } from "./helpers.js";

const BRAVE_URL = "https://api.search.brave.com/res/v1/web/search";

// ---------------------------------------------------------------------------
// Internal: web search helper (reuses Brave API like buscar_web)
// ---------------------------------------------------------------------------

async function searchWeb(
  query: string,
  limit = 5,
): Promise<Array<{ title: string; url: string; description: string }>> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY || "";
  if (!apiKey) return [];

  const url = `${BRAVE_URL}?q=${encodeURIComponent(query)}&count=${limit}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": apiKey,
      },
      signal: controller.signal,
    });
    if (!res.ok) return [];

    const data = (await res.json()) as {
      web?: {
        results?: Array<{
          title: string;
          url: string;
          description: string;
        }>;
      };
    };
    return (data.web?.results ?? []).slice(0, limit);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Internal: CRM data lookup
// ---------------------------------------------------------------------------

interface CrmContext {
  existing_account: boolean;
  cuenta_id: string | null;
  cuenta_nombre: string | null;
  vertical: string | null;
  ae_nombre: string | null;
  active_proposals: number;
  total_historical_value: number;
  last_activity_date: string | null;
  days_since_activity: number | null;
  relationship_years: number | null;
}

function lookupCrmData(companyName: string, ctx: ToolContext): CrmContext {
  const db = getDatabase();
  const cuentaId = findCuentaId(companyName, ctx);

  if (!cuentaId) {
    return {
      existing_account: false,
      cuenta_id: null,
      cuenta_nombre: null,
      vertical: null,
      ae_nombre: null,
      active_proposals: 0,
      total_historical_value: 0,
      last_activity_date: null,
      days_since_activity: null,
      relationship_years: null,
    };
  }

  const account = db
    .prepare(
      `SELECT c.id, c.nombre, c.vertical, c.años_relacion,
              p2.nombre AS ae_nombre
       FROM cuenta c
       LEFT JOIN persona p2 ON c.ae_id = p2.id
       WHERE c.id = ?`,
    )
    .get(cuentaId) as any;

  const proposals = db
    .prepare(
      `SELECT COUNT(*) AS active,
              COALESCE(SUM(valor_estimado), 0) AS total_value
       FROM propuesta
       WHERE cuenta_id = ? AND etapa NOT IN ('completada','perdida','cancelada','borrador_agente')`,
    )
    .get(cuentaId) as any;

  const totalHistorical = db
    .prepare(
      `SELECT COALESCE(SUM(valor_estimado), 0) AS total
       FROM propuesta
       WHERE cuenta_id = ?`,
    )
    .get(cuentaId) as any;

  const lastActivity = db
    .prepare(
      `SELECT fecha,
              CAST(julianday('now') - julianday(fecha) AS INTEGER) AS days_ago
       FROM actividad
       WHERE cuenta_id = ?
       ORDER BY fecha DESC
       LIMIT 1`,
    )
    .get(cuentaId) as any;

  return {
    existing_account: true,
    cuenta_id: cuentaId,
    cuenta_nombre: account?.nombre ?? companyName,
    vertical: account?.vertical ?? null,
    ae_nombre: account?.ae_nombre ?? null,
    active_proposals: proposals?.active ?? 0,
    total_historical_value: totalHistorical?.total ?? 0,
    last_activity_date: lastActivity?.fecha ?? null,
    days_since_activity: lastActivity?.days_ago ?? null,
    relationship_years: account?.años_relacion ?? null,
  };
}

// ---------------------------------------------------------------------------
// Prospect readiness scoring
// ---------------------------------------------------------------------------

interface ProspectScore {
  score: number; // 0-100
  factors: string[];
  recommendation: string;
}

function scoreProspect(crm: CrmContext, webResults: number): ProspectScore {
  let score = 50; // Base score
  const factors: string[] = [];

  // CRM relationship signals
  if (crm.existing_account) {
    score += 10;
    factors.push("Cuenta existente en CRM (+10)");

    if (crm.active_proposals > 0) {
      score += 15;
      factors.push(`${crm.active_proposals} propuesta(s) activa(s) (+15)`);
    }

    if (crm.days_since_activity != null) {
      if (crm.days_since_activity <= 14) {
        score += 10;
        factors.push("Actividad reciente <14 días (+10)");
      } else if (crm.days_since_activity >= 60) {
        score -= 10;
        factors.push(`Sin actividad ${crm.days_since_activity} días (-10)`);
      }
    }

    if (crm.total_historical_value > 1_000_000) {
      score += 10;
      factors.push("Alto valor histórico >$1M (+10)");
    }

    if (crm.relationship_years != null && crm.relationship_years >= 3) {
      score += 5;
      factors.push(`Relación ${crm.relationship_years} años (+5)`);
    }
  } else {
    factors.push("Cuenta nueva — no existe en CRM (base)");
  }

  // Web presence signals
  if (webResults >= 5) {
    score += 5;
    factors.push("Buena presencia web (+5)");
  } else if (webResults <= 1) {
    score -= 5;
    factors.push("Poca presencia web (-5)");
  }

  score = Math.max(0, Math.min(100, score));

  let recommendation: string;
  if (score >= 80) {
    recommendation =
      "ALTA PRIORIDAD — Contactar esta semana. Cuenta madura con señales fuertes.";
  } else if (score >= 60) {
    recommendation =
      "MEDIA PRIORIDAD — Agendar follow-up. Hay oportunidad pero necesita desarrollo.";
  } else if (score >= 40) {
    recommendation =
      "EXPLORAR — Investigar más antes de invertir tiempo. Señales mixtas.";
  } else {
    recommendation =
      "BAJA PRIORIDAD — Monitorear. No hay señales claras de oportunidad inmediata.";
  }

  return { score, factors, recommendation };
}

// ---------------------------------------------------------------------------
// Main tool handler
// ---------------------------------------------------------------------------

export async function investigar_prospecto(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  const empresa = args.empresa as string;
  if (!empresa) {
    return JSON.stringify({
      error:
        'Se requiere el parámetro "empresa" (nombre de la empresa a investigar)',
    });
  }

  const vertical = (args.vertical as string) || "";
  const enfoque = (args.enfoque as string) || "general";

  // Step 1: Parallel web searches
  const searchQueries = [
    `"${empresa}" empresa México`,
    `"${empresa}" ${vertical || "publicidad medios"} noticias recientes`,
    `"${empresa}" directivos CEO CMO marketing`,
  ];

  if (enfoque === "competitivo") {
    searchQueries.push(`"${empresa}" competidores mercado participación`);
  } else if (enfoque === "financiero") {
    searchQueries.push(`"${empresa}" ingresos revenue inversión publicitaria`);
  }

  const searchResults = await Promise.all(
    searchQueries.map((q) => searchWeb(q, 5)),
  );

  const allResults = searchResults.flat();
  const uniqueResults = allResults.filter(
    (r, i, arr) => arr.findIndex((x) => x.url === r.url) === i,
  );

  // Step 2: CRM data lookup
  const crmData = lookupCrmData(empresa, ctx);

  // Step 3: Score prospect
  const scoring = scoreProspect(crmData, uniqueResults.length);

  // Step 4: Assemble structured intelligence report
  return JSON.stringify({
    empresa,
    fecha_investigacion: new Date().toISOString().split("T")[0],
    enfoque,

    // Web intelligence
    inteligencia_web: {
      total_resultados: uniqueResults.length,
      fuentes: uniqueResults.slice(0, 10).map((r) => ({
        titulo: r.title,
        url: r.url,
        descripcion: r.description,
      })),
    },

    // CRM context
    contexto_crm: {
      cuenta_existente: crmData.existing_account,
      cuenta_nombre: crmData.cuenta_nombre,
      vertical: crmData.vertical,
      ejecutivo_asignado: crmData.ae_nombre,
      propuestas_activas: crmData.active_proposals,
      valor_historico_total: crmData.total_historical_value,
      ultima_actividad: crmData.last_activity_date,
      dias_sin_actividad: crmData.days_since_activity,
      años_relacion: crmData.relationship_years,
    },

    // Scoring
    evaluacion: {
      score: scoring.score,
      nivel:
        scoring.score >= 80
          ? "ALTA"
          : scoring.score >= 60
            ? "MEDIA"
            : scoring.score >= 40
              ? "EXPLORAR"
              : "BAJA",
      factores: scoring.factors,
      recomendacion: scoring.recommendation,
    },

    // Prompt for the LLM to synthesize
    instruccion_sintesis:
      "Con esta información, genera un briefing ejecutivo para el Ejecutivo de Cuenta. " +
      "Incluye: (1) Perfil de la empresa, (2) Oportunidades identificadas, " +
      "(3) Decision-makers potenciales, (4) Talking points sugeridos, " +
      "(5) Siguiente acción recomendada. Basa todo en los datos reales de la búsqueda.",
  });
}
