/**
 * Package Builder Tests
 *
 * Tests for:
 * - buildPackage: composition logic with historical mix, peer benchmark, inventory
 * - getEventInventoryDetails: event inventory parsing
 * - comparePackages: side-by-side comparison
 * - Tool handlers: construir_paquete, consultar_oportunidades_inventario, comparar_paquetes
 */

import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createCrmSchema } from "../src/schema.js";

let testDb: InstanceType<typeof Database>;
vi.mock("../src/db.js", () => ({
  getDatabase: () => testDb,
}));

const noop = () => {};
const noopLogger = {
  info: noop,
  warn: noop,
  error: noop,
  debug: noop,
  fatal: noop,
  child: () => noopLogger,
};
vi.mock("../src/logger.js", () => ({
  logger: noopLogger,
}));

vi.mock("../src/google-auth.js", () => ({
  isGoogleEnabled: () => false,
  getGmailClient: () => {
    throw new Error("Not configured");
  },
  getGmailReadClient: () => {
    throw new Error("Not configured");
  },
  getCalendarClient: () => {
    throw new Error("Not configured");
  },
  getCalendarReadClient: () => {
    throw new Error("Not configured");
  },
  getDriveClient: () => {
    throw new Error("Not configured");
  },
}));

const { _resetStatementCache } = await import("../src/hierarchy.js");
const { buildPackage, getEventInventoryDetails, comparePackages } =
  await import("../src/package-builder.js");
const {
  construir_paquete,
  consultar_oportunidades_inventario,
  comparar_paquetes,
} = await import("../src/tools/package-tools.js");

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------

function setupDb() {
  testDb = new Database(":memory:");
  sqliteVec.load(testDb);
  testDb.pragma("foreign_keys = ON");
  createCrmSchema(testDb);

  // Org chart
  testDb
    .prepare(
      `INSERT INTO persona (id, nombre, rol, activo) VALUES ('vp-001', 'Elena Ruiz', 'vp', 1)`,
    )
    .run();
  testDb
    .prepare(
      `INSERT INTO persona (id, nombre, rol, reporta_a, activo) VALUES ('mgr-001', 'Ana Garcia', 'gerente', 'vp-001', 1)`,
    )
    .run();
  testDb
    .prepare(
      `INSERT INTO persona (id, nombre, rol, reporta_a, activo) VALUES ('ae-001', 'Carlos Lopez', 'ae', 'mgr-001', 1)`,
    )
    .run();
  testDb
    .prepare(
      `INSERT INTO persona (id, nombre, rol, reporta_a, activo) VALUES ('ae-002', 'Maria Perez', 'ae', 'mgr-001', 1)`,
    )
    .run();

  // Accounts
  testDb
    .prepare(
      `INSERT INTO cuenta (id, nombre, tipo, vertical, ae_id, años_relacion, es_fundador) VALUES ('c1', 'Coca-Cola', 'directo', 'Consumo', 'ae-001', 5, 1)`,
    )
    .run();
  testDb
    .prepare(
      `INSERT INTO cuenta (id, nombre, tipo, vertical, ae_id, años_relacion, es_fundador) VALUES ('c2', 'Pepsi', 'directo', 'Consumo', 'ae-002', 3, 0)`,
    )
    .run();
  testDb
    .prepare(
      `INSERT INTO cuenta (id, nombre, tipo, vertical, ae_id, años_relacion) VALUES ('c3', 'Samsung', 'directo', 'Tecnologia', 'ae-001', 2)`,
    )
    .run();
}

