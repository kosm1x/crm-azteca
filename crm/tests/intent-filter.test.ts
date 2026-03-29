/**
 * Intent-Based Tool Filtering Tests
 */

import { describe, it, expect } from "vitest";
import { filterToolsByIntent } from "../src/tools/intent-filter.js";
import type { ToolDefinition } from "../src/inference-adapter.js";

function makeTool(name: string): ToolDefinition {
  return {
    type: "function",
    function: {
      name,
      description: `Tool ${name}`,
      parameters: { type: "object", properties: {} },
    },
  };
}

const ALL_TOOLS = [
  // Core
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
  // Email
  "enviar_email_seguimiento",
  "confirmar_envio_email",
  "buscar_emails",
  "leer_email",
  "crear_borrador_email",
  // Pipeline/proposals
  "crear_propuesta",
  "actualizar_propuesta",
  "cerrar_propuesta",
  "construir_paquete",
  "comparar_paquetes",
  "consultar_oportunidades_inventario",
  "consultar_descarga",
  "actualizar_descarga",
  "consultar_actividades",
  // Intelligence
  "analizar_winloss",
  "analizar_tendencias",
  "recomendar_crosssell",
  "consultar_insights",
  "actuar_insight",
  // Drive
  "listar_archivos_drive",
  "leer_archivo_drive",
  "crear_documento_drive",
  "buscar_documentos",
  // Calendar
  "crear_evento_calendario",
  "consultar_agenda",
  "consultar_eventos",
  // Research
  "buscar_web",
  "investigar_prospecto",
  "consultar_clima",
  // Reporting
  "generar_grafica",
  "generar_link_dashboard",
  "ejecutar_swarm",
  // Approvals
  "solicitar_cuenta",
  "aprobar_registro",
  "rechazar_registro",
  "consultar_pendientes",
  // Relationships
  "registrar_relacion_ejecutiva",
  "consultar_salud_relaciones",
].map(makeTool);

describe("filterToolsByIntent", () => {
  it("returns full set for short messages", () => {
    const result = filterToolsByIntent(ALL_TOOLS, "hola");
    expect(result.length).toBe(ALL_TOOLS.length);
  });

  it("returns full set for empty message", () => {
    const result = filterToolsByIntent(ALL_TOOLS, "");
    expect(result.length).toBe(ALL_TOOLS.length);
  });

  it("includes core tools in every filtered result", () => {
    const result = filterToolsByIntent(
      ALL_TOOLS,
      "necesito enviar un correo de seguimiento al cliente",
    );
    const names = result.map((t) => t.function.name);
    expect(names).toContain("generar_briefing");
    expect(names).toContain("consultar_pipeline");
    expect(names).toContain("registrar_actividad");
  });

  it("filters to email tools for email-related message", () => {
    const result = filterToolsByIntent(
      ALL_TOOLS,
      "quiero enviar un correo de seguimiento al cliente",
    );
    const names = result.map((t) => t.function.name);
    expect(names).toContain("enviar_email_seguimiento");
    expect(names).toContain("buscar_emails");
    expect(names).not.toContain("analizar_winloss");
    expect(names).not.toContain("listar_archivos_drive");
    expect(result.length).toBeLessThan(ALL_TOOLS.length);
  });

  it("includes proposal tools for package-related messages", () => {
    const result = filterToolsByIntent(
      ALL_TOOLS,
      "ayudame a construir un paquete para Coca-Cola",
    );
    const names = result.map((t) => t.function.name);
    expect(names).toContain("construir_paquete");
    expect(names).toContain("comparar_paquetes");
    expect(names).toContain("consultar_oportunidades_inventario");
  });

  it("returns full set when no keywords match", () => {
    const result = filterToolsByIntent(
      ALL_TOOLS,
      "cuentame algo interesante sobre la vida en general",
    );
    expect(result.length).toBe(ALL_TOOLS.length);
  });

  it("matches multiple intent groups", () => {
    const result = filterToolsByIntent(
      ALL_TOOLS,
      "revisa mi pipeline y envia un correo al cliente sobre la propuesta",
    );
    const names = result.map((t) => t.function.name);
    // Pipeline tools
    expect(names).toContain("consultar_pipeline");
    expect(names).toContain("crear_propuesta");
    // Email tools
    expect(names).toContain("enviar_email_seguimiento");
    // Should NOT include unrelated groups
    expect(names).not.toContain("registrar_relacion_ejecutiva");
  });

  it("handles approval-related messages", () => {
    const result = filterToolsByIntent(
      ALL_TOOLS,
      "tengo pendientes por aprobar de mi equipo",
    );
    const names = result.map((t) => t.function.name);
    expect(names).toContain("aprobar_registro");
    expect(names).toContain("consultar_pendientes");
  });
});
