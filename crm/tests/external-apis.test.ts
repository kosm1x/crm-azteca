/**
 * Tests for external API tools: clima, moneda, feriados, grafica
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { consultar_clima } from "../src/tools/clima.js";
import { convertir_moneda } from "../src/tools/moneda.js";
import { consultar_feriados } from "../src/tools/feriados.js";
import { generar_grafica } from "../src/tools/grafica.js";
import type { ToolContext } from "../src/tools/index.js";

const ctx: ToolContext = {
  persona_id: "ae1",
  rol: "ae",
  team_ids: [],
  full_team_ids: [],
};

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

// ---------------------------------------------------------------------------
// consultar_clima
// ---------------------------------------------------------------------------

describe("consultar_clima", () => {
  it("returns weather data for default coords", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        timezone: "America/Mexico_City",
        current_weather: {
          temperature: 22.5,
          windspeed: 12,
          winddirection: 180,
          weathercode: 1,
        },
        daily: {
          time: ["2026-03-17", "2026-03-18", "2026-03-19"],
          temperature_2m_max: [25, 26, 24],
          temperature_2m_min: [12, 13, 11],
          precipitation_sum: [0, 2.5, 0],
          weathercode: [1, 3, 0],
        },
      }),
    });

    const result = JSON.parse(await consultar_clima({}, ctx));

    expect(result.ubicacion.latitud).toBe(19.4326);
    expect(result.ubicacion.longitud).toBe(-99.1332);
    expect(result.clima_actual.temperatura).toBe(22.5);
    expect(result.pronostico).toHaveLength(3);
    expect(result.pronostico[0].fecha).toBe("2026-03-17");
    expect(result.pronostico[1].precipitacion_mm).toBe(2.5);

    // Verify URL contains default coords
    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain("latitude=19.4326");
    expect(calledUrl).toContain("longitude=-99.1332");
  });

  it("uses custom coordinates", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        timezone: "America/New_York",
        current_weather: {
          temperature: 15,
          windspeed: 8,
          winddirection: 90,
          weathercode: 0,
        },
        daily: {
          time: ["2026-03-17"],
          temperature_2m_max: [18],
          temperature_2m_min: [5],
          precipitation_sum: [0],
          weathercode: [0],
        },
      }),
    });

    const result = JSON.parse(
      await consultar_clima({ latitud: 40.7128, longitud: -74.006 }, ctx),
    );
    expect(result.ubicacion.latitud).toBe(40.7128);

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain("latitude=40.7128");
  });

  it("handles timeout gracefully", async () => {
    const abortErr = new Error("Aborted");
    abortErr.name = "AbortError";
    mockFetch.mockRejectedValueOnce(abortErr);

    const result = JSON.parse(await consultar_clima({}, ctx));
    expect(result.error).toContain("timeout");
  });

  it("handles HTTP error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const result = JSON.parse(await consultar_clima({}, ctx));
    expect(result.error).toContain("500");
  });
});

// ---------------------------------------------------------------------------
// convertir_moneda
// ---------------------------------------------------------------------------

describe("convertir_moneda", () => {
  it("converts USD to MXN by default", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        amount: 1,
        base: "USD",
        date: "2026-03-17",
        rates: { MXN: 17.25 },
      }),
    });

    const result = JSON.parse(await convertir_moneda({}, ctx));
    expect(result.moneda_origen).toBe("USD");
    expect(result.conversion.MXN).toBe(17.25);
    expect(result.fuente).toBe("ECB/Frankfurter");
  });

  it("supports historical date", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        amount: 100,
        base: "EUR",
        date: "2025-01-15",
        rates: { USD: 103.5 },
      }),
    });

    const result = JSON.parse(
      await convertir_moneda(
        {
          monto: 100,
          moneda_origen: "EUR",
          moneda_destino: "USD",
          fecha: "2025-01-15",
        },
        ctx,
      ),
    );
    expect(result.fecha).toBe("2025-01-15");
    expect(result.monto_original).toBe(100);

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain("/2025-01-15?");
  });

  it("handles API error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 422 });

    const result = JSON.parse(await convertir_moneda({}, ctx));
    expect(result.error).toContain("422");
  });
});

// ---------------------------------------------------------------------------
// consultar_feriados
// ---------------------------------------------------------------------------

describe("consultar_feriados", () => {
  it("returns holidays for Mexico by default", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          date: "2026-01-01",
          localName: "Año Nuevo",
          name: "New Year's Day",
          types: ["Public"],
        },
        {
          date: "2026-02-02",
          localName: "Día de la Constitución",
          name: "Constitution Day",
          types: ["Public"],
        },
      ],
    });

    const result = JSON.parse(await consultar_feriados({}, ctx));
    expect(result.pais).toBe("MX");
    expect(result.feriados).toHaveLength(2);
    expect(result.feriados[0].nombre_local).toBe("Año Nuevo");
    expect(result.total).toBe(2);

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain(
      `/PublicHolidays/${new Date().getFullYear()}/MX`,
    );
  });

  it("uses NextPublicHolidays when solo_proximos=true", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          date: "2026-03-21",
          localName: "Natalicio de Benito Juárez",
          name: "Benito Juárez's Birthday",
          types: ["Public"],
        },
      ],
    });

    const result = JSON.parse(
      await consultar_feriados({ solo_proximos: true }, ctx),
    );
    expect(result.feriados).toHaveLength(1);

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain("/NextPublicHolidays/MX");
  });

  it("handles invalid country code", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

    const result = JSON.parse(await consultar_feriados({ pais: "ZZ" }, ctx));
    expect(result.error).toContain("404");
  });
});

// ---------------------------------------------------------------------------
// generar_grafica
// ---------------------------------------------------------------------------

describe("generar_grafica", () => {
  it("generates chart URL from data", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    const result = JSON.parse(
      await generar_grafica(
        {
          tipo: "bar",
          titulo: "Ventas Q1",
          etiquetas: ["Ene", "Feb", "Mar"],
          series: [{ nombre: "Revenue", datos: [100, 150, 200] }],
        },
        ctx,
      ),
    );

    expect(result.url_grafica).toContain("quickchart.io");
    expect(result.tipo).toBe("bar");
    expect(result.nota).toContain("WhatsApp");
  });

  it("rejects empty etiquetas", async () => {
    const result = JSON.parse(
      await generar_grafica({ etiquetas: [], series: [] }, ctx),
    );
    expect(result.error).toContain("etiquetas");
  });

  it("handles API error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const result = JSON.parse(
      await generar_grafica(
        {
          etiquetas: ["A"],
          series: [{ datos: [1] }],
        },
        ctx,
      ),
    );
    expect(result.error).toContain("500");
  });
});