function seedProposals() {
  const now = new Date().toISOString();
  const recent = new Date(Date.now() - 30 * 86400000).toISOString();

  // Coca-Cola: completed proposals with media mix
  testDb
    .prepare(
      `INSERT INTO propuesta (id, cuenta_id, ae_id, titulo, valor_estimado, tipo_oportunidad, etapa, medios, fecha_creacion, fecha_ultima_actividad)
       VALUES ('p1', 'c1', 'ae-001', 'Coca Verano TV', 8000000, 'estacional', 'completada', ?, ?, ?)`,
    )
    .run(
      JSON.stringify({
        tv_abierta: 5000000,
        radio: 2000000,
        digital: 1000000,
      }),
      recent,
      now,
    );

  testDb
    .prepare(
      `INSERT INTO propuesta (id, cuenta_id, ae_id, titulo, valor_estimado, tipo_oportunidad, etapa, medios, fecha_creacion, fecha_ultima_actividad)
       VALUES ('p2', 'c1', 'ae-001', 'Coca Copa', 12000000, 'tentpole', 'completada', ?, ?, ?)`,
    )
    .run(
      JSON.stringify({
        tv_abierta: 7000000,
        ctv: 3000000,
        digital: 2000000,
      }),
      recent,
      now,
    );

  // Pepsi: completed (for peer comparison)
  testDb
    .prepare(
      `INSERT INTO propuesta (id, cuenta_id, ae_id, titulo, valor_estimado, tipo_oportunidad, etapa, medios, fecha_creacion, fecha_ultima_actividad)
       VALUES ('p3', 'c2', 'ae-002', 'Pepsi Digital', 6000000, 'reforzamiento', 'completada', ?, ?, ?)`,
    )
    .run(
      JSON.stringify({
        ctv: 3000000,
        digital: 2000000,
        radio: 1000000,
      }),
      recent,
      now,
    );
}

function seedEvents() {
  const futureDate = new Date(Date.now() + 60 * 86400000)
    .toISOString()
    .slice(0, 10);
  const endDate = new Date(Date.now() + 75 * 86400000)
    .toISOString()
    .slice(0, 10);

  testDb
    .prepare(
      `INSERT INTO crm_events (id, nombre, tipo, fecha_inicio, fecha_fin, prioridad, meta_ingresos, ingresos_actual, inventario_total, inventario_vendido)
       VALUES ('ev1', 'Copa del Mundo 2026', 'deportivo', ?, ?, 'alta', 50000000, 35000000, ?, ?)`,
    )
    .run(
      futureDate,
      endDate,
      JSON.stringify({
        tv_abierta: 100,
        ctv: 200,
        radio: 150,
        digital: 300,
      }),
      JSON.stringify({ tv_abierta: 90, ctv: 80, radio: 50, digital: 100 }),
    );

  testDb
    .prepare(
      `INSERT INTO crm_events (id, nombre, tipo, fecha_inicio, fecha_fin, prioridad, meta_ingresos, ingresos_actual, inventario_total, inventario_vendido)
       VALUES ('ev2', 'Liga MX Apertura', 'deportivo', ?, ?, 'media', 20000000, 5000000, ?, ?)`,
    )
    .run(
      futureDate,
      endDate,
      JSON.stringify({ tv_abierta: 50, ctv: 100, radio: 80 }),
      JSON.stringify({ tv_abierta: 10, ctv: 20, radio: 10 }),
    );
}

function seedInventario() {
  testDb
    .prepare(
      `INSERT INTO inventario (id, medio, propiedad, formato, precio_referencia, precio_piso)
       VALUES ('inv1', 'tv_abierta', 'Canal 5', 'spot_30s', 500000, 350000)`,
    )
    .run();
  testDb
    .prepare(
      `INSERT INTO inventario (id, medio, propiedad, formato, precio_referencia, precio_piso)
       VALUES ('inv2', 'ctv', 'ViX', 'pre_roll', 200000, 150000)`,
    )
    .run();
  testDb
    .prepare(
      `INSERT INTO inventario (id, medio, propiedad, formato, precio_referencia, precio_piso)
       VALUES ('inv3', 'radio', 'W Radio', 'spot_20s', 50000, 30000)`,
    )
    .run();
  testDb
    .prepare(
      `INSERT INTO inventario (id, medio, propiedad, formato, precio_referencia, precio_piso)
       VALUES ('inv4', 'digital', 'Programmatic', 'banner', 100000, 70000)`,
    )
    .run();
}

const ctx = {
  persona_id: "ae-001",
  rol: "ae" as const,
  team_ids: [],
  full_team_ids: [],
};

beforeEach(() => {
  setupDb();
  _resetStatementCache();
});

afterEach(() => {
  testDb?.close();
});

// ---------------------------------------------------------------------------
// buildPackage — core logic
// ---------------------------------------------------------------------------

