/**
 * Warmth Computation Tests
 */

import { describe, expect, it } from "vitest";
import { computeWarmth, warmthLabel } from "../src/warmth.js";
import type { InteractionRow } from "../src/warmth.js";

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

function interaction(
  tipo = "llamada",
  calidad = "normal",
  daysBack = 0,
): InteractionRow {
  return { tipo, calidad, fecha: daysAgo(daysBack) };
}

describe("computeWarmth", () => {
  it("returns 0 for empty interactions", () => {
    expect(computeWarmth([])).toBe(0);
  });

  it("returns high score for recent high-quality interaction", () => {
    const score = computeWarmth([interaction("comida", "excepcional", 1)]);
    expect(score).toBeGreaterThan(50);
  });

  it("returns low score for old superficial interactions", () => {
    const score = computeWarmth([
      interaction("email", "superficial", 80),
      interaction("email", "superficial", 85),
    ]);
    expect(score).toBeLessThan(20);
  });

  it("decays with time — same interaction at 0d vs 60d", () => {
    const recent = computeWarmth([interaction("reunion", "buena", 0)]);
    const old = computeWarmth([interaction("reunion", "buena", 60)]);
    expect(recent).toBeGreaterThan(old);
  });

  it("rewards frequency — 1 vs 5 interactions in 90d", () => {
    const single = computeWarmth([interaction("llamada", "normal", 10)]);
    const many = computeWarmth([
      interaction("llamada", "normal", 5),
      interaction("llamada", "normal", 15),
      interaction("llamada", "normal", 30),
      interaction("llamada", "normal", 45),
      interaction("llamada", "normal", 60),
    ]);
    expect(many).toBeGreaterThan(single);
  });

  it("rewards quality — comida/excepcional vs email/superficial", () => {
    const highQ = computeWarmth([interaction("comida", "excepcional", 10)]);
    const lowQ = computeWarmth([interaction("email", "superficial", 10)]);
    expect(highQ).toBeGreaterThan(lowQ);
  });

  it("score is between 0 and 100", () => {
    // Max: many recent high-quality interactions
    const maxScore = computeWarmth(
      Array.from({ length: 10 }, (_, i) =>
        interaction("comida", "excepcional", i),
      ),
    );
    expect(maxScore).toBeGreaterThanOrEqual(0);
    expect(maxScore).toBeLessThanOrEqual(100);
  });

  it("handles 90+ day old interactions (zero recency)", () => {
    const score = computeWarmth([interaction("reunion", "buena", 100)]);
    // Recency should be 0, but frequency and quality still contribute
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThan(30); // No recency component
  });
});

describe("warmthLabel", () => {
  it("caliente >= 70", () => expect(warmthLabel(70)).toBe("caliente"));
  it("caliente at 100", () => expect(warmthLabel(100)).toBe("caliente"));
  it("tibia at 40", () => expect(warmthLabel(40)).toBe("tibia"));
  it("tibia at 69", () => expect(warmthLabel(69)).toBe("tibia"));
  it("fria at 15", () => expect(warmthLabel(15)).toBe("fria"));
  it("fria at 39", () => expect(warmthLabel(39)).toBe("fria"));
  it("congelada at 14", () => expect(warmthLabel(14)).toBe("congelada"));
  it("congelada at 0", () => expect(warmthLabel(0)).toBe("congelada"));
});
