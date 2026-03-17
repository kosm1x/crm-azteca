/**
 * Feedback Engine Tests
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

const { captureFeedback, getEngagementMetrics, getTeamFeedbackStats } =
  await import("../src/feedback-engine.js");
const { _resetStatementCache } = await import("../src/hierarchy.js");
const { draftProposalFromInsight } = await import("../src/proposal-drafter.js");
const { modificar_borrador } = await import("../src/tools/insight-tools.js");
const { consultar_feedback, generar_reporte_aprendizaje } =
  await import("../src/tools/feedback-tools.js");

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
    "INSERT INTO persona (id, nombre, rol, reporta_a, whatsapp_group_folder, activo) VALUES ('ae1', 'AE One', 'ae', 'ger1', 'ae-f', 1)",
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

function seedInsightAndDraft(db: InstanceType<typeof Database>) {
  db.prepare(
    `INSERT INTO insight_comercial (id, tipo, cuenta_id, ae_id, titulo, descripcion, confianza, sample_size, valor_potencial, estado, datos_soporte)
     VALUES ('ins1', 'oportunidad_crosssell', 'c1', 'ae1', 'Test', 'Desc', 0.75, 3, 5000000, 'nuevo', '{"tipo":"estacional"}')`,
  ).run();
  return draftProposalFromInsight("ins1");
}

beforeEach(() => {
  testDb = new Database(":memory:");
  sqliteVec.load(testDb);
  testDb.pragma("foreign_keys = ON");
  createCrmSchema(testDb);
  _resetStatementCache();
  seedTeam(testDb);
  testDb
    .prepare(
      "INSERT INTO cuenta (id, nombre, tipo, vertical, ae_id, estado) VALUES ('c1', 'TestCo', 'directo', 'alimentos', 'ae1', 'activo')",
    )
    .run();
});

describe("feedback_propuesta schema", () => {
  it("table exists", () => {
    const tables = testDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r: any) => r.name);
    expect(tables).toContain("feedback_propuesta");
  });

  it("rejects invalid resultado", () => {
    expect(() =>
      testDb
        .prepare(
          "INSERT INTO feedback_propuesta (id, propuesta_id, ae_id, resultado) VALUES ('x', 'p1', 'ae1', 'invalid')",
        )
        .run(),
    ).toThrow(/CHECK/);
  });
});

describe("captureFeedback", () => {
  beforeEach(() => {
    testDb
      .prepare(
        "INSERT INTO propuesta (id, titulo, ae_id, etapa) VALUES ('p1', 'Test', 'ae1', 'en_preparacion')",
      )
      .run();
  });

  it("captures accepted without changes", () => {
    captureFeedback(
      "p1",
      "ae1",
      "aceptado_sin_cambios",
      {
        titulo: "Draft",
        valor_estimado: 5000000,
        medios: null,
        agente_razonamiento: "test",
        insight_origen_id: null,
        fecha_creacion: null,
      },
      { titulo: "Draft", valor_estimado: 5000000, medios: null },
    );

    const row = testDb
      .prepare("SELECT * FROM feedback_propuesta WHERE propuesta_id = 'p1'")
      .get() as any;
    expect(row.resultado).toBe("aceptado_sin_cambios");
    expect(row.delta_valor).toBe(0); // same value = zero delta
  });

  it("captures accepted with changes and computes delta", () => {
    captureFeedback(
      "p1",
      "ae1",
      "aceptado_con_cambios",
      {
        titulo: "Draft",
        valor_estimado: 5000000,
        medios: null,
        agente_razonamiento: "test",
        insight_origen_id: null,
        fecha_creacion: null,
      },
      { titulo: "Draft Modified", valor_estimado: 3000000, medios: null },
    );

    const row = testDb
      .prepare("SELECT * FROM feedback_propuesta WHERE propuesta_id = 'p1'")
      .get() as any;
    expect(row.resultado).toBe("aceptado_con_cambios");
    expect(row.delta_valor).toBe(-2000000);
    expect(row.delta_descripcion).toContain("titulo:");
    expect(row.delta_descripcion).toContain("valor:");
  });

  it("captures dismissal", () => {
    captureFeedback("p1", "ae1", "descartado", {
      titulo: "Bad Draft",
      valor_estimado: 10000000,
      medios: null,
      agente_razonamiento: "test",
      insight_origen_id: null,
      fecha_creacion: null,
    });

    const row = testDb
      .prepare("SELECT * FROM feedback_propuesta WHERE propuesta_id = 'p1'")
      .get() as any;
    expect(row.resultado).toBe("descartado");
  });
});

describe("modificar_borrador captures feedback", () => {
  it("captures feedback when promoting with aceptar=true", () => {
    const draft = seedInsightAndDraft(testDb);
    if ("error" in draft) throw new Error(draft.error);

    modificar_borrador(
      {
        propuesta_id: draft.propuesta_id,
        valor_estimado: 3000000,
        aceptar: true,
      },
      makeCtx("ae1", "ae"),
    );

    const fb = testDb
      .prepare("SELECT * FROM feedback_propuesta WHERE propuesta_id = ?")
      .get(draft.propuesta_id) as any;
    expect(fb).toBeTruthy();
    expect(fb.resultado).toBe("aceptado_con_cambios");
    expect(fb.delta_valor).toBe(3000000 - 5000000); // -2M
  });

  it("captures sin_cambios when promoting without modifications", () => {
    const draft = seedInsightAndDraft(testDb);
    if ("error" in draft) throw new Error(draft.error);

    modificar_borrador(
      { propuesta_id: draft.propuesta_id, aceptar: true },
      makeCtx("ae1", "ae"),
    );

    const fb = testDb
      .prepare("SELECT * FROM feedback_propuesta WHERE propuesta_id = ?")
      .get(draft.propuesta_id) as any;
    expect(fb.resultado).toBe("aceptado_sin_cambios");
  });
});

describe("getEngagementMetrics", () => {
  beforeEach(() => {
    for (let i = 0; i < 5; i++) {
      testDb
        .prepare(
          `INSERT OR IGNORE INTO propuesta (id, titulo, ae_id, etapa) VALUES ('p${i}', 'P${i}', 'ae1', 'en_preparacion')`,
        )
        .run();
    }
  });

  it("returns empty for no feedback", () => {
    const metrics = getEngagementMetrics();
    expect(metrics.length).toBe(0);
  });

  it("computes rates correctly", () => {
    // 3 feedbacks: 1 sin_cambios, 1 con_cambios, 1 descartado
    for (const [i, resultado] of [
      "aceptado_sin_cambios",
      "aceptado_con_cambios",
      "descartado",
    ].entries()) {
      testDb
        .prepare(
          "INSERT INTO feedback_propuesta (id, propuesta_id, ae_id, resultado) VALUES (?, ?, 'ae1', ?)",
        )
        .run(`fb${i}`, `p${i}`, resultado);
    }

    const metrics = getEngagementMetrics();
    expect(metrics.length).toBe(1);
    expect(metrics[0].total).toBe(3);
    expect(metrics[0].zero_delta_rate).toBe(33); // 1/3
    expect(metrics[0].healthy_rate).toBe(33);
    expect(metrics[0].dismissal_rate).toBe(33);
  });
});

describe("getTeamFeedbackStats", () => {
  beforeEach(() => {
    for (let i = 0; i < 5; i++) {
      testDb
        .prepare(
          `INSERT OR IGNORE INTO propuesta (id, titulo, ae_id, etapa) VALUES ('p${i}', 'P${i}', 'ae1', 'en_preparacion')`,
        )
        .run();
    }
  });

  it("returns sin datos for empty team", () => {
    const stats = getTeamFeedbackStats([]);
    expect(stats.tasa_engagement).toBe("sin datos");
  });

  it("flags rubber-stamping", () => {
    // 4 sin_cambios for ae1
    for (let i = 0; i < 4; i++) {
      testDb
        .prepare(
          "INSERT INTO feedback_propuesta (id, propuesta_id, ae_id, resultado) VALUES (?, ?, 'ae1', 'aceptado_sin_cambios')",
        )
        .run(`fb${i}`, `p${i}`);
    }

    const stats = getTeamFeedbackStats(["ae1"]);
    expect(stats.alertas.length).toBeGreaterThanOrEqual(1);
    expect(stats.alertas[0]).toContain("rubber-stamping");
  });
});

describe("consultar_feedback", () => {
  beforeEach(() => {
    testDb
      .prepare(
        "INSERT OR IGNORE INTO propuesta (id, titulo, ae_id, etapa) VALUES ('p1', 'P1', 'ae1', 'en_preparacion')",
      )
      .run();
  });

  it("AE cannot access", () => {
    const result = JSON.parse(consultar_feedback({}, makeCtx("ae1", "ae")));
    expect(result.error).toContain("Solo gerentes");
  });

  it("gerente sees team metrics", () => {
    testDb
      .prepare(
        "INSERT INTO feedback_propuesta (id, propuesta_id, ae_id, resultado) VALUES ('fb1', 'p1', 'ae1', 'aceptado_con_cambios')",
      )
      .run();

    const result = JSON.parse(
      consultar_feedback({}, makeCtx("ger1", "gerente", ["ae1"])),
    );
    expect(result.total_borradores).toBe(1);
  });
});

describe("generar_reporte_aprendizaje", () => {
  beforeEach(() => {
    testDb
      .prepare(
        "INSERT OR IGNORE INTO propuesta (id, titulo, ae_id, etapa) VALUES ('p1', 'P1', 'ae1', 'en_preparacion')",
      )
      .run();
  });

  it("gerente cannot access", () => {
    const result = JSON.parse(
      generar_reporte_aprendizaje({}, makeCtx("ger1", "gerente", ["ae1"])),
    );
    expect(result.error).toContain("Solo directores");
  });

  it("director gets report", () => {
    testDb
      .prepare(
        "INSERT INTO feedback_propuesta (id, propuesta_id, ae_id, resultado, delta_descripcion, delta_valor) VALUES ('fb1', 'p1', 'ae1', 'aceptado_con_cambios', 'valor: -$2.0M', -2000000)",
      )
      .run();

    const result = JSON.parse(
      generar_reporte_aprendizaje(
        {},
        makeCtx("dir1", "director", ["ger1"], ["ger1", "ae1"]),
      ),
    );
    expect(result.reporte).toContain("Aprendizaje");
    expect(result.patrones_de_correccion.length).toBeGreaterThanOrEqual(1);
  });
});
