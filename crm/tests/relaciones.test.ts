/**
 * Relationship Tools Tests
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { createCrmSchema } from "../src/schema.js";

// Mock logger
const { noopLogger } = vi.hoisted(() => {
  const noop = () => {};
  const noopLogger: Record<string, unknown> = {
    info: noop,
    warn: noop,
    error: noop,
    debug: noop,
    child: () => noopLogger,
  };
  return { noopLogger };
});
vi.mock("../src/logger.js", () => ({ logger: noopLogger }));

let testDb: InstanceType<typeof Database>;
vi.mock("../src/db.js", () => ({ getDatabase: () => testDb }));

const {
  registrar_relacion_ejecutiva,
  registrar_interaccion_ejecutiva,
  consultar_salud_relaciones,
  consultar_historial_relacion,
  registrar_hito,
  consultar_hitos_proximos,
  actualizar_notas_estrategicas,
} = await import("../src/tools/relaciones.js");

const { _resetStatementCache } = await import("../src/hierarchy.js");

import type { ToolContext } from "../src/tools/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dirCtx(id = "dir1"): ToolContext {
  return {
    persona_id: id,
    rol: "director",
    team_ids: ["ger1"],
    full_team_ids: ["ger1", "ae1", "ae2"],
  };
}

function vpCtx(id = "vp1"): ToolContext {
  return {
    persona_id: id,
    rol: "vp",
    team_ids: ["dir1"],
    full_team_ids: ["dir1", "ger1", "ae1", "ae2"],
  };
}

function aeCtx(id = "ae1"): ToolContext {
  return { persona_id: id, rol: "ae", team_ids: [], full_team_ids: [] };
}

function setupDb() {
  testDb = new Database(":memory:");
  sqliteVec.load(testDb);
  testDb.pragma("foreign_keys = ON");
  createCrmSchema(testDb);
  _resetStatementCache();

  // Org chart
  testDb
    .prepare(
      "INSERT INTO persona VALUES (?, ?, ?, ?, NULL, NULL, NULL, NULL, 1)",
    )
    .run("vp1", "Elena VP", "vp", null);
  testDb
    .prepare(
      "INSERT INTO persona VALUES (?, ?, ?, ?, NULL, NULL, NULL, NULL, 1)",
    )
    .run("dir1", "Roberto Dir", "director", "vp1");
  testDb
    .prepare(
      "INSERT INTO persona VALUES (?, ?, ?, ?, NULL, NULL, NULL, NULL, 1)",
    )
    .run("ger1", "Miguel Ger", "gerente", "dir1");
  testDb
    .prepare(
      "INSERT INTO persona VALUES (?, ?, ?, ?, NULL, NULL, NULL, NULL, 1)",
    )
    .run("ae1", "Maria AE", "ae", "ger1");

  // Account + contact
  testDb
    .prepare("INSERT INTO cuenta (id, nombre, tipo) VALUES (?, ?, ?)")
    .run("cta1", "Coca-Cola", "directo");
  testDb
    .prepare(
      "INSERT INTO contacto (id, nombre, cuenta_id, rol, seniority) VALUES (?, ?, ?, ?, ?)",
    )
    .run("con1", "Juan Lopez", "cta1", "decisor", "director");
  testDb
    .prepare(
      "INSERT INTO contacto (id, nombre, cuenta_id, rol, seniority, fecha_nacimiento) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run("con2", "Ana Martinez", "cta1", "comprador", "senior", "1985-04-15");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("registrar_relacion_ejecutiva", () => {
  beforeEach(setupDb);
  afterEach(() => testDb?.close());

  it("creates relationship and marks contact as executive", async () => {
    const result = JSON.parse(
      await registrar_relacion_ejecutiva(
        { contacto_nombre: "Juan", tipo: "cliente", importancia: "alta" },
        dirCtx(),
      ),
    );
    expect(result.ok).toBe(true);
    expect(result.contacto).toBe("Juan Lopez");
    expect(result.warmth_score).toBe(50);

    const contact = testDb
      .prepare("SELECT es_ejecutivo FROM contacto WHERE id = 'con1'")
      .get() as any;
    expect(contact.es_ejecutivo).toBe(1);
  });

  it("rejects AE caller", async () => {
    const result = JSON.parse(
      await registrar_relacion_ejecutiva({ contacto_nombre: "Juan" }, aeCtx()),
    );
    expect(result.error).toContain("directores y VP");
  });

  it("prevents duplicate relationship", async () => {
    await registrar_relacion_ejecutiva({ contacto_nombre: "Juan" }, dirCtx());
    const result = JSON.parse(
      await registrar_relacion_ejecutiva({ contacto_nombre: "Juan" }, dirCtx()),
    );
    expect(result.error).toContain("Ya tienes");
  });

  it("auto-creates birthday milestone when fecha_nacimiento exists", async () => {
    await registrar_relacion_ejecutiva({ contacto_nombre: "Ana" }, dirCtx());
    const hito = testDb
      .prepare(
        "SELECT * FROM hito_contacto WHERE contacto_id = 'con2' AND tipo = 'cumpleanos'",
      )
      .get() as any;
    expect(hito).toBeDefined();
    expect(hito.recurrente).toBe(1);
    expect(hito.titulo).toContain("Ana Martinez");
  });
});

describe("registrar_interaccion_ejecutiva", () => {
  beforeEach(() => {
    setupDb();
    // Pre-create relationship
    testDb
      .prepare(
        "INSERT INTO relacion_ejecutiva (id, persona_id, contacto_id, tipo, importancia) VALUES (?, ?, ?, ?, ?)",
      )
      .run("rel1", "dir1", "con1", "cliente", "alta");
  });
  afterEach(() => testDb?.close());

  it("logs interaction and recomputes warmth", async () => {
    const result = JSON.parse(
      await registrar_interaccion_ejecutiva(
        {
          contacto_nombre: "Juan",
          resumen: "Comida en Polanco",
          tipo: "comida",
          calidad: "excepcional",
        },
        dirCtx(),
      ),
    );
    expect(result.ok).toBe(true);
    expect(result.warmth_score).toBeGreaterThan(0);
    expect(result.warmth_label).toBeDefined();
  });

  it("rejects when no relationship exists", async () => {
    const result = JSON.parse(
      await registrar_interaccion_ejecutiva(
        { contacto_nombre: "Ana", resumen: "Test" },
        dirCtx(),
      ),
    );
    expect(result.error).toContain("registrar_relacion_ejecutiva");
  });
});

describe("consultar_salud_relaciones", () => {
  beforeEach(() => {
    setupDb();
    testDb
      .prepare(
        "INSERT INTO relacion_ejecutiva (id, persona_id, contacto_id, tipo, importancia, warmth_score) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run("rel1", "dir1", "con1", "cliente", "alta", 75);
    testDb
      .prepare(
        "INSERT INTO relacion_ejecutiva (id, persona_id, contacto_id, tipo, importancia, warmth_score) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run("rel2", "dir1", "con2", "cliente", "media", 25);
  });
  afterEach(() => testDb?.close());

  it("returns all relationships sorted by warmth asc", async () => {
    const result = JSON.parse(await consultar_salud_relaciones({}, dirCtx()));
    expect(result.total).toBe(2);
    expect(result.relaciones[0].warmth_score).toBeLessThan(
      result.relaciones[1].warmth_score,
    );
  });

  it("filters by frias", async () => {
    const result = JSON.parse(
      await consultar_salud_relaciones({ filtro: "frias" }, dirCtx()),
    );
    expect(result.total).toBe(1);
    expect(result.relaciones[0].contacto).toBe("Ana Martinez");
  });

  it("VP sees all relationships", async () => {
    const result = JSON.parse(await consultar_salud_relaciones({}, vpCtx()));
    expect(result.total).toBe(2);
  });
});

describe("consultar_historial_relacion", () => {
  beforeEach(() => {
    setupDb();
    testDb
      .prepare(
        "INSERT INTO relacion_ejecutiva (id, persona_id, contacto_id, tipo, importancia, notas_estrategicas) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        "rel1",
        "dir1",
        "con1",
        "cliente",
        "critica",
        "Aliado clave para Q2",
      );
    testDb
      .prepare(
        "INSERT INTO interaccion_ejecutiva (id, relacion_id, tipo, resumen, calidad) VALUES (?, ?, ?, ?, ?)",
      )
      .run("int1", "rel1", "comida", "Comida en restaurante", "buena");
    testDb
      .prepare(
        "INSERT INTO hito_contacto (id, contacto_id, tipo, titulo, fecha) VALUES (?, ?, ?, ?, ?)",
      )
      .run(
        "hito1",
        "con1",
        "ascenso",
        "Ascendido a VP Marketing",
        "2026-02-01",
      );
  });
  afterEach(() => testDb?.close());

  it("returns full relationship detail", async () => {
    const result = JSON.parse(
      await consultar_historial_relacion({ contacto_nombre: "Juan" }, dirCtx()),
    );
    expect(result.contacto).toBe("Juan Lopez");
    expect(result.cuenta).toBe("Coca-Cola");
    expect(result.notas_estrategicas).toBe("Aliado clave para Q2");
    expect(result.interacciones).toHaveLength(1);
    expect(result.hitos).toHaveLength(1);
  });
});

describe("registrar_hito", () => {
  beforeEach(setupDb);
  afterEach(() => testDb?.close());

  it("creates a milestone", async () => {
    const result = JSON.parse(
      await registrar_hito(
        {
          contacto_nombre: "Juan",
          tipo: "ascenso",
          titulo: "Ascendido a CMO",
          fecha: "2026-04-01",
        },
        dirCtx(),
      ),
    );
    expect(result.ok).toBe(true);
    expect(result.tipo).toBe("ascenso");

    const hito = testDb
      .prepare("SELECT * FROM hito_contacto WHERE contacto_id = 'con1'")
      .get() as any;
    expect(hito.titulo).toBe("Ascendido a CMO");
  });
});

describe("consultar_hitos_proximos", () => {
  beforeEach(() => {
    setupDb();
    testDb
      .prepare(
        "INSERT INTO relacion_ejecutiva (id, persona_id, contacto_id, tipo, importancia) VALUES (?, ?, ?, ?, ?)",
      )
      .run("rel1", "dir1", "con1", "cliente", "alta");

    // Non-recurring hito 10 days from now
    const future = new Date(Date.now() + 10 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    testDb
      .prepare(
        "INSERT INTO hito_contacto (id, contacto_id, tipo, titulo, fecha) VALUES (?, ?, ?, ?, ?)",
      )
      .run("hito1", "con1", "renovacion", "Renovacion anual", future);
  });
  afterEach(() => testDb?.close());

  it("returns upcoming milestones", async () => {
    const result = JSON.parse(
      await consultar_hitos_proximos({ dias_adelante: 30 }, dirCtx()),
    );
    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(result.hitos[0].titulo).toBe("Renovacion anual");
    expect(result.hitos[0].dias_restantes).toBeLessThanOrEqual(10);
  });

  it("returns empty for no upcoming", async () => {
    const result = JSON.parse(
      await consultar_hitos_proximos({ dias_adelante: 1 }, dirCtx()),
    );
    expect(result.hitos).toHaveLength(0);
  });
});

describe("actualizar_notas_estrategicas", () => {
  beforeEach(() => {
    setupDb();
    testDb
      .prepare(
        "INSERT INTO relacion_ejecutiva (id, persona_id, contacto_id, tipo, importancia) VALUES (?, ?, ?, ?, ?)",
      )
      .run("rel1", "dir1", "con1", "cliente", "alta");
  });
  afterEach(() => testDb?.close());

  it("updates strategic notes", async () => {
    const result = JSON.parse(
      await actualizar_notas_estrategicas(
        { contacto_nombre: "Juan", notas: "Clave para cierre Q2" },
        dirCtx(),
      ),
    );
    expect(result.ok).toBe(true);

    const rel = testDb
      .prepare(
        "SELECT notas_estrategicas FROM relacion_ejecutiva WHERE id = 'rel1'",
      )
      .get() as any;
    expect(rel.notas_estrategicas).toBe("Clave para cierre Q2");
  });
});