describe("buildPackage", () => {
  it("returns structured result with account info", () => {
    seedProposals();
    seedInventario();
    const result = buildPackage(testDb, "c1");
    expect(result.cuenta).toBe("Coca-Cola");
    expect(result.vertical).toBe("Consumo");
    expect(result.paquete_principal).toBeDefined();
    expect(result.paquete_principal.items.length).toBeGreaterThan(0);
    expect(result.razonamiento).toBeTruthy();
  });

  it("generates primary + 2 alternatives", () => {
    seedProposals();
    seedInventario();
    const result = buildPackage(testDb, "c1");
    expect(result.alternativa_menor).toBeDefined();
    expect(result.alternativa_mayor).toBeDefined();
    expect(result.alternativa_menor!.presupuesto_total).toBeLessThan(
      result.paquete_principal.presupuesto_total,
    );
    expect(result.alternativa_mayor!.presupuesto_total).toBeGreaterThan(
      result.paquete_principal.presupuesto_total,
    );
  });

  it("alternatives are ±20% of primary budget", () => {
    seedProposals();
    seedInventario();
    const result = buildPackage(testDb, "c1", {
      presupuesto_objetivo: 10_000_000,
    });
    expect(result.paquete_principal.presupuesto_total).toBe(10_000_000);
    expect(result.alternativa_menor!.presupuesto_total).toBe(8_000_000);
    expect(result.alternativa_mayor!.presupuesto_total).toBe(12_000_000);
  });

  it("uses explicit budget when provided", () => {
    seedProposals();
    seedInventario();
    const result = buildPackage(testDb, "c1", {
      presupuesto_objetivo: 5_000_000,
    });
    expect(result.paquete_principal.presupuesto_total).toBe(5_000_000);
  });

  it("item percentages sum to 100", () => {
    seedProposals();
    seedInventario();
    const result = buildPackage(testDb, "c1");
    const total = result.paquete_principal.items.reduce(
      (s, i) => s + i.porcentaje,
      0,
    );
    expect(total).toBe(100);
  });

  it("item montos sum to budget", () => {
    seedProposals();
    seedInventario();
    const result = buildPackage(testDb, "c1", {
      presupuesto_objetivo: 10_000_000,
    });
    const total = result.paquete_principal.items.reduce(
      (s, i) => s + i.monto,
      0,
    );
    expect(total).toBe(10_000_000);
  });

  it("respects medios_excluir", () => {
    seedProposals();
    seedInventario();
    const result = buildPackage(testDb, "c1", {
      medios_excluir: ["radio", "digital"],
    });
    const medios = result.paquete_principal.items.map((i) => i.medio);
    expect(medios).not.toContain("radio");
    expect(medios).not.toContain("digital");
  });

  it("includes all medios when no exclusions", () => {
    seedProposals();
    seedInventario();
    const result = buildPackage(testDb, "c1");
    const medios = result.paquete_principal.items.map((i) => i.medio);
    expect(medios.length).toBeGreaterThanOrEqual(2);
  });

  it("includes event name in reasoning when evento provided", () => {
    seedProposals();
    seedEvents();
    seedInventario();
    const result = buildPackage(testDb, "c1", {
      evento_nombre: "Copa del Mundo",
    });
    expect(result.razonamiento).toContain("Copa del Mundo");
  });

  it("throws for non-existent account", () => {
    expect(() => buildPackage(testDb, "non-existent")).toThrow(
      "Cuenta no encontrada",
    );
  });

  it("works for account with no history (equal split)", () => {
    seedInventario();
    const result = buildPackage(testDb, "c3");
    expect(result.paquete_principal.items.length).toBe(4);
    // Equal split: each should be ~25%
    for (const item of result.paquete_principal.items) {
      expect(item.porcentaje).toBeGreaterThanOrEqual(20);
      expect(item.porcentaje).toBeLessThanOrEqual(30);
    }
  });

  it("adjusts for scarce TV inventory (shifts to CTV)", () => {
    seedProposals();
    seedInventario();
    // Copa del Mundo has TV at 90/100 = 90% sold = 10% available (scarce)
    seedEvents();
    const resultWithEvent = buildPackage(testDb, "c1", {
      evento_nombre: "Copa del Mundo",
      presupuesto_objetivo: 10_000_000,
    });
    const resultNoEvent = buildPackage(testDb, "c1", {
      presupuesto_objetivo: 10_000_000,
    });

    const tvWithEvent =
      resultWithEvent.paquete_principal.items.find(
        (i) => i.medio === "tv_abierta",
      )?.porcentaje ?? 0;
    const tvNoEvent =
      resultNoEvent.paquete_principal.items.find(
        (i) => i.medio === "tv_abierta",
      )?.porcentaje ?? 0;

    // TV should be reduced when event has scarce TV inventory
    expect(tvWithEvent).toBeLessThan(tvNoEvent);
  });

  it("each item has a razon string", () => {
    seedProposals();
    seedInventario();
    const result = buildPackage(testDb, "c1");
    for (const item of result.paquete_principal.items) {
      expect(item.razon).toBeTruthy();
      expect(typeof item.razon).toBe("string");
    }
  });
});

