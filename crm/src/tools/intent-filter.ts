/**
 * Intent-Based Tool Filtering
 *
 * Categorizes tools into groups and selects relevant ones based on
 * keyword matching against the user's message. Reduces tools per inference
 * call from ~51 (AE) to ~15-20, saving tokens and improving LLM accuracy.
 *
 * Safety: falls back to full set for short messages, no-match, or
 * when filtering produces < 8 tools.
 */

import type { ToolDefinition } from "../inference-adapter.js";

const CORE_TOOLS = new Set([
  "generar_briefing",
  "registrar_actividad",
  "consultar_pipeline",
  "consultar_cuenta",
  "consultar_cuentas",
  "consultar_cuota",
  "guardar_observacion",
  "buscar_memoria",
  "actualizar_perfil",
  "establecer_recordatorio",
]);

const TOOL_GROUPS: Record<string, Set<string>> = {
  email: new Set([
    "enviar_email_seguimiento",
    "confirmar_envio_email",
    "enviar_email_briefing",
    "buscar_emails",
    "leer_email",
    "crear_borrador_email",
  ]),
  calendar: new Set([
    "crear_evento_calendario",
    "consultar_agenda",
    "establecer_recordatorio",
    "consultar_eventos",
  ]),
  pipeline: new Set([
    "crear_propuesta",
    "actualizar_propuesta",
    "cerrar_propuesta",
    "consultar_pipeline",
    "consultar_descarga",
    "actualizar_descarga",
    "consultar_actividades",
  ]),
  proposals: new Set([
    "crear_propuesta",
    "actualizar_propuesta",
    "cerrar_propuesta",
    "construir_paquete",
    "consultar_oportunidades_inventario",
    "comparar_paquetes",
  ]),
  intelligence: new Set([
    "analizar_winloss",
    "analizar_tendencias",
    "recomendar_crosssell",
    "consultar_insights",
    "actuar_insight",
    "consultar_inventario",
    "consultar_inventario_evento",
  ]),
  drive: new Set([
    "listar_archivos_drive",
    "leer_archivo_drive",
    "crear_documento_drive",
    "buscar_documentos",
  ]),
  research: new Set([
    "buscar_web",
    "investigar_prospecto",
    "consultar_clima",
    "convertir_moneda",
    "consultar_feriados",
  ]),
  reporting: new Set([
    "generar_grafica",
    "generar_link_dashboard",
    "consultar_resumen_dia",
    "consultar_sentimiento_equipo",
    "ejecutar_swarm",
  ]),
  approvals: new Set([
    "solicitar_cuenta",
    "solicitar_contacto",
    "impugnar_registro",
    "aprobar_registro",
    "rechazar_registro",
    "consultar_pendientes",
  ]),
  relationships: new Set([
    "registrar_relacion_ejecutiva",
    "registrar_interaccion_ejecutiva",
    "consultar_salud_relaciones",
    "consultar_historial_relacion",
    "registrar_hito",
    "consultar_hitos_proximos",
    "actualizar_notas_estrategicas",
  ]),
  insights_admin: new Set([
    "consultar_insights_equipo",
    "revisar_borrador",
    "modificar_borrador",
    "consultar_patrones",
    "desactivar_patron",
    "consultar_feedback",
    "generar_reporte_aprendizaje",
  ]),
  memory: new Set([
    "guardar_observacion",
    "buscar_memoria",
    "reflexionar_memoria",
  ]),
};

const INTENT_KEYWORDS: Record<string, string[]> = {
  email: ["email", "correo", "mail", "enviar correo", "reenviar", "gmail"],
  calendar: [
    "calendario",
    "agenda",
    "cita",
    "reunion",
    "recordatorio",
    "agendar",
  ],
  pipeline: [
    "pipeline",
    "funnel",
    "etapa",
    "descarga",
    "actividad",
    "actividades",
  ],
  proposals: [
    "propuesta",
    "paquete",
    "presupuesto",
    "cotizacion",
    "negociacion",
    "construir",
    "armar",
    "inventario",
  ],
  intelligence: [
    "insight",
    "analisis",
    "tendencia",
    "crosssell",
    "cross-sell",
    "winloss",
    "win loss",
    "recomend",
  ],
  drive: [
    "drive",
    "documento",
    "archivo",
    "presentacion",
    "slides",
    "hoja de calculo",
  ],
  research: ["buscar", "investigar", "prospecto", "web", "clima", "dolar"],
  reporting: ["reporte", "grafica", "dashboard", "resumen", "equipo", "swarm"],
  approvals: [
    "aprobar",
    "rechazar",
    "solicitar",
    "pendiente",
    "impugnar",
    "cuenta nueva",
    "contacto nuevo",
  ],
  relationships: ["relacion", "ejecutiv", "warmth", "hito", "notas estrategic"],
  insights_admin: ["borrador", "patron", "feedback", "aprendizaje"],
  memory: ["observacion", "memoria", "reflexion", "recuerdo"],
};

/**
 * Filter tools based on user message intent.
 * Always includes CORE_TOOLS. Adds groups whose keywords appear in the message.
 * Falls back to full tool set if no intent detected or filtering too aggressive.
 */
export function filterToolsByIntent(
  allTools: ToolDefinition[],
  userMessage: string,
): ToolDefinition[] {
  const normalized = userMessage.toLowerCase().trim();
  if (normalized.length < 10) return allTools;

  const matchedGroups = new Set<string>();
  for (const [group, keywords] of Object.entries(INTENT_KEYWORDS)) {
    for (const kw of keywords) {
      if (normalized.includes(kw)) {
        matchedGroups.add(group);
        break;
      }
    }
  }

  if (matchedGroups.size === 0) return allTools;

  const allowed = new Set(CORE_TOOLS);
  for (const group of matchedGroups) {
    const tools = TOOL_GROUPS[group];
    if (tools) {
      for (const t of tools) allowed.add(t);
    }
  }

  const filtered = allTools.filter((t) => allowed.has(t.function.name));

  // Safety: if filtering reduced too aggressively, return full set
  if (filtered.length < 8) return allTools;

  return filtered;
}
