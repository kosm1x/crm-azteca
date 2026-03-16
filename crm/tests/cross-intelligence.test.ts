/**
 * Cross-Agent Intelligence Tests
 */

import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createCrmSchema } from "../src/schema.js";

let testDb: InstanceType<typeof Database>;
vi.mock("../src/db.js", () => ({ getDatabase: () => testDb }));
const noop = () => {};
const noopLogger = {
  info: noop,
  warn: noop,
  error: noop,
  debug: noop,
  fatal: noop,
  child: () => noopLogger,
};
vi.mock("../src/logger.js", () => ({ logger: noopLogger }));
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

const { detectCrossAgentPatterns } =
  await import("../src/cross-intelligence.js");
const { _resetStatementCache } = await import("../src/hierarchy.js");
const { consultar_patrones, desactivar_patron } =
  await import("../src/tools/pattern-tools.js");

function seedTeam(db: InstanceType<typeof Database>) {
  db.prepare(
    "INSERT INTO persona (id, nombre, rol, reporta_a, whatsapp_group_folder, activo) VALUES ('vp1', 'VP', 'vp', NULL, 'vp-f', 1)",
  ).run();
  db.prepare(
    "INSERT INTO persona (id, nombre, rol, reporta_a, whatsapp_group_folder, activo) VALUES ('dir1', 'Director', 'director', 'vp1', 'dir-f', 1)",
  ).run();
  db.prepare(
    "INSERT INTO persona (id, nombre, rol, reporta_a, whatsapp_group_folder, activo) VALUES ('ger1', 'Gerente', 'gerente', 'dir1', 'ger-f', 1)",
  ).run();
  db.prepare(
    "INSERT INTO persona (id, nombre, rol, reporta_a, whatsapp_group_folder, activo) VALUES ('ae1', 'AE One', 'ae', 'ger1', 'ae1-f', 1)",
  ).run();
  db.prepare(
    "INSERT INTO persona (id, nombre, rol, reporta_a, whatsapp_group_folder, activo) VALUES ('ae2', 'AE Two', 'ae', 'ger1', 'ae2-f', 1)",
  ).run();
  db.prepare(
    "INSERT INTO persona (id, nombre, rol, reporta_a, whatsapp_group_folder, activo) VALUES ('ae3', 'AE Three', 'ae', 'ger1', 'ae3-f', 1)",
  ).run();
}

function makeCtx(
  personaId: string,
  rol: "ae" | "gerente" | "director" | "vp",
  teamIds: string[] = [],
  fullTeamIds: string[] = [],
) {
  return {
    persona_id: personaId,
    rol,
    team_ids: teamIds,
    full_team_ids: fullTeamIds,
  };
}

beforeEach(() => {
  testDb = new Database(":memory:");
  sqliteVec.load(testDb);
  testDb.pragma("foreign_keys = ON");
  createCrmSchema(testDb);
  _resetStatementCache();
  seedTeam(testDb);
});

describe("patron_detectado schema", () => {
  it("table exists with correct columns", () => {
    const cols = testDb
      .prepare("PRAGMA table_info(patron_detectado)")
      .all()
      .map((c: any) => c.name);
    expect(cols).toContain("tipo");
    expect(cols).toContain("nivel_minimo");
    expect(cols).toContain("confianza");
    expect(cols).toContain("activo");
  });

  it("rejects invalid tipo", () => {
    expect(() =>
      testDb
        .prepare(
          "INSERT INTO patron_detectado (id, tipo, descripcion, nivel_minimo) VALUES ('x', 'magic', 'D', 'vp')",
        )
        .run(),
    ).toThrow(/CHECK/);
  });

  it("rejects invalid nivel_minimo", () => {
    expect(() =>
      testDb
        .prepare(
          "INSERT INTO patron_detectado (id, tipo, descripcion, nivel_minimo) VALUES ('x', 'concentracion_riesgo', 'D', 'ceo')",
        )
        .run(),
    ).toThrow(/CHECK/);
  });
});