// ---------------------------------------------------------------------------
// getEventInventoryDetails
// ---------------------------------------------------------------------------

describe("getEventInventoryDetails", () => {
  beforeEach(() => {
    seedEvents();
  });

  it("returns event metadata and inventory breakdown", () => {
    const result = getEventInventoryDetails(testDb, "Copa del Mundo");
    expect(result).not.toBeNull();
    expect(result!.evento.nombre).toBe("Copa del Mundo 2026");
    expect(result!.inventario.length).toBe(4);
  });

  it("calculates disponible_pct correctly", () => {
    const result = getEventInventoryDetails(testDb, "Copa del Mundo")!;
    const tv = result.inventario.find((i) => i.medio === "tv_abierta")!;
    expect(tv.total).toBe(100);
    expect(tv.vendido).toBe(90);
    expect(tv.disponible).toBe(10);
    expect(tv.disponible_pct).toBe(10);
  });

  it("returns null for non-existent event", () => {
    const result = getEventInventoryDetails(testDb, "Evento Inexistente");
    expect(result).toBeNull();
  });

  it("handles fuzzy matching", () => {
    const result = getEventInventoryDetails(testDb, "Copa");
    expect(result).not.toBeNull();
    expect(result!.evento.nombre).toBe("Copa del Mundo 2026");
  });

  it("includes revenue metadata", () => {
    const result = getEventInventoryDetails(testDb, "Copa")!;
    expect(result.evento.meta_ingresos).toBe(50000000);
    expect(result.evento.ingresos_actual).toBe(35000000);
  });
});

// ---------------------------------------------------------------------------
// comparePackages
// ---------------------------------------------------------------------------

describe("comparePackages", () => {
  it("compares two packages side by side", () => {
    const configA = {
      presupuesto_total: 10_000_000,
      items: [
        {
          medio: "tv_abierta",
          porcentaje: 60,
          monto: 6_000_000,
          razon: "test",
        },
        { medio: "digital", porcentaje: 40, monto: 4_000_000, razon: "test" },
      ],
    };
    const configB = {
      presupuesto_total: 8_000_000,
      items: [
        {
          medio: "tv_abierta",
          porcentaje: 40,
          monto: 3_200_000,
          razon: "test",
        },
        { medio: "ctv", porcentaje: 30, monto: 2_400_000, razon: "test" },
        { medio: "digital", porcentaje: 30, monto: 2_400_000, razon: "test" },
      ],
    };

    const result = comparePackages([
      { label: "Paquete A", config: configA },
      { label: "Paquete B", config: configB },
    ]);

    expect(result.medios.length).toBe(3); // tv_abierta, digital, ctv
    expect(result.totales.length).toBe(2);
    expect(result.totales[0].presupuesto_total).toBe(10_000_000);
    expect(result.totales[1].presupuesto_total).toBe(8_000_000);
  });

  it("sorts medios by largest difference", () => {
    const configA = {
      presupuesto_total: 10_000_000,
      items: [
        {
          medio: "tv_abierta",
          porcentaje: 50,
          monto: 5_000_000,
          razon: "test",
        },
        { medio: "digital", porcentaje: 50, monto: 5_000_000, razon: "test" },
      ],
    };
    const configB = {
      presupuesto_total: 10_000_000,
      items: [
        {
          medio: "tv_abierta",
          porcentaje: 20,
          monto: 2_000_000,
          razon: "test",
        },
        { medio: "digital", porcentaje: 45, monto: 4_500_000, razon: "test" },
        { medio: "ctv", porcentaje: 35, monto: 3_500_000, razon: "test" },
      ],
    };

    const result = comparePackages([
      { label: "A", config: configA },
      { label: "B", config: configB },
    ]);

    // ctv has biggest diff (35 vs 0 = 35), then tv_abierta (50 vs 20 = 30), then digital (50 vs 45 = 5)
    expect(result.medios[0].medio).toBe("ctv");
    expect(result.medios[0].max_diff_pct).toBe(35);
    expect(result.medios[1].medio).toBe("tv_abierta");
    expect(result.medios[1].max_diff_pct).toBe(30);
  });

  it("handles three packages", () => {
    const config = {
      presupuesto_total: 5_000_000,
      items: [
        {
          medio: "tv_abierta",
          porcentaje: 100,
          monto: 5_000_000,
          razon: "test",
        },
      ],
    };

    const result = comparePackages([
      { label: "A", config },
      { label: "B", config },
      { label: "C", config },
    ]);

    expect(result.totales.length).toBe(3);
    expect(result.medios[0].paquetes.length).toBe(3);
  });

  it("shows 0% for medios missing from a package", () => {
    const configA = {
      presupuesto_total: 10_000_000,
      items: [
        {
          medio: "tv_abierta",
          porcentaje: 100,
          monto: 10_000_000,
          razon: "test",
        },
      ],
    };
    const configB = {
      presupuesto_total: 10_000_000,
      items: [
        { medio: "ctv", porcentaje: 100, monto: 10_000_000, razon: "test" },
      ],
    };

    const result = comparePackages([
      { label: "A", config: configA },
      { label: "B", config: configB },
    ]);

    const tv = result.medios.find((m) => m.medio === "tv_abierta")!;
    expect(tv.paquetes[0].porcentaje).toBe(100); // A has 100%
    expect(tv.paquetes[1].porcentaje).toBe(0); // B has 0%
  });
});

