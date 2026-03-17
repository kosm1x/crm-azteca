/**
 * Package Builder Tools
 *
 * construir_paquete — build optimized media package for account/event
 * consultar_oportunidades_inventario — available event inventory with sell-through %
 * comparar_paquetes — side-by-side comparison of configurations
 */

import { getDatabase } from "../db.js";
import {
  buildPackage,
  getEventInventoryDetails,
  comparePackages,
} from "../package-builder.js";
import type { PackageConfig } from "../package-builder.js";
import type { ToolContext } from "./index.js";

// ---------------------------------------------------------------------------
// construir_paquete
// ---------------------------------------------------------------------------

export function construir_paquete(
  args: Record<string, unknown>,
  _ctx: ToolContext,
): string {
  const db = getDatabase();
  const cuentaNombre = args.cuenta_nombre as string;

  // Fuzzy match account by name
  const cuenta = db
    .prepare("SELECT id, nombre FROM cuenta WHERE nombre LIKE ?")
    .get(`%${cuentaNombre}%`) as any;

  if (!cuenta) {
    return JSON.stringify({
      error: `No encontre la cuenta "${cuentaNombre}".`,
    });
  }

  try {
    const result = buildPackage(db, cuenta.id, {
      presupuesto_objetivo: args.presupuesto_objetivo as number | undefined,
      evento_nombre: args.evento_nombre as string | undefined,
      medios_excluir: args.medios_excluir as string[] | undefined,
    });

    return JSON.stringify(result);
  } catch (err: any) {
    return JSON.stringify({ error: err.message });
  }
}

// ---------------------------------------------------------------------------
// consultar_oportunidades_inventario
// ---------------------------------------------------------------------------

export function consultar_oportunidades_inventario(
  args: Record<string, unknown>,
  _ctx: ToolContext,
): string {
  const db = getDatabase();
  const eventoNombre = args.evento_nombre as string;

  const result = getEventInventoryDetails(db, eventoNombre);
  if (!result) {
    return JSON.stringify({
      error: `No encontre el evento "${eventoNombre}".`,
    });
  }

  // Enrich with sell-through analysis
  const analisis = result.inventario.map((inv) => ({
    ...inv,
    sell_through_pct: 100 - inv.disponible_pct,
    estado:
      inv.disponible_pct < 15
        ? "escaso"
        : inv.disponible_pct < 40
          ? "limitado"
          : "disponible",
  }));

  const revenueProgress =
    result.evento.meta_ingresos > 0
      ? Math.round(
          (result.evento.ingresos_actual / result.evento.meta_ingresos) * 100,
        )
      : null;

  return JSON.stringify({
    evento: result.evento,
    inventario: analisis,
    resumen: {
      revenue_progress_pct: revenueProgress,
      medios_escasos: analisis
        .filter((a) => a.estado === "escaso")
        .map((a) => a.medio),
      medios_disponibles: analisis
        .filter((a) => a.estado === "disponible")
        .map((a) => a.medio),
    },
  });
}

// ---------------------------------------------------------------------------
// comparar_paquetes
// ---------------------------------------------------------------------------

export function comparar_paquetes(
  args: Record<string, unknown>,
  _ctx: ToolContext,
): string {
  const configs: Array<{ label: string; config: PackageConfig }> = [];

  const paqueteA = args.paquete_a as PackageConfig | undefined;
  const paqueteB = args.paquete_b as PackageConfig | undefined;
  const paqueteC = args.paquete_c as PackageConfig | undefined;

  if (!paqueteA || !paqueteB) {
    return JSON.stringify({
      error: "Se requieren al menos paquete_a y paquete_b para comparar.",
    });
  }

  configs.push({ label: "Paquete A", config: paqueteA });
  configs.push({ label: "Paquete B", config: paqueteB });
  if (paqueteC) {
    configs.push({ label: "Paquete C", config: paqueteC });
  }

  try {
    const result = comparePackages(configs);
    return JSON.stringify(result);
  } catch (err: any) {
    return JSON.stringify({ error: err.message });
  }
}
