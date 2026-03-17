/**
 * Currency Conversion Tool — Frankfurter API (free, no auth)
 *
 * ECB reference rates. Supports 150+ currencies, latest + historical.
 * Useful for international ad deals and USD/MXN budgets.
 */

import type { ToolContext } from "./index.js";

const API_URL = "https://api.frankfurter.app";

export async function convertir_moneda(
  args: Record<string, unknown>,
  _ctx: ToolContext,
): Promise<string> {
  const monto = (args.monto as number) || 1;
  const origen = ((args.moneda_origen as string) || "USD").toUpperCase();
  const destino = ((args.moneda_destino as string) || "MXN").toUpperCase();
  const fecha = (args.fecha as string) || null;

  const path = fecha ?? "latest";
  const params = new URLSearchParams({
    from: origen,
    to: destino,
    amount: String(monto),
  });

  const controller = new AbortController();
  const fetchTimeout = setTimeout(() => controller.abort(), 10_000);
  let response: Response;
  try {
    response = await fetch(`${API_URL}/${path}?${params}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
  } catch (err: any) {
    clearTimeout(fetchTimeout);
    if (err.name === "AbortError")
      return JSON.stringify({ error: "Frankfurter timeout (10s)" });
    return JSON.stringify({
      error: `Frankfurter error: ${err.message?.slice(0, 200) ?? "unknown"}`,
    });
  } finally {
    clearTimeout(fetchTimeout);
  }

  if (!response.ok) {
    return JSON.stringify({
      error: `Frankfurter API error: ${response.status}`,
    });
  }

  const data = (await response.json()) as FrankfurterResponse;

  return JSON.stringify({
    monto_original: data.amount ?? monto,
    moneda_origen: data.base ?? origen,
    conversion: data.rates ?? {},
    fecha: data.date ?? fecha ?? "latest",
    fuente: "ECB/Frankfurter",
  });
}

interface FrankfurterResponse {
  amount?: number;
  base?: string;
  date?: string;
  rates?: Record<string, number>;
}
