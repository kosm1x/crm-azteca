/**
 * Session-start memory recall hook tests.
 *
 * Verifies role→banks routing, formatting, empty-result handling, and
 * graceful degradation when the memory service errors.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

const { noopLogger, recallSpy } = vi.hoisted(() => {
  const noop = () => {};
  const logger: Record<string, unknown> = {
    info: noop,
    warn: noop,
    error: noop,
    debug: noop,
  };
  logger.child = () => logger;
  return {
    noopLogger: logger,
    recallSpy: vi.fn(async () => [] as { content: string }[]),
  };
});

vi.mock("../src/logger.js", () => ({ logger: noopLogger }));
vi.mock("../src/memory/index.js", () => ({
  getMemoryService: () => ({
    retain: vi.fn(async () => {}),
    recall: recallSpy,
    reflect: vi.fn(async () => ""),
    isHealthy: vi.fn(async () => true),
  }),
}));

import { getSessionMemorySection } from "../src/memory/recall-hook.js";

afterEach(() => {
  recallSpy.mockClear();
  recallSpy.mockImplementation(async () => []);
});

describe("getSessionMemorySection — role routing", () => {
  it("AE queries crm-sales + crm-accounts (no team bank)", async () => {
    recallSpy.mockImplementation(async (_q, opts) => [
      { content: `[${opts.bank}] sample memory` },
    ]);
    const section = await getSessionMemorySection("ae1", "ae");
    const banksQueried = recallSpy.mock.calls.map((c) => c[1].bank).sort();
    expect(banksQueried).toEqual(["crm-accounts", "crm-sales"]);
    expect(section).toContain("### Ventas");
    expect(section).toContain("### Cuentas");
    expect(section).not.toContain("### Equipo");
  });

  it("gerente adds crm-team", async () => {
    recallSpy.mockImplementation(async (_q, opts) => [
      { content: `[${opts.bank}] sample` },
    ]);
    const section = await getSessionMemorySection("g1", "gerente");
    const banksQueried = recallSpy.mock.calls.map((c) => c[1].bank).sort();
    expect(banksQueried).toEqual(["crm-accounts", "crm-sales", "crm-team"]);
    expect(section).toContain("### Equipo");
  });

  it("director / vp query the same 3 banks as gerente", async () => {
    recallSpy.mockImplementation(async (_q, opts) => [
      { content: `[${opts.bank}] sample` },
    ]);
    await getSessionMemorySection("d1", "director");
    const dirBanks = recallSpy.mock.calls.map((c) => c[1].bank).sort();
    expect(dirBanks).toEqual(["crm-accounts", "crm-sales", "crm-team"]);

    recallSpy.mockClear();
    await getSessionMemorySection("v1", "vp");
    const vpBanks = recallSpy.mock.calls.map((c) => c[1].bank).sort();
    expect(vpBanks).toEqual(["crm-accounts", "crm-sales", "crm-team"]);
  });
});

describe("getSessionMemorySection — formatting", () => {
  it("emits the section header + role-appropriate sub-sections", async () => {
    recallSpy.mockImplementationOnce(async () => [
      { content: "Coca-Cola prefiere desglose trimestral" },
      { content: "Bimbo cierra solo despues de comida" },
    ]);
    recallSpy.mockImplementationOnce(async () => [
      { content: "P&G tiene nuevo CMO desde marzo 2026" },
    ]);
    const section = await getSessionMemorySection("ae1", "ae");
    expect(section).toContain("## Memoria del Equipo");
    expect(section).toContain("### Ventas");
    expect(section).toContain("- Coca-Cola prefiere desglose trimestral");
    expect(section).toContain("### Cuentas");
    expect(section).toContain("- P&G tiene nuevo CMO");
  });

  it("clips memory lines longer than 200 chars with an ellipsis", async () => {
    const longContent = "X".repeat(500);
    recallSpy.mockImplementationOnce(async () => [{ content: longContent }]);
    recallSpy.mockImplementationOnce(async () => []);
    const section = await getSessionMemorySection("ae1", "ae");
    const xLine = section.split("\n").find((l) => l.startsWith("- X"));
    expect(xLine).toBeDefined();
    expect(xLine!.length).toBeLessThanOrEqual(200 + 3); // "- " prefix + ellipsis fudge
    expect(xLine).toMatch(/…$/);
  });

  it("collapses internal whitespace in memory lines", async () => {
    recallSpy.mockImplementationOnce(async () => [
      { content: "linea  con\n\n  saltos\t\t y\n   tabs" },
    ]);
    recallSpy.mockImplementationOnce(async () => []);
    const section = await getSessionMemorySection("ae1", "ae");
    expect(section).toContain("- linea con saltos y tabs");
  });

  it("prefixes memories with [YYYY-MM-DD] when createdAt is available", async () => {
    recallSpy.mockImplementationOnce(async () => [
      {
        content: "Coca-Cola cerro renovacion en febrero",
        createdAt: "2026-02-14T10:30:00Z",
      },
    ]);
    recallSpy.mockImplementationOnce(async () => [
      { content: "memoria sin fecha" }, // no createdAt
    ]);
    const section = await getSessionMemorySection("ae1", "ae");
    expect(section).toContain("- [2026-02-14] Coca-Cola");
    expect(section).toContain("- memoria sin fecha"); // no prefix for missing date
  });
});

describe("getSessionMemorySection — latency safety", () => {
  it("falls back to empty per-bank when recall exceeds RECALL_TIMEOUT_MS", async () => {
    // First bank: hangs forever. Second bank: returns instantly.
    recallSpy.mockImplementationOnce(
      () => new Promise(() => {}), // never resolves
    );
    recallSpy.mockImplementationOnce(async () => [
      { content: "Cuentas survives slow Ventas" },
    ]);

    const start = Date.now();
    const section = await getSessionMemorySection("ae1", "ae");
    const elapsed = Date.now() - start;

    // Must finish in roughly the timeout window, not hang on the first bank
    expect(elapsed).toBeLessThan(2500);
    expect(section).not.toContain("### Ventas"); // hung bank dropped
    expect(section).toContain("### Cuentas");
    expect(section).toContain("- Cuentas survives slow Ventas");
  });
});

describe("getSessionMemorySection — empty + error paths", () => {
  it("returns empty string when all banks come back empty", async () => {
    recallSpy.mockImplementation(async () => []);
    const section = await getSessionMemorySection("ae1", "ae");
    expect(section).toBe("");
    // recall WAS called (we tried) — empty section just means nothing landed
    expect(recallSpy).toHaveBeenCalledTimes(2);
  });

  it("returns empty string for an unknown role", async () => {
    // @ts-expect-error — testing the runtime guard
    const section = await getSessionMemorySection("x1", "unknown_role");
    expect(section).toBe("");
    expect(recallSpy).not.toHaveBeenCalled();
  });

  it("logs and skips banks whose recall throws (partial degradation)", async () => {
    recallSpy.mockImplementationOnce(async () => {
      throw new Error("hindsight 503");
    });
    recallSpy.mockImplementationOnce(async () => [
      { content: "Cuentas survives" },
    ]);
    const section = await getSessionMemorySection("ae1", "ae");
    expect(section).not.toContain("### Ventas"); // failed bank dropped
    expect(section).toContain("### Cuentas");
    expect(section).toContain("- Cuentas survives");
  });

  it("does not throw if every bank's recall throws", async () => {
    recallSpy.mockImplementation(async () => {
      throw new Error("network");
    });
    await expect(getSessionMemorySection("ae1", "ae")).resolves.toBe("");
  });
});