describe("detectCrossAgentPatterns", () => {
  it("runs without errors on empty database", () => {
    const result = detectCrossAgentPatterns("2026-03-16");
    expect(result.total).toBe(0);
  });

  it("detects inventory conflicts", () => {
    // Two AEs targeting the same gancho_temporal
    testDb
      .prepare(
        "INSERT INTO cuenta (id, nombre, tipo, ae_id, estado) VALUES ('c1', 'Brand A', 'directo', 'ae1', 'activo')",
      )
      .run();
    testDb
      .prepare(
        "INSERT INTO cuenta (id, nombre, tipo, ae_id, estado) VALUES ('c2', 'Brand B', 'directo', 'ae2', 'activo')",
      )
      .run();
    testDb
      .prepare(
        "INSERT INTO propuesta (id, cuenta_id, ae_id, titulo, valor_estimado, gancho_temporal, etapa) VALUES ('p1', 'c1', 'ae1', 'Copa A', 5000000, 'Copa del Mundo', 'en_negociacion')",
      )
      .run();
    testDb
      .prepare(
        "INSERT INTO propuesta (id, cuenta_id, ae_id, titulo, valor_estimado, gancho_temporal, etapa) VALUES ('p2', 'c2', 'ae2', 'Copa B', 3000000, 'Copa del Mundo', 'enviada')",
      )
      .run();

    const result = detectCrossAgentPatterns("2026-03-16");
    expect(result.inventory).toBeGreaterThanOrEqual(1);

    const patterns = testDb
      .prepare(
        "SELECT * FROM patron_detectado WHERE tipo = 'conflicto_inventario'",
      )
      .all();
    expect(patterns.length).toBeGreaterThanOrEqual(1);
  });

  it("detects win/loss correlations", () => {
    // 3 AEs with same loss reason
    testDb
      .prepare(
        "INSERT INTO cuenta (id, nombre, tipo, ae_id, estado) VALUES ('c1', 'A', 'directo', 'ae1', 'activo')",
      )
      .run();
    testDb
      .prepare(
        "INSERT INTO cuenta (id, nombre, tipo, ae_id, estado) VALUES ('c2', 'B', 'directo', 'ae2', 'activo')",
      )
      .run();
    testDb
      .prepare(
        "INSERT INTO cuenta (id, nombre, tipo, ae_id, estado) VALUES ('c3', 'C', 'directo', 'ae3', 'activo')",
      )
      .run();

    for (let i = 1; i <= 3; i++) {
      testDb
        .prepare(
          `INSERT INTO propuesta (id, cuenta_id, ae_id, titulo, valor_estimado, etapa, razon_perdida, fecha_creacion)
         VALUES (?, ?, ?, 'Lost', 5000000, 'perdida', 'precio', datetime('now'))`,
        )
        .run(`loss${i}`, `c${i}`, `ae${i}`);
    }

    const result = detectCrossAgentPatterns("2026-03-16");
    expect(result.winloss).toBeGreaterThanOrEqual(1);
  });

  it("detects concentration risk (top 3 > 50%)", () => {
    testDb
      .prepare(
        "INSERT INTO cuenta (id, nombre, tipo, ae_id, estado) VALUES ('c1', 'Big', 'directo', 'ae1', 'activo')",
      )
      .run();

    // 3 mega deals + 5 small ones
    for (let i = 1; i <= 3; i++) {
      testDb
        .prepare(
          `INSERT INTO propuesta (id, cuenta_id, ae_id, titulo, valor_estimado, etapa) VALUES (?, 'c1', 'ae1', 'Mega ${i}', 20000000, 'en_negociacion')`,
        )
        .run(`mega${i}`);
    }
    for (let i = 1; i <= 5; i++) {
      testDb
        .prepare(
          `INSERT INTO propuesta (id, cuenta_id, ae_id, titulo, valor_estimado, etapa) VALUES (?, 'c1', 'ae1', 'Small ${i}', 1000000, 'en_preparacion')`,
        )
        .run(`small${i}`);
    }

    const result = detectCrossAgentPatterns("2026-03-16");
    expect(result.concentration).toBeGreaterThanOrEqual(1);
  });

  it("deduplicates patterns within 7 days", () => {
    testDb
      .prepare(
        "INSERT INTO cuenta (id, nombre, tipo, ae_id, estado) VALUES ('c1', 'A', 'directo', 'ae1', 'activo')",
      )
      .run();
    testDb
      .prepare(
        "INSERT INTO cuenta (id, nombre, tipo, ae_id, estado) VALUES ('c2', 'B', 'directo', 'ae2', 'activo')",
      )
      .run();
    testDb
      .prepare(
        "INSERT INTO propuesta (id, cuenta_id, ae_id, titulo, valor_estimado, gancho_temporal, etapa) VALUES ('p1', 'c1', 'ae1', 'X', 5000000, 'Event', 'enviada')",
      )
      .run();
    testDb
      .prepare(
        "INSERT INTO propuesta (id, cuenta_id, ae_id, titulo, valor_estimado, gancho_temporal, etapa) VALUES ('p2', 'c2', 'ae2', 'Y', 3000000, 'Event', 'enviada')",
      )
      .run();

    detectCrossAgentPatterns("2026-03-16");
    const first = (
      testDb.prepare("SELECT COUNT(*) as c FROM patron_detectado").get() as any
    ).c;
    detectCrossAgentPatterns("2026-03-16");
    const second = (
      testDb.prepare("SELECT COUNT(*) as c FROM patron_detectado").get() as any
    ).c;
    expect(second).toBe(first);
  });
});

