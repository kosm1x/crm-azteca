/**
 * Chart Generation Tool — QuickChart API (free, no auth)
 *
 * Generates chart image URLs from data using Chart.js config.
 * Useful for pipeline charts in Slides, email reports, and briefings.
 */

import type { ToolContext } from "./index.js";

const API_URL = "https://quickchart.io/chart";

export async function generar_grafica(
  args: Record<string, unknown>,
  _ctx: ToolContext,
): Promise<string> {
  const tipo = (args.tipo as string) || "bar";
  const titulo = (args.titulo as string) || "";
  const etiquetas = (args.etiquetas as string[]) || [];
  const series =
    (args.series as Array<{ nombre?: string; datos: number[] }>) || [];
  const ancho = Math.min((args.ancho as number) || 500, 1200);
  const alto = Math.min((args.alto as number) || 300, 800);

  if (!etiquetas.length || !series.length) {
    return JSON.stringify({
      error:
        'Se requieren "etiquetas" (array de strings) y "series" (array de {nombre, datos})',
    });
  }

  const chartConfig = {
    type: tipo,
    data: {
      labels: etiquetas,
      datasets: series.map((s) => ({
        label: s.nombre ?? "",
        data: s.datos,
      })),
    },
    options: {
      ...(titulo
        ? {
            plugins: { title: { display: true, text: titulo } },
          }
        : {}),
    },
  };

  const body = JSON.stringify({
    chart: JSON.stringify(chartConfig),
    width: ancho,
    height: alto,
    format: "png",
    backgroundColor: "white",
  });

  const controller = new AbortController();
  const fetchTimeout = setTimeout(() => controller.abort(), 15_000);
  let response: Response;
  try {
    response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: controller.signal,
    });
  } catch (err: any) {
    clearTimeout(fetchTimeout);
    if (err.name === "AbortError")
      return JSON.stringify({ error: "QuickChart timeout (15s)" });
    return JSON.stringify({
      error: `QuickChart error: ${err.message?.slice(0, 200) ?? "unknown"}`,
    });
  } finally {
    clearTimeout(fetchTimeout);
  }

  if (!response.ok) {
    return JSON.stringify({
      error: `QuickChart API error: ${response.status}`,
    });
  }

  // QuickChart POST returns the image directly; build a GET URL for sharing
  const encodedConfig = encodeURIComponent(JSON.stringify(chartConfig));
  const chartUrl = `${API_URL}?c=${encodedConfig}&w=${ancho}&h=${alto}&bkg=white`;

  return JSON.stringify({
    url_grafica: chartUrl,
    tipo,
    ancho,
    alto,
    nota: "URL se puede compartir por WhatsApp, email, o insertar en Google Slides/Docs",
  });
}
