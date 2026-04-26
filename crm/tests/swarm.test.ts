/**
 * Swarm Tool Tests
 *
 * Tests ejecutar_swarm and recipe execution with in-memory SQLite + seed data.
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
const { ejecutar_swarm } = await import("../src/tools/swarm.js");
const { getToolsForRole } = await import("../src/tools/index.js");
const { getRecipe, getRecipesForRole, RECIPES, truncateResult } =
  await import("../src/tools/swarm-recipes.js");
const { getCurrentWeek: getCurrentWeekForTest, getMxYear } =
  await import("../src/tools/helpers.js");

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

function setupDb() {
  testDb = new Database(":memory:");
  sqliteVec.load(testDb);
  testDb.pragma("foreign_keys = ON");
  createCrmSchema(testDb);

  // Org chart: VP -> Director -> Gerente -> AE1, AE2
  testDb
    .prepare(
      `INSERT INTO persona (id, nombre, rol, activo) VALUES ('vp-001', 'Elena Ruiz', 'vp', 1)`,
    )
    .run();
  testDb
    .prepare(
      `INSERT INTO persona (id, nombre, rol, reporta_a, activo) VALUES ('dir-001', 'Roberto Diaz', 'director', 'vp-001', 1)`,
    )
    .run();
  testDb
    .prepare(
      `INSERT INTO persona (id, nombre, rol, reporta_a, activo) VALUES ('mgr-001', 'Ana Garcia', 'gerente', 'dir-001', 1)`,
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
}

function seedProposals() {
  const now = new Date().toISOString();
  const recent = new Date(Date.now() - 30 * 86400000).toISOString();

  testDb
    .prepare(
      `INSERT INTO cuenta (id, nombre, tipo, vertical, ae_id) VALUES ('c1', 'Coca-Cola', 'directo', 'bebidas', 'ae-001')`,
    )
    .run();
  testDb
    .prepare(
      `INSERT INTO cuenta (id, nombre, tipo, vertical, ae_id) VALUES ('c2', 'Bimbo', 'directo', 'alimentos', 'ae-002')`,
    )
    .run();

  // Active proposals
  testDb
    .prepare(
      `INSERT INTO propuesta (id, cuenta_id, ae_id, titulo, valor_estimado, medios, tipo_oportunidad, etapa, fecha_creacion, fecha_ultima_actividad, dias_sin_actividad)
    VALUES ('p1', 'c1', 'ae-001', 'TV Navidad', 10000000, '{"tv_abierta":7000000,"ctv":3000000}', 'estacional', 'en_negociacion', ?, ?, 3)`,
    )
    .run(recent, now);
  testDb
    .prepare(
      `INSERT INTO propuesta (id, cuenta_id, ae_id, titulo, valor_estimado, medios, tipo_oportunidad, etapa, fecha_creacion, fecha_ultima_actividad, dias_sin_actividad)
    VALUES ('p2', 'c2', 'ae-002', 'Digital Bimbo', 5000000, '{"digital":5000000}', 'lanzamiento', 'enviada', ?, ?, 10)`,
    )
    .run(recent, now);

  // Closed proposals
  testDb
    .prepare(
      `INSERT INTO propuesta (id, cuenta_id, ae_id, titulo, valor_estimado, tipo_oportunidad, etapa, fecha_creacion, fecha_ultima_actividad)
    VALUES ('p3', 'c1', 'ae-001', 'Radio Verano', 3000000, 'estacional', 'completada', ?, ?)`,
    )
    .run(recent, now);
  testDb
    .prepare(
      `INSERT INTO propuesta (id, cuenta_id, ae_id, titulo, valor_estimado, tipo_oportunidad, etapa, razon_perdida, fecha_creacion, fecha_ultima_actividad)
    VALUES ('p4', 'c2', 'ae-002', 'CTV Bimbo', 2000000, 'prospeccion', 'perdida', 'precio', ?, ?)`,
    )
    .run(recent, now);
}

function seedCuotas() {
  const year = getMxYear();
  const currentWeek = getCurrentWeekForTest();

  for (let w = Math.max(1, currentWeek - 3); w <= currentWeek; w++) {
    testDb
      .prepare(
        `INSERT INTO cuota (id, persona_id, rol, año, semana, meta_total, logro)
      VALUES (?, 'ae-001', 'ae', ?, ?, 5000000, ?)`,
      )
      .run(`q1-${w}`, year, w, 3500000 + w * 50000);
    testDb
      .prepare(
        `INSERT INTO cuota (id, persona_id, rol, año, semana, meta_total, logro)
      VALUES (?, 'ae-002', 'ae', ?, ?, 5000000, ?)`,
      )
      .run(`q2-${w}`, year, w, 4000000 - w * 50000);
  }
}

function seedActivities() {
  const now = new Date();
  for (let i = 0; i < 10; i++) {
    const date = new Date(now.getTime() - i * 2 * 86400000).toISOString();
    const sentimiento = ["positivo", "neutral", "negativo", "urgente"][i % 4];
    const tipo = ["llamada", "reunion", "email", "whatsapp"][i % 4];
    const aeId = i % 2 === 0 ? "ae-001" : "ae-002";
    testDb
      .prepare(
        `INSERT INTO actividad (id, ae_id, cuenta_id, tipo, resumen, sentimiento, fecha)
      VALUES (?, ?, 'c1', ?, ?, ?, ?)`,
      )
      .run(`act-${i}`, aeId, tipo, `Actividad ${i}`, sentimiento, date);
  }
}

function seedInventario() {
  testDb
    .prepare(
      `INSERT INTO inventario (id, medio, propiedad, formato, precio_referencia) VALUES ('inv1', 'tv_abierta', 'Canal Uno', 'Spot 20s', 50000)`,
    )
    .run();
  testDb
    .prepare(
      `INSERT INTO inventario (id, medio, propiedad, formato, precio_referencia) VALUES ('inv2', 'ctv', 'Azteca Play', 'Pre-roll', 30000)`,
    )
    .run();
  testDb
    .prepare(
      `INSERT INTO inventario (id, medio, propiedad, formato, precio_referencia) VALUES ('inv3', 'radio', 'Radio Fórmula', 'Spot 30s', 15000)`,
    )
    .run();
  testDb
    .prepare(
      `INSERT INTO inventario (id, medio, propiedad, formato, precio_referencia) VALUES ('inv4', 'digital', 'Web', 'Banner', 10000)`,
    )
    .run();
}

function makeCtx(rol: "ae" | "gerente" | "director" | "vp", personaId: string) {
  const teamMap: Record<string, string[]> = {
    "vp-001": ["dir-001"],
    "dir-001": ["mgr-001"],
    "mgr-001": ["ae-001", "ae-002"],
  };
  const fullTeamMap: Record<string, string[]> = {
    "vp-001": ["dir-001", "mgr-001", "ae-001", "ae-002"],
    "dir-001": ["mgr-001", "ae-001", "ae-002"],
    "mgr-001": ["ae-001", "ae-002"],
  };
  return {
    persona_id: personaId,
    rol,
    team_ids: teamMap[personaId] || [],
    full_team_ids: fullTeamMap[personaId] || [],
  };
}

function seedAll() {
  seedProposals();
  seedCuotas();
  seedActivities();
  seedInventario();
}

beforeEach(() => {
  setupDb();
  if (typeof _resetStatementCache === "function") _resetStatementCache();
});

afterEach(() => {
  testDb.close();
});

// ---------------------------------------------------------------------------
// Recipe registry
// ---------------------------------------------------------------------------

describe("recipe registry", () => {
  it("has 5 recipes", () => {
    expect(RECIPES.length).toBe(5);
  });

  it("getRecipe returns correct recipe by id", () => {
    const recipe = getRecipe("resumen_ejecutivo");
    expect(recipe).toBeDefined();
    expect(recipe!.id).toBe("resumen_ejecutivo");
    expect(recipe!.roles).toContain("vp");
  });

  it("getRecipe returns undefined for unknown recipe", () => {
    expect(getRecipe("nonexistent")).toBeUndefined();
  });

  it("getRecipesForRole returns correct recipes for gerente", () => {
    const recipes = getRecipesForRole("gerente");
    const ids = recipes.map((r) => r.id);
    expect(ids).toContain("resumen_semanal_equipo");
    expect(ids).toContain("diagnostico_persona");
    expect(ids).toContain("comparar_equipo");
    expect(ids).not.toContain("resumen_ejecutivo");
    expect(ids).not.toContain("diagnostico_medio");
  });

  it("getRecipesForRole returns correct recipes for vp", () => {
    const recipes = getRecipesForRole("vp");
    const ids = recipes.map((r) => r.id);
    expect(ids).toContain("resumen_ejecutivo");
    expect(ids).toContain("diagnostico_medio");
    expect(ids).not.toContain("resumen_semanal_equipo");
  });

  it("getRecipesForRole returns empty for ae", () => {
    const recipes = getRecipesForRole("ae");
    expect(recipes.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

describe("tool registration", () => {
  it("ejecutar_swarm appears in gerente tools", () => {
    const names = getToolsForRole("gerente").map((t) => t.function.name);
    expect(names).toContain("ejecutar_swarm");
  });

  it("ejecutar_swarm appears in director tools", () => {
    const names = getToolsForRole("director").map((t) => t.function.name);
    expect(names).toContain("ejecutar_swarm");
  });

  it("ejecutar_swarm appears in vp tools", () => {
    const names = getToolsForRole("vp").map((t) => t.function.name);
    expect(names).toContain("ejecutar_swarm");
  });

  it("ejecutar_swarm does NOT appear in ae tools", () => {
    const names = getToolsForRole("ae").map((t) => t.function.name);
    expect(names).not.toContain("ejecutar_swarm");
  });
});

// ---------------------------------------------------------------------------
// ejecutar_swarm — error handling
// ---------------------------------------------------------------------------

describe("ejecutar_swarm — error handling", () => {
  it("returns error when no receta provided", async () => {
    const ctx = makeCtx("gerente", "mgr-001");
    const result = JSON.parse(await ejecutar_swarm({}, ctx));
    expect(result.error).toContain("receta");
    expect(result.recetas_disponibles).toBeDefined();
  });

  it("returns error for unknown recipe", async () => {
    const ctx = makeCtx("gerente", "mgr-001");
    const result = JSON.parse(
      await ejecutar_swarm({ receta: "nonexistent" }, ctx),
    );
    expect(result.error).toContain("nonexistent");
    expect(result.recetas_disponibles).toBeDefined();
  });

  it("returns error when role not authorized for recipe", async () => {
    const ctx = makeCtx("gerente", "mgr-001");
    const result = JSON.parse(
      await ejecutar_swarm({ receta: "resumen_ejecutivo" }, ctx),
    );
    expect(result.error).toContain("no está disponible");
  });

  it("diagnostico_persona requires persona_nombre", async () => {
    seedAll();
    const ctx = makeCtx("gerente", "mgr-001");
    const result = JSON.parse(
      await ejecutar_swarm({ receta: "diagnostico_persona" }, ctx),
    );
    expect(result.resumen).toContain("Error");
  });
});

// ---------------------------------------------------------------------------
// resumen_semanal_equipo (gerente)
// ---------------------------------------------------------------------------

describe("resumen_semanal_equipo", () => {
  it("returns valid structure with data", async () => {
    seedAll();
    const ctx = makeCtx("gerente", "mgr-001");
    const result = JSON.parse(
      await ejecutar_swarm({ receta: "resumen_semanal_equipo" }, ctx),
    );
    expect(result.receta).toBe("resumen_semanal_equipo");
    expect(result.resumen).toBeTruthy();
    expect(result.datos).toBeDefined();
    expect(result.datos.pipeline).toBeDefined();
    expect(result.datos.cuota).toBeDefined();
  });

  it("returns gracefully with empty data", async () => {
    const ctx = makeCtx("gerente", "mgr-001");
    const result = JSON.parse(
      await ejecutar_swarm({ receta: "resumen_semanal_equipo" }, ctx),
    );
    expect(result.receta).toBe("resumen_semanal_equipo");
    expect(result.datos).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// diagnostico_persona (gerente, director)
// ---------------------------------------------------------------------------

describe("diagnostico_persona", () => {
  it("returns analysis for a specific person", async () => {
    seedAll();
    const ctx = makeCtx("gerente", "mgr-001");
    const result = JSON.parse(
      await ejecutar_swarm(
        { receta: "diagnostico_persona", persona_nombre: "Carlos Lopez" },
        ctx,
      ),
    );
    expect(result.receta).toBe("diagnostico_persona");
    expect(result.resumen).toContain("Carlos Lopez");
    expect(result.datos.cuota).toBeDefined();
    expect(result.datos.tendencia_cuota).toBeDefined();
    expect(result.datos.sentimiento).toBeDefined();
  });

  it("works for director role too", async () => {
    seedAll();
    const ctx = makeCtx("director", "dir-001");
    const result = JSON.parse(
      await ejecutar_swarm(
        { receta: "diagnostico_persona", persona_nombre: "Carlos Lopez" },
        ctx,
      ),
    );
    expect(result.receta).toBe("diagnostico_persona");
  });
});

// ---------------------------------------------------------------------------
// comparar_equipo (gerente, director)
// ---------------------------------------------------------------------------

describe("comparar_equipo", () => {
  it("returns team comparison data", async () => {
    seedAll();
    const ctx = makeCtx("gerente", "mgr-001");
    const result = JSON.parse(
      await ejecutar_swarm({ receta: "comparar_equipo" }, ctx),
    );
    expect(result.receta).toBe("comparar_equipo");
    expect(result.datos.pipeline).toBeDefined();
    expect(result.datos.cuota).toBeDefined();
    expect(result.datos.winloss).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// resumen_ejecutivo (vp)
// ---------------------------------------------------------------------------

describe("resumen_ejecutivo", () => {
  it("returns org-wide executive summary", async () => {
    seedAll();
    const ctx = makeCtx("vp", "vp-001");
    const result = JSON.parse(
      await ejecutar_swarm({ receta: "resumen_ejecutivo" }, ctx),
    );
    expect(result.receta).toBe("resumen_ejecutivo");
    expect(result.resumen).toBeTruthy();
    expect(result.datos.pipeline).toBeDefined();
    expect(result.datos.cuota).toBeDefined();
    expect(result.datos.winloss).toBeDefined();
    expect(result.datos.tendencia_cuota).toBeDefined();
    expect(result.datos.tendencia_pipeline).toBeDefined();
    expect(result.datos.tendencia_sentimiento).toBeDefined();
  });

  it("includes risk items", async () => {
    seedAll();
    const ctx = makeCtx("vp", "vp-001");
    const result = JSON.parse(
      await ejecutar_swarm({ receta: "resumen_ejecutivo" }, ctx),
    );
    expect(result.datos.riesgos).toBeDefined();
    expect(Array.isArray(result.datos.riesgos)).toBe(true);
  });

  it("not available for gerente", async () => {
    seedAll();
    const ctx = makeCtx("gerente", "mgr-001");
    const result = JSON.parse(
      await ejecutar_swarm({ receta: "resumen_ejecutivo" }, ctx),
    );
    expect(result.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// diagnostico_medio (director, vp)
// ---------------------------------------------------------------------------

describe("diagnostico_medio", () => {
  it("returns per-medio breakdown", async () => {
    seedAll();
    const ctx = makeCtx("vp", "vp-001");
    const result = JSON.parse(
      await ejecutar_swarm({ receta: "diagnostico_medio" }, ctx),
    );
    expect(result.receta).toBe("diagnostico_medio");
    expect(result.datos.pipeline).toBeDefined();
    expect(result.datos.inventario).toBeDefined();
    expect(result.datos.pipeline_por_medio).toBeDefined();
  });

  it("pipeline_por_medio has 4 medios", async () => {
    seedAll();
    const ctx = makeCtx("vp", "vp-001");
    const result = JSON.parse(
      await ejecutar_swarm({ receta: "diagnostico_medio" }, ctx),
    );
    const medios = Object.keys(result.datos.pipeline_por_medio || {});
    expect(medios).toContain("tv_abierta");
    expect(medios).toContain("ctv");
    expect(medios).toContain("radio");
    expect(medios).toContain("digital");
  });

  it("works for director role", async () => {
    seedAll();
    const ctx = makeCtx("director", "dir-001");
    const result = JSON.parse(
      await ejecutar_swarm({ receta: "diagnostico_medio" }, ctx),
    );
    expect(result.receta).toBe("diagnostico_medio");
  });

  it("not available for gerente", async () => {
    seedAll();
    const ctx = makeCtx("gerente", "mgr-001");
    const result = JSON.parse(
      await ejecutar_swarm({ receta: "diagnostico_medio" }, ctx),
    );
    expect(result.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// truncateResult
// ---------------------------------------------------------------------------

describe("truncateResult", () => {
  it("passes through small results unchanged", () => {
    const result = { receta: "test", resumen: "ok", datos: { a: 1 } };
    expect(truncateResult(result)).toEqual(result);
  });

  it("truncates large datos entries", () => {
    const bigData = "x".repeat(5000);
    const result = {
      receta: "test",
      resumen: "ok",
      datos: { big1: bigData, big2: bigData, small: "hello" },
    };
    const truncated = truncateResult(result);
    expect((truncated.datos.big1 as any)._truncado).toBe(true);
    expect((truncated.datos.big2 as any)._truncado).toBe(true);
    expect(truncated.datos.small).toBe("hello");
  });
});
