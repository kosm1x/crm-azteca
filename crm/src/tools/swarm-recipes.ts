/**
 * Swarm Recipes — Predefined parallel query patterns
 *
 * Each recipe runs multiple existing tool handlers in parallel via Promise.allSettled,
 * then aggregates results into a combined JSON structure for LLM synthesis.
 *
 * Recipes call existing tool handlers directly (no extra inference calls).
 */

import type { ToolContext } from './index.js';
import {
  consultar_pipeline, consultar_cuota, consultar_actividades,
  consultar_descarga, consultar_inventario,
} from './consulta.js';
import { analizar_winloss, analizar_tendencias } from './analytics.js';
import { getDatabase } from '../db.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SwarmRecipe {
  id: string;
  nombre: string;
  descripcion: string;
  roles: Array<'gerente' | 'director' | 'vp'>;
  execute: (ctx: ToolContext, args: Record<string, unknown>) => Promise<SwarmResult>;
}

export interface SwarmResult {
  receta: string;
  resumen: string;
  datos: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeParse(jsonStr: string): unknown {
  try { return JSON.parse(jsonStr); }
  catch { return { error: 'parse_failed' }; }
}

async function runSafe(fn: () => string | Promise<string>, label: string): Promise<{ label: string; data: unknown }> {
  try {
    const result = await fn();
    return { label, data: safeParse(result) };
  } catch (err) {
    return { label, data: { error: String(err instanceof Error ? err.message : err) } };
  }
}

function formatMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

const MAX_RESULT_SIZE = 8192;

export function truncateResult(result: SwarmResult): SwarmResult {
  const json = JSON.stringify(result);
  if (json.length <= MAX_RESULT_SIZE) return result;

  const truncated: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(result.datos)) {
    const valStr = JSON.stringify(value);
    if (valStr.length > 2048) {
      truncated[key] = { _truncado: true, _bytes: valStr.length };
    } else {
      truncated[key] = value;
    }
  }
  return { ...result, datos: truncated };
}

function collectResults(results: PromiseSettledResult<{ label: string; data: unknown }>[]): Record<string, unknown> {
  const datos: Record<string, unknown> = {};
  for (const r of results) {
    if (r.status === 'fulfilled') datos[r.value.label] = r.value.data;
  }
  return datos;
}

// ---------------------------------------------------------------------------
// Recipe: resumen_semanal_equipo (gerente)
// ---------------------------------------------------------------------------

const resumenSemanalEquipo: SwarmRecipe = {
  id: 'resumen_semanal_equipo',
  nombre: 'Resumen semanal del equipo',
  descripcion: 'Pipeline + cuota + actividades + sentimiento del equipo, desglose por ejecutivo',
  roles: ['gerente'],
  async execute(ctx, _args) {
    const results = await Promise.allSettled([
      runSafe(() => consultar_pipeline({}, ctx), 'pipeline'),
      runSafe(() => consultar_cuota({}, ctx), 'cuota'),
      runSafe(() => consultar_actividades({ limite: 30 }, ctx), 'actividades'),
      runSafe(() => analizar_tendencias({ metrica: 'sentimiento', periodo_semanas: 4 }, ctx), 'sentimiento'),
      runSafe(() => analizar_winloss({ periodo_dias: 30 }, ctx), 'winloss'),
    ]);

    const datos = collectResults(results);
    const pipeline = datos.pipeline as any;
    const cuota = datos.cuota as any;
    const parts: string[] = [];

    if (pipeline?.total_propuestas != null) {
      parts.push(`Pipeline: ${pipeline.total_propuestas} propuestas, ${formatMoney(pipeline.valor_total || 0)}`);
    }
    if (cuota?.cuotas?.length) {
      const avg = cuota.cuotas.reduce((s: number, c: any) => s + (c.porcentaje || 0), 0) / cuota.cuotas.length;
      parts.push(`Cuota equipo: ${avg.toFixed(1)}%`);
    }

    return truncateResult({
      receta: 'resumen_semanal_equipo',
      resumen: parts.join(' | ') || 'Sin datos suficientes',
      datos,
    });
  },
};

// ---------------------------------------------------------------------------
// Recipe: diagnostico_persona (gerente, director)
// ---------------------------------------------------------------------------