// ---------------------------------------------------------------------------
// Tool handler: construir_paquete
// ---------------------------------------------------------------------------

describe("construir_paquete handler", () => {
  it("returns JSON with package for valid account", () => {
    seedProposals();
    seedInventario();
    const raw = construir_paquete({ cuenta_nombre: "Coca-Cola" }, ctx);
    const result = JSON.parse(raw);
    expect(result.error).toBeUndefined();
    expect(result.cuenta).toBe("Coca-Cola");
    expect(result.paquete_principal).toBeDefined();
    expect(result.alternativa_menor).toBeDefined();
    expect(result.alternativa_mayor).toBeDefined();
  });

  it("returns error for unknown account", () => {
    const raw = construir_paquete({ cuenta_nombre: "NoExiste" }, ctx);
    const result = JSON.parse(raw);
    expect(result.error).toContain("NoExiste");
  });

  it("accepts presupuesto_objetivo", () => {
    seedProposals();
    seedInventario();
    const raw = construir_paquete(
      { cuenta_nombre: "Coca", presupuesto_objetivo: 15_000_000 },
      ctx,
    );
    const result = JSON.parse(raw);
    expect(result.paquete_principal.presupuesto_total).toBe(15_000_000);
  });

  it("accepts evento_nombre", () => {
    seedProposals();
    seedEvents();
    seedInventario();
    const raw = construir_paquete(
      { cuenta_nombre: "Coca", evento_nombre: "Copa" },
      ctx,
    );
    const result = JSON.parse(raw);
    expect(result.razonamiento).toContain("Copa");
  });

  it("accepts medios_excluir", () => {
    seedProposals();
    seedInventario();
    const raw = construir_paquete(
      { cuenta_nombre: "Coca", medios_excluir: ["radio"] },
      ctx,
    );
    const result = JSON.parse(raw);
    const medios = result.paquete_principal.items.map((i: any) => i.medio);
    expect(medios).not.toContain("radio");
  });

  it("uses fuzzy account name matching", () => {
    seedProposals();
    seedInventario();
    const raw = construir_paquete({ cuenta_nombre: "Coca" }, ctx);
    const result = JSON.parse(raw);
    expect(result.cuenta).toBe("Coca-Cola");
  });

  it("blocks access to accounts owned by another AE", () => {
    seedProposals();
    seedInventario();
    const otherCtx = {
      persona_id: "ae-002",
      rol: "ae" as const,
      team_ids: [],
      full_team_ids: [],
    };
    const raw = construir_paquete({ cuenta_nombre: "Coca-Cola" }, otherCtx);
    const result = JSON.parse(raw);
    expect(result.error).toBeDefined();
    expect(result.error).toContain("no tienes acceso");
  });

  it("gerente can access accounts of team members", () => {
    seedProposals();
    seedInventario();
    const mgrCtx = {
      persona_id: "mgr-001",
      rol: "gerente" as const,
      team_ids: ["ae-001", "ae-002"],
      full_team_ids: ["ae-001", "ae-002"],
    };
    const raw = construir_paquete({ cuenta_nombre: "Coca-Cola" }, mgrCtx);
    const result = JSON.parse(raw);
    expect(result.error).toBeUndefined();
    expect(result.cuenta).toBe("Coca-Cola");
  });
});

