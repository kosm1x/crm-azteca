/**
 * System Prompt Builder — Host-side replica of agent-runner's buildSystemPrompt().
 *
 * Reads templates from crm/groups/ (not /workspace/ container paths).
 * Replicates buildOrgContext() and getMxDateTime() to avoid importing
 * the agent-runner (which calls main() on import).
 */

import fs from "fs";
import path from "path";
import { getPersonById, getDirectReports } from "../../crm/src/hierarchy.js";
import type { Persona } from "../../crm/src/hierarchy.js";
import { getDatabase } from "../../crm/src/db.js";
import {
  getUserProfile,
  formatProfileSection,
} from "../../crm/src/tools/perfil.js";

const ROLE_TEMPLATE_MAP: Record<string, string> = {
  ae: "ae.md",
  gerente: "manager.md",
  director: "director.md",
  vp: "vp.md",
};

function getMxDateTime(): string {
  const now = new Date();
  const mxDate = now.toLocaleDateString("es-MX", {
    timeZone: "America/Mexico_City",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const mxTime = now.toLocaleTimeString("es-MX", {
    timeZone: "America/Mexico_City",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  return `${mxDate}, ${mxTime} (Ciudad de Mexico)`;
}

function buildOrgContext(persona: Persona): string {
  const lines: string[] = ["## Tu Equipo"];

  if (persona.reporta_a) {
    const boss = getPersonById(persona.reporta_a);
    if (boss) {
      lines.push(`Reportas a: *${boss.nombre}* (${boss.rol})`);
      if (boss.reporta_a) {
        const grandBoss = getPersonById(boss.reporta_a);
        if (grandBoss)
          lines.push(
            `  └ quien reporta a: *${grandBoss.nombre}* (${grandBoss.rol})`,
          );
      }
    }
  } else {
    lines.push("Eres el nivel mas alto de la jerarquia.");
  }

  const directReports = getDirectReports(persona.id);
  if (directReports.length > 0) {
    lines.push("");
    lines.push("Reportes directos:");
    for (const dr of directReports) {
      const subReports = getDirectReports(dr.id);
      if (subReports.length > 0) {
        lines.push(`• *${dr.nombre}* (${dr.rol})`);
        for (const sub of subReports) {
          const leafReports = getDirectReports(sub.id);
          if (leafReports.length > 0) {
            lines.push(
              `  └ *${sub.nombre}* (${sub.rol}) → ${leafReports.map((l) => l.nombre).join(", ")}`,
            );
          } else {
            lines.push(`  └ *${sub.nombre}* (${sub.rol})`);
          }
        }
      } else {
        lines.push(`• *${dr.nombre}* (${dr.rol})`);
      }
    }
  }

  if (persona.reporta_a) {
    const peers = getDirectReports(persona.reporta_a).filter(
      (p) => p.id !== persona.id,
    );
    if (peers.length > 0) {
      lines.push("");
      lines.push(
        `Pares (mismo jefe): ${peers.map((p) => `*${p.nombre}* (${p.rol})`).join(", ")}`,
      );
    }
  }

  return lines.join("\n");
}

export function buildSystemPrompt(
  role: "ae" | "gerente" | "director" | "vp",
  persona: Persona,
): string {
  const parts: string[] = [];
  const groupsDir = path.join(process.cwd(), "crm", "groups");

  // Global template
  const globalPath = path.join(groupsDir, "global.md");
  if (fs.existsSync(globalPath)) {
    parts.push(fs.readFileSync(globalPath, "utf-8"));
  }

  // Role template
  const roleFile = ROLE_TEMPLATE_MAP[role];
  if (roleFile) {
    const rolePath = path.join(groupsDir, roleFile);
    if (fs.existsSync(rolePath)) {
      parts.push(fs.readFileSync(rolePath, "utf-8"));
    }
  }

  // Date/time
  parts.push(`\n## Fecha y Hora Actual\n${getMxDateTime()}`);

  // Identity
  parts.push(
    `\n## Tu Identidad\nNombre: ${persona.nombre}\nRol: ${persona.rol}\nGrupo: simulator`,
  );

  // Org tree
  parts.push(buildOrgContext(persona));

  // User profile (optional, non-fatal)
  try {
    const db = getDatabase();
    const profile = getUserProfile(db, persona.id);
    if (profile) {
      const section = formatProfileSection(profile);
      if (section) parts.push(section);
    }
  } catch {
    // Profile table may not exist in sandbox — skip
  }

  return parts.join("\n\n---\n\n");
}