const diagnosticoPersona: SwarmRecipe = {
  id: 'diagnostico_persona',
  nombre: 'Diagnóstico de un ejecutivo',
  descripcion: 'Pipeline + cuota + tendencias + actividades + sentimiento de una persona',
  roles: ['gerente', 'director'],
  async execute(ctx, args) {
    const nombre = args.persona_nombre as string;
    if (!nombre) {
      return { receta: 'diagnostico_persona', resumen: 'Error: se requiere persona_nombre', datos: { error: 'persona_nombre requerido' } };
    }

    const results = await Promise.allSettled([
      runSafe(() => consultar_pipeline({}, ctx), 'pipeline'),
      runSafe(() => consultar_cuota({ persona_nombre: nombre }, ctx), 'cuota'),
      runSafe(() => analizar_tendencias({ metrica: 'cuota', periodo_semanas: 8, persona_nombre: nombre }, ctx), 'tendencia_cuota'),
      runSafe(() => consultar_actividades({ limite: 20 }, ctx), 'actividades'),
      runSafe(() => analizar_tendencias({ metrica: 'sentimiento', periodo_semanas: 8, persona_nombre: nombre }, ctx), 'sentimiento'),
    ]);

    const datos = collectResults(results);
    const cuota = datos.cuota as any;
    const tendencia = datos.tendencia_cuota as any;
    const parts: string[] = [`Persona: ${nombre}`];
    if (cuota?.cuotas?.[0]) parts.push(`Cuota: ${cuota.cuotas[0].porcentaje}%`);
    if (tendencia?.direccion) parts.push(`Tendencia: ${tendencia.direccion}`);

    return truncateResult({ receta: 'diagnostico_persona', resumen: parts.join(' | '), datos });
  },
};

// ---------------------------------------------------------------------------
// Recipe: comparar_equipo (gerente, director)
// ---------------------------------------------------------------------------

const compararEquipo: SwarmRecipe = {
  id: 'comparar_equipo',
  nombre: 'Comparativa de ejecutivos',
  descripcion: 'Cuota + pipeline + actividad + win rate lado a lado para cada ejecutivo',
  roles: ['gerente', 'director'],
  async execute(ctx, _args) {
    const results = await Promise.allSettled([
      runSafe(() => consultar_pipeline({}, ctx), 'pipeline'),
      runSafe(() => consultar_cuota({}, ctx), 'cuota'),
      runSafe(() => consultar_actividades({ limite: 50 }, ctx), 'actividades'),
      runSafe(() => analizar_winloss({ periodo_dias: 60, agrupar_por: 'ejecutivo' }, ctx), 'winloss'),
    ]);

    const datos = collectResults(results);
    const cuota = datos.cuota as any;
    const winloss = datos.winloss as any;
    const parts: string[] = [];
    if (cuota?.cuotas?.length) parts.push(`${cuota.cuotas.length} ejecutivos`);
    if (winloss?.resumen) parts.push(`Win rate: ${winloss.resumen.tasa_conversion}%`);

    return truncateResult({ receta: 'comparar_equipo', resumen: parts.join(' | ') || 'Sin datos suficientes', datos });
  },
};

// ---------------------------------------------------------------------------
// Recipe: resumen_ejecutivo (vp)
// ---------------------------------------------------------------------------

