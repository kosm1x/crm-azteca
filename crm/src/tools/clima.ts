/**
 * Weather Tool — Open-Meteo API (free, no auth)
 *
 * Current conditions + multi-day forecast.
 * Useful for outdoor advertising context and campaign planning.
 */

import type { ToolContext } from "./index.js";

const API_URL = "https://api.open-meteo.com/v1/forecast";
const DEFAULT_LAT = 19.4326; // Mexico City
const DEFAULT_LON = -99.1332;

export async function consultar_clima(
  args: Record<string, unknown>,
  _ctx: ToolContext,
): Promise<string> {
  const lat = (args.latitud as number) || DEFAULT_LAT;
  const lon = (args.longitud as number) || DEFAULT_LON;
  const days = Math.min(Math.max((args.dias_pronostico as number) || 3, 1), 7);

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current_weather: "true",
    daily:
      "temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode",
    timezone: "auto",
    forecast_days: String(days),
  });

  const controller = new AbortController();
  const fetchTimeout = setTimeout(() => controller.abort(), 10_000);
  let response: Response;
  try {
    response = await fetch(`${API_URL}?${params}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
  } catch (err: any) {
    clearTimeout(fetchTimeout);
    if (err.name === "AbortError")
      return JSON.stringify({ error: "Open-Meteo timeout (10s)" });
    return JSON.stringify({
      error: `Open-Meteo error: ${err.message?.slice(0, 200) ?? "unknown"}`,
    });
  } finally {
    clearTimeout(fetchTimeout);
  }

  if (!response.ok) {
    return JSON.stringify({
      error: `Open-Meteo API error: ${response.status}`,
    });
  }

  const data = (await response.json()) as OpenMeteoResponse;

  const pronostico = (data.daily?.time ?? []).map((date, i) => ({
    fecha: date,
    temp_max: data.daily?.temperature_2m_max?.[i] ?? null,
    temp_min: data.daily?.temperature_2m_min?.[i] ?? null,
    precipitacion_mm: data.daily?.precipitation_sum?.[i] ?? null,
    codigo_clima: data.daily?.weathercode?.[i] ?? null,
  }));

  return JSON.stringify({
    ubicacion: { latitud: lat, longitud: lon, zona_horaria: data.timezone },
    clima_actual: data.current_weather
      ? {
          temperatura: data.current_weather.temperature,
          viento_kmh: data.current_weather.windspeed,
          direccion_viento: data.current_weather.winddirection,
          codigo_clima: data.current_weather.weathercode,
        }
      : null,
    pronostico,
  });
}

interface OpenMeteoResponse {
  timezone?: string;
  current_weather?: {
    temperature: number;
    windspeed: number;
    winddirection: number;
    weathercode: number;
  };
  daily?: {
    time?: string[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_sum?: number[];
    weathercode?: number[];
  };
}
