import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createCrmSchema } from "../src/schema.js";

let testDb: InstanceType<typeof Database>;
vi.mock("../../engine/src/db.js", () => ({
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

const { registerVariant, getVariantScoreSummary, evaluateVariantPromotion } =
  await import("../src/template-evolution.js");

function seedTeam(db: InstanceType<typeof Database>) {
  db.prepare(
    "INSERT INTO persona (id, nombre, rol, reporta_a, whatsapp_group_folder, activo) VALUES ('ae1', 'AE One', 'ae', NULL, 'ae-f', 1)",
  ).run();
}

function seedScores(
  db: InstanceType<typeof Database>,
  version: string,
  rol: string,
  positive: number,
  negative: number,
) {
  for (let i = 0; i < positive; i++) {
    db.prepare(
      `INSERT INTO template_score (id, bullet_id, template_version, rol, outcome_type, sample_size) VALUES (?, ?, ?, ?, 'actividad_positiva', 1)`,
    ).run(
      `ts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      `${rol}-agg`,
      version,
      rol,
    );
  }
  for (let i = 0; i < negative; i++) {
    db.prepare(
      `INSERT INTO template_score (id, bullet_id, template_version, rol, outcome_type, sample_size) VALUES (?, ?, ?, ?, 'actividad_negativa', 1)`,
    ).run(
      `ts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      `${rol}-agg`,
      version,
      rol,
    );
  }
}

beforeEach(() => {
  testDb = new Database(":memory:");
  sqliteVec.load(testDb);
  testDb.pragma("foreign_keys = ON");
  createCrmSchema(testDb);
  seedTeam(testDb);
});

describe("registerVariant", () => {
  it("inserts a candidate variant", () => {
    registerVariant("ae", "ae-1.3.1-exp1", "1.3", "Added pricing emphasis");
    const row = testDb
      .prepare("SELECT * FROM template_variant WHERE rol = 'ae'")
      .get() as Record<string, unknown>;
    expect(row).toBeDefined();
    expect(row.version_tag).toBe("ae-1.3.1-exp1");
    expect(row.status).toBe("candidate");
    expect(row.parent_version).toBe("1.3");
  });

  it("stores optional diff_patch", () => {
    registerVariant("ae", "v2", "v1", "change", "--- a\n+++ b\n@@ ...");
    const row = testDb
      .prepare(
        "SELECT diff_patch FROM template_variant WHERE version_tag = 'v2'",
      )
      .get() as Record<string, unknown>;
    expect(row.diff_patch).toContain("---");
  });
});

describe("getVariantScoreSummary", () => {
  it("returns empty for role with no variants", () => {
    const summary = getVariantScoreSummary("gerente");
    expect(summary).toEqual([]);
  });

  it("aggregates positive rate from template_score", () => {
    registerVariant("ae", "v1", null, "initial");
    seedScores(testDb, "v1", "ae", 8, 2); // 80% positive

    const summary = getVariantScoreSummary("ae");
    expect(summary).toHaveLength(1);
    expect(summary[0].positive_rate).toBeCloseTo(0.8, 1);
    expect(summary[0].sample_size).toBe(10);
  });
});

describe("evaluateVariantPromotion", () => {
  it("returns 0 with no candidates", () => {
    const result = evaluateVariantPromotion(testDb, "2026-03-26");
    expect(result).toBe(0);
  });

  it("skips candidates with insufficient samples", () => {
    registerVariant("ae", "v1", null, "too few samples");
    seedScores(testDb, "v1", "ae", 3, 1); // only 4 samples < 10
    const result = evaluateVariantPromotion(testDb, "2026-03-26");
    expect(result).toBe(0);
  });

  it("generates promotion insight when candidate beats active by >5pp", () => {
    // Register active variant
    registerVariant("ae", "v1", null, "baseline");
    testDb
      .prepare(
        "UPDATE template_variant SET status = 'active', activated_at = datetime('now') WHERE version_tag = 'v1'",
      )
      .run();
    seedScores(testDb, "v1", "ae", 6, 4); // 60% positive

    // Register candidate that beats it
    registerVariant("ae", "v2", "v1", "improved pricing");
    seedScores(testDb, "v2", "ae", 9, 1); // 90% positive (+30pp)

    const result = evaluateVariantPromotion(testDb, "2026-03-26");
    expect(result).toBe(1);

    // Check insight was generated
    const insight = testDb
      .prepare(
        "SELECT * FROM insight_comercial WHERE tipo = 'recomendacion' AND titulo LIKE '%Promover%'",
      )
      .get() as Record<string, unknown>;
    expect(insight).toBeDefined();
    expect(insight.descripcion).toContain("v2");
  });

  it("rejects candidate that is >10pp worse", () => {
    registerVariant("ae", "v1", null, "baseline");
    testDb
      .prepare(
        "UPDATE template_variant SET status = 'active', activated_at = datetime('now') WHERE version_tag = 'v1'",
      )
      .run();
    seedScores(testDb, "v1", "ae", 8, 2); // 80%

    registerVariant("ae", "v2", "v1", "bad change");
    seedScores(testDb, "v2", "ae", 4, 6); // 40% (-40pp)

    evaluateVariantPromotion(testDb, "2026-03-26");

    const variant = testDb
      .prepare("SELECT status FROM template_variant WHERE version_tag = 'v2'")
      .get() as { status: string };
    expect(variant.status).toBe("rejected");
  });

  it("recommends activation when no active variant exists", () => {
    registerVariant("ae", "v1", null, "first variant");
    seedScores(testDb, "v1", "ae", 7, 3); // 70%, 10 samples

    const result = evaluateVariantPromotion(testDb, "2026-03-26");
    expect(result).toBe(1);

    const insight = testDb
      .prepare("SELECT * FROM insight_comercial WHERE titulo LIKE '%Activar%'")
      .get() as Record<string, unknown>;
    expect(insight).toBeDefined();
  });
});