const resumenEjecutivo: SwarmRecipe = {
  id: 'resumen_ejecutivo',
  nombre: 'Resumen ejecutivo organizacional',
  descripcion: 'Pipeline + cuota + win/loss + tendencias de cuota, pipeline y sentimiento a nivel org',
  roles: ['vp'],
  async execute(ctx, _args) {
    const results = await Promise.allSettled([
      runSafe(() => consultar_pipeline({}, ctx), 'pipeline'),
      runSafe(() => consultar_cuota({}, ctx), 'cuota'),
      runSafe(() => analizar_winloss({ periodo_dias: 30 }, ctx), 'winloss'),
      runSafe(() => analizar_tendencias({ metrica: 'cuota', periodo_semanas: 4 }, ctx), 'tendencia_cuota'),
      runSafe(() => analizar_tendencias({ metrica: 'pipeline', periodo_semanas: 4 }, ctx), 'tendencia_pipeline'),
      runSafe(() => analizar_tendencias({ metrica: 'sentimiento', periodo_semanas: 4 }, ctx), 'tendencia_sentimiento'),
    ]);

    const datos = collectResults(results);
    const pipeline = datos.pipeline as any;
    const cuota = datos.cuota as any;
    const winloss = datos.winloss as any;
    const parts: string[] = [];

    if (pipeline) parts.push(`Pipeline: ${formatMoney(pipeline.valor_total || 0)}`);
    if (cuota?.cuotas?.length) {
      const avg = cuota.cuotas.reduce((s: number, c: any) => s + (c.porcentaje || 0), 0) / cuota.cuotas.length;
      parts.push(`Cuota org: ${avg.toFixed(1)}%`);
    }
    if (winloss?.resumen) parts.push(`Win rate: ${winloss.resumen.tasa_conversion}%`);

    // Risk items
    const riesgos: string[] = [];
    if (pipeline?.propuestas) {
      const stalledMega = pipeline.propuestas.filter((p: any) => p.dias_sin_actividad >= 7 && p.es_mega);
      if (stalledMega.length > 0) riesgos.push(`${stalledMega.length} mega-deals estancados`);
    }
    if (cuota?.cuotas) {
      const below70 = cuota.cuotas.filter((c: any) => c.porcentaje < 70);
      if (below70.length > 0) riesgos.push(`${below70.length} personas debajo del 70% de cuota`);
    }
    if (riesgos.length) parts.push(`${riesgos.length} riesgos`);
    datos.riesgos = riesgos;

    return truncateResult({ receta: 'resumen_ejecutivo', resumen: parts.join(' | ') || 'Sin datos suficientes', datos });
  },
};

// ---------------------------------------------------------------------------
// Recipe: diagnostico_medio (director, vp)
// ---------------------------------------------------------------------------

const diagnosticoMedio: SwarmRecipe = {
  id: 'diagnostico_medio',
  nombre: 'Diagnóstico por medio',
  descripcion: 'Rendimiento por medio (tv_abierta, ctv, radio, digital): pipeline, descarga, inventario, win rate',
  roles: ['director', 'vp'],
  async execute(ctx, _args) {
    // Standard tool calls in parallel
    const results = await Promise.allSettled([
      runSafe(() => consultar_pipeline({}, ctx), 'pipeline'),
      runSafe(() => consultar_descarga({}, ctx), 'descarga'),
      runSafe(() => consultar_inventario({}, ctx), 'inventario'),
      runSafe(() => analizar_winloss({ periodo_dias: 90 }, ctx), 'winloss'),
    ]);

    const datos = collectResults(results);

    // Custom per-medio breakdown from propuesta.medios (JSON field not exposed by tools)
    try {
      const db = getDatabase();
      const medios = ['tv_abierta', 'ctv', 'radio', 'digital'];
      const medioPipeline: Record<string, { propuestas: number; valor: number }> = {};

      for (const m of medios) {
        const row = db.prepare(`
          SELECT COUNT(*) as cnt, COALESCE(SUM(valor_estimado), 0) as val
          FROM propuesta
          WHERE etapa NOT IN ('completada','perdida','cancelada')
            AND medios LIKE ?
        `).get(`%${m}%`) as any;
        medioPipeline[m] = { propuestas: row?.cnt || 0, valor: row?.val || 0 };
      }
      datos.pipeline_por_medio = medioPipeline;
    } catch { /* non-critical */ }

    const parts: string[] = ['Datos por medio: pipeline + descarga + inventario + win/loss'];
    const inv = datos.inventario as any;
    if (inv?.productos) {
      const medioSet = new Set(inv.productos.map((p: any) => p.medio));
      parts.push(`${medioSet.size} medios con inventario`);
    }

    return truncateResult({ receta: 'diagnostico_medio', resumen: parts.join(' | '), datos });
  },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const RECIPES: SwarmRecipe[] = [
  resumenSemanalEquipo,
  diagnosticoPersona,
  compararEquipo,
  resumenEjecutivo,
  diagnosticoMedio,
];

export function getRecipe(id: string): SwarmRecipe | undefined {
  return RECIPES.find(r => r.id === id);
}

export function getRecipesForRole(role: string): SwarmRecipe[] {
  return RECIPES.filter(r => r.roles.includes(role as any));
}