describe("consultar_patrones", () => {
  it("AE cannot access", () => {
    const result = JSON.parse(consultar_patrones({}, makeCtx("ae1", "ae")));
    expect(result.error).toContain("Solo gerentes");
  });

  it("gerente sees gerente-level patterns", () => {
    testDb
      .prepare(
        "INSERT INTO patron_detectado (id, tipo, descripcion, nivel_minimo, activo) VALUES ('p1', 'correlacion_winloss', 'Test', 'gerente', 1)",
      )
      .run();
    testDb
      .prepare(
        "INSERT INTO patron_detectado (id, tipo, descripcion, nivel_minimo, activo) VALUES ('p2', 'concentracion_riesgo', 'VP only', 'vp', 1)",
      )
      .run();

    const result = JSON.parse(
      consultar_patrones({}, makeCtx("ger1", "gerente", ["ae1", "ae2"])),
    );
    expect(result.total).toBe(1); // only gerente-level, not VP
    expect(result.patrones[0].tipo).toBe("correlacion_winloss");
  });

  it("director sees gerente + director patterns", () => {
    testDb
      .prepare(
        "INSERT INTO patron_detectado (id, tipo, descripcion, nivel_minimo, activo) VALUES ('p1', 'correlacion_winloss', 'Coaching', 'gerente', 1)",
      )
      .run();
    testDb
      .prepare(
        "INSERT INTO patron_detectado (id, tipo, descripcion, nivel_minimo, activo) VALUES ('p2', 'conflicto_inventario', 'Allocation', 'director', 1)",
      )
      .run();
    testDb
      .prepare(
        "INSERT INTO patron_detectado (id, tipo, descripcion, nivel_minimo, activo) VALUES ('p3', 'concentracion_riesgo', 'VP only', 'vp', 1)",
      )
      .run();

    const result = JSON.parse(
      consultar_patrones(
        {},
        makeCtx("dir1", "director", ["ger1"], ["ger1", "ae1", "ae2"]),
      ),
    );
    expect(result.total).toBe(2); // gerente + director, not VP
  });

  it("VP sees all patterns", () => {
    testDb
      .prepare(
        "INSERT INTO patron_detectado (id, tipo, descripcion, nivel_minimo, activo) VALUES ('p1', 'correlacion_winloss', 'A', 'gerente', 1)",
      )
      .run();
    testDb
      .prepare(
        "INSERT INTO patron_detectado (id, tipo, descripcion, nivel_minimo, activo) VALUES ('p2', 'conflicto_inventario', 'B', 'director', 1)",
      )
      .run();
    testDb
      .prepare(
        "INSERT INTO patron_detectado (id, tipo, descripcion, nivel_minimo, activo) VALUES ('p3', 'concentracion_riesgo', 'C', 'vp', 1)",
      )
      .run();

    const result = JSON.parse(consultar_patrones({}, makeCtx("vp1", "vp")));
    expect(result.total).toBe(3);
  });

  it("filters by tipo", () => {
    testDb
      .prepare(
        "INSERT INTO patron_detectado (id, tipo, descripcion, nivel_minimo, activo) VALUES ('p1', 'correlacion_winloss', 'A', 'gerente', 1)",
      )
      .run();
    testDb
      .prepare(
        "INSERT INTO patron_detectado (id, tipo, descripcion, nivel_minimo, activo) VALUES ('p2', 'conflicto_inventario', 'B', 'director', 1)",
      )
      .run();

    const result = JSON.parse(
      consultar_patrones(
        { tipo: "correlacion_winloss" },
        makeCtx("dir1", "director", ["ger1"], ["ger1", "ae1"]),
      ),
    );
    expect(result.total).toBe(1);
  });
});

describe("desactivar_patron", () => {
  it("director can deactivate", () => {
    testDb
      .prepare(
        "INSERT INTO patron_detectado (id, tipo, descripcion, nivel_minimo, activo) VALUES ('p1', 'conflicto_inventario', 'Test', 'director', 1)",
      )
      .run();

    const result = JSON.parse(
      desactivar_patron(
        { patron_id: "p1" },
        makeCtx("dir1", "director", ["ger1"], ["ger1", "ae1"]),
      ),
    );
    expect(result.patron_id).toBe("p1");

    const row = testDb
      .prepare("SELECT activo FROM patron_detectado WHERE id = 'p1'")
      .get() as any;
    expect(row.activo).toBe(0);
  });

  it("gerente cannot deactivate", () => {
    testDb
      .prepare(
        "INSERT INTO patron_detectado (id, tipo, descripcion, nivel_minimo, activo) VALUES ('p1', 'correlacion_winloss', 'Test', 'gerente', 1)",
      )
      .run();

    const result = JSON.parse(
      desactivar_patron(
        { patron_id: "p1" },
        makeCtx("ger1", "gerente", ["ae1"]),
      ),
    );
    expect(result.error).toContain("Solo directores");
  });
});
