/**
 * Session-start memory recall hook.
 *
 * Counterpart to the auto-memory write hook (crm/src/tools/auto-memory.ts).
 * On every container spawn, recalls a small role-appropriate digest from
 * each readable bank and formats it as a "## Memoria del Equipo" section
 * for the system prompt.
 *
 * Why: even with the auto-write hook filling banks, memories sit unused
 * if the agent never calls buscar_memoria. This guarantees a baseline of
 * accumulated context lands in every session, removing model-compliance
 * variance on the read side too.
 *
 * Bank routing mirrors the design intent — sales/accounts/team are
 * team-shared knowledge, crm-user is per-persona (not yet populated by
 * any auto-rule, so omitted from MVP). Add per-persona tag scoping if/
 * when crm-user starts filling.
 */

import type { Persona } from "../hierarchy.js";
import { getMemoryService } from "./index.js";
import type { MemoryBank } from "./types.js";
import { logger } from "../logger.js";

const MAX_PER_BANK = 5;
const MAX_CHARS_PER_LINE = 200;
/** Per-bank deadline for the recall HTTP. Hindsight's default timeout
 *  is 5s; a slow-but-up backend would otherwise block every container
 *  spawn for ~15s on the 3-bank fan-out. Cap aggressively so the hook
 *  degrades to "" instead of blocking start-of-conversation UX. */
const RECALL_TIMEOUT_MS = 1500;

interface BankSpec {
  bank: MemoryBank;
  /** Generic Spanish recall query — broad enough to surface anything
   *  high-signal in the bank's mission scope. */
  query: string;
  /** Display label in the injected prompt section. */
  label: string;
}

/**
 * Banks each role can read from. Mirrors the runtime memoria_buscar
 * guard at `crm/src/tools/memoria.ts` — AEs read sales+accounts (they
 * write to both via the auto-memory hook), managers+ also read team.
 * `crm-user` is omitted from the digest until an auto-write rule starts
 * populating it (per-persona scoping needed first).
 */
const BANKS_BY_ROLE: Record<Persona["rol"], BankSpec[]> = {
  ae: [
    {
      bank: "crm-sales",
      query: "patrones de venta, manejo de objeciones, cierres exitosos",
      label: "Ventas",
    },
    {
      bank: "crm-accounts",
      query: "inteligencia de cuentas, preferencias de stakeholders, dinamicas",
      label: "Cuentas",
    },
  ],
  gerente: [
    {
      bank: "crm-sales",
      query: "patrones de venta, manejo de objeciones, cierres exitosos",
      label: "Ventas",
    },
    {
      bank: "crm-accounts",
      query: "inteligencia de cuentas, preferencias de stakeholders, dinamicas",
      label: "Cuentas",
    },
    {
      bank: "crm-team",
      query: "rendimiento del equipo, coaching, fortalezas y mejoras",
      label: "Equipo",
    },
  ],
  director: [
    {
      bank: "crm-sales",
      query: "patrones de venta, manejo de objeciones, cierres exitosos",
      label: "Ventas",
    },
    {
      bank: "crm-accounts",
      query: "inteligencia de cuentas, preferencias de stakeholders, dinamicas",
      label: "Cuentas",
    },
    {
      bank: "crm-team",
      query: "rendimiento del equipo, coaching, fortalezas y mejoras",
      label: "Equipo",
    },
  ],
  vp: [
    {
      bank: "crm-sales",
      query: "patrones de venta, manejo de objeciones, cierres exitosos",
      label: "Ventas",
    },
    {
      bank: "crm-accounts",
      query: "inteligencia de cuentas, preferencias de stakeholders, dinamicas",
      label: "Cuentas",
    },
    {
      bank: "crm-team",
      query: "rendimiento del equipo, coaching, fortalezas y mejoras",
      label: "Equipo",
    },
  ],
};

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + "…";
}

/** Race a promise against a timeout. On timeout, returns the fallback
 *  value (no throw). Used to bound the recall fan-out. */
async function withTimeout<T>(
  p: Promise<T>,
  ms: number,
  fallback: T,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race<T>([
      p,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Format an ISO timestamp as a compact date prefix [YYYY-MM-DD]. */
function datePrefix(createdAt: string | undefined): string {
  if (!createdAt) return "";
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(createdAt);
  return m ? `[${m[1]}] ` : "";
}

/**
 * Recall a role-appropriate memory digest and format it as a system
 * prompt section. Returns "" when there's nothing useful (no role match,
 * all banks empty, or memory service errors). Never throws.
 *
 * Each bank's recall is bounded by RECALL_TIMEOUT_MS — slow-but-up
 * hindsight degrades to a missing section, not a blocked container
 * spawn. `personaId` is currently unused (all 3 routed banks are
 * team-shared), kept in the signature for forward compat with the
 * per-persona crm-user bank.
 */
export async function getSessionMemorySection(
  _personaId: string,
  role: Persona["rol"],
): Promise<string> {
  const specs = BANKS_BY_ROLE[role];
  if (!specs || specs.length === 0) return "";

  const memory = getMemoryService();

  // Recall in parallel — each call has its own timeout + try/catch so
  // one slow/failing bank doesn't drag the rest down.
  const results = await Promise.all(
    specs.map(async (spec) => {
      const recallPromise = memory
        .recall(spec.query, {
          bank: spec.bank,
          maxResults: MAX_PER_BANK,
        })
        .catch((err) => {
          logger.warn(
            {
              bank: spec.bank,
              op: "recall-hook",
              err: err instanceof Error ? err.message : String(err),
            },
            "session memory recall failed",
          );
          return [];
        });
      const items = await withTimeout(recallPromise, RECALL_TIMEOUT_MS, []);
      return { spec, items };
    }),
  );

  const sections: string[] = [];
  for (const { spec, items } of results) {
    if (items.length === 0) continue;
    const lines = items.map((it) => {
      const text = clip(
        it.content.replace(/\s+/g, " ").trim(),
        MAX_CHARS_PER_LINE,
      );
      return `- ${datePrefix(it.createdAt)}${text}`;
    });
    sections.push(`### ${spec.label}\n${lines.join("\n")}`);
  }

  if (sections.length === 0) return "";

  return [
    "## Memoria del Equipo",
    "",
    "Aprendizajes y contexto acumulado de interacciones previas. Usalos para informar tus respuestas; no los repitas literalmente.",
    "",
    sections.join("\n\n"),
  ].join("\n");
}
