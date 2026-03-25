import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createCrmSchema } from "../src/schema.js";

let testDb: InstanceType<typeof Database>;
vi.mock("../../engine/src/db.js", () => ({
  getDatabase: () => testDb,
}));

const { selectTemplateForRole } = await import("../src/template-selector.js");

beforeEach(() => {
  testDb = new Database(":memory:");
  sqliteVec.load(testDb);
  testDb.pragma("foreign_keys = ON");
  createCrmSchema(testDb);
});

function addVariant(
  rol: string,
  versionTag: string,
  status: "active" | "candidate",
) {
  testDb
    .prepare(
      `INSERT INTO template_variant (id, rol, version_tag, diff_description, status)
       VALUES (?, ?, ?, 'test', ?)`,
    )
    .run(
      `tv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      rol,
      versionTag,
      status,
    );
}

function seedScores(
  version: string,
  rol: string,
  positive: number,
  negative: number,
) {
  for (let i = 0; i < positive; i++) {
    testDb
      .prepare(
        `INSERT INTO template_score (id, bullet_id, template_version, rol, outcome_type, sample_size)
         VALUES (?, ?, ?, ?, 'actividad_positiva', 1)`,
      )
      .run(
        `ts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        `${rol}-agg`,
        version,
        rol,
      );
  }
  for (let i = 0; i < negative; i++) {
    testDb
      .prepare(
        `INSERT INTO template_score (id, bullet_id, template_version, rol, outcome_type, sample_size)
         VALUES (?, ?, ?, ?, 'actividad_negativa', 1)`,
      )
      .run(
        `ts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        `${rol}-agg`,
        version,
        rol,
      );
  }
}

describe("selectTemplateForRole", () => {
  it("returns default when no variants exist", () => {
    const result = selectTemplateForRole("ae");
    expect(result.version).toBe("default");
    expect(result.isExperimental).toBe(false);
  });

  it("returns the only variant", () => {
    addVariant("ae", "v1", "active");
    const result = selectTemplateForRole("ae");
    expect(result.version).toBe("v1");
    expect(result.isExperimental).toBe(false);
  });

  it("marks candidate variants as experimental", () => {
    addVariant("ae", "v1-exp", "candidate");
    const result = selectTemplateForRole("ae");
    expect(result.version).toBe("v1-exp");
    expect(result.isExperimental).toBe(true);
  });

  it("never returns null with multiple variants", () => {
    addVariant("ae", "v1", "active");
    addVariant("ae", "v2", "candidate");
    seedScores("v1", "ae", 8, 2);
    seedScores("v2", "ae", 6, 4);

    for (let i = 0; i < 20; i++) {
      const result = selectTemplateForRole("ae");
      expect(result).toBeDefined();
      expect(["v1", "v2"]).toContain(result.version);
    }
  });

  it("favors higher-scoring variant over many runs (Thompson Sampling)", () => {
    addVariant("ae", "good", "active");
    addVariant("ae", "bad", "candidate");
    seedScores("good", "ae", 9, 1); // 90%
    seedScores("bad", "ae", 3, 7); // 30%

    const counts: Record<string, number> = { good: 0, bad: 0 };
    for (let i = 0; i < 500; i++) {
      const result = selectTemplateForRole("ae");
      counts[result.version]++;
    }

    // Good should be selected much more often
    expect(counts.good).toBeGreaterThan(counts.bad * 3);
  });

  it("uses uniform random when samples are below threshold", () => {
    addVariant("ae", "v1", "active");
    addVariant("ae", "v2", "candidate");
    seedScores("v1", "ae", 2, 0); // Only 2 samples < 5 threshold
    seedScores("v2", "ae", 1, 0); // Only 1 sample < 5 threshold

    // Should not crash — uses uniform random
    const result = selectTemplateForRole("ae");
    expect(["v1", "v2"]).toContain(result.version);
  });
});