// ---------------------------------------------------------------------------
// Tool handler: consultar_oportunidades_inventario
// ---------------------------------------------------------------------------

describe("consultar_oportunidades_inventario handler", () => {
  beforeEach(() => {
    seedEvents();
  });

  it("returns enriched inventory with sell-through analysis", () => {
    const raw = consultar_oportunidades_inventario(
      { evento_nombre: "Copa del Mundo" },
      ctx,
    );
    const result = JSON.parse(raw);
    expect(result.error).toBeUndefined();
    expect(result.evento.nombre).toBe("Copa del Mundo 2026");
    expect(result.inventario.length).toBe(4);
  });

  it("classifies inventory state correctly", () => {
    const raw = consultar_oportunidades_inventario(
      { evento_nombre: "Copa del Mundo" },
      ctx,
    );
    const result = JSON.parse(raw);

    // TV: 90/100 sold = 10% available → escaso
    const tv = result.inventario.find((i: any) => i.medio === "tv_abierta");
    expect(tv.estado).toBe("escaso");
    expect(tv.sell_through_pct).toBe(90);

    // Digital: 100/300 sold = 67% available → disponible
    const digital = result.inventario.find((i: any) => i.medio === "digital");
    expect(digital.estado).toBe("disponible");
  });

  it("includes revenue progress summary", () => {
    const raw = consultar_oportunidades_inventario(
      { evento_nombre: "Copa" },
      ctx,
    );
    const result = JSON.parse(raw);
    expect(result.resumen.revenue_progress_pct).toBe(70); // 35M/50M
    expect(result.resumen.medios_escasos).toContain("tv_abierta");
  });

  it("returns error for unknown event", () => {
    const raw = consultar_oportunidades_inventario(
      { evento_nombre: "NoExiste" },
      ctx,
    );
    const result = JSON.parse(raw);
    expect(result.error).toContain("NoExiste");
  });

  it("event with ample inventory shows no scarce medios", () => {
    const raw = consultar_oportunidades_inventario(
      { evento_nombre: "Liga MX" },
      ctx,
    );
    const result = JSON.parse(raw);
    expect(result.resumen.medios_escasos.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tool handler: comparar_paquetes
// ---------------------------------------------------------------------------

describe("comparar_paquetes handler", () => {
  it("compares two valid packages", () => {
    const paqueteA = {
      presupuesto_total: 10_000_000,
      items: [
        {
          medio: "tv_abierta",
          porcentaje: 60,
          monto: 6_000_000,
          razon: "reach",
        },
        {
          medio: "digital",
          porcentaje: 40,
          monto: 4_000_000,
          razon: "targeting",
        },
      ],
    };
    const paqueteB = {
      presupuesto_total: 8_000_000,
      items: [
        {
          medio: "tv_abierta",
          porcentaje: 50,
          monto: 4_000_000,
          razon: "reach",
        },
        {
          medio: "ctv",
          porcentaje: 50,
          monto: 4_000_000,
          razon: "digital reach",
        },
      ],
    };

    const raw = comparar_paquetes(
      { paquete_a: paqueteA, paquete_b: paqueteB },
      ctx,
    );
    const result = JSON.parse(raw);
    expect(result.error).toBeUndefined();
    expect(result.medios.length).toBe(3); // tv, digital, ctv
    expect(result.totales.length).toBe(2);
  });

  it("returns error without both packages", () => {
    const raw = comparar_paquetes({ paquete_a: null, paquete_b: null }, ctx);
    const result = JSON.parse(raw);
    expect(result.error).toContain("paquete_a");
  });

  it("accepts optional third package", () => {
    const pkg = {
      presupuesto_total: 5_000_000,
      items: [
        {
          medio: "tv_abierta",
          porcentaje: 100,
          monto: 5_000_000,
          razon: "test",
        },
      ],
    };

    const raw = comparar_paquetes(
      { paquete_a: pkg, paquete_b: pkg, paquete_c: pkg },
      ctx,
    );
    const result = JSON.parse(raw);
    expect(result.totales.length).toBe(3);
  });
});
