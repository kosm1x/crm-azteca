#!/usr/bin/env tsx
/**
 * Seed Relationship Data — executive contacts, relationships, interactions, milestones
 *
 * Creates demo data for Phase 9 Relationship Intelligence testing.
 * Idempotent: uses INSERT OR IGNORE with deterministic IDs.
 *
 * Usage:
 *   npx tsx scripts/seed-relationships.ts
 */

import { getDatabase } from "../crm/src/db.js";
import { computeWarmth } from "../crm/src/warmth.js";
import type { InteractionRow } from "../crm/src/warmth.js";

const db = getDatabase();

// ---------------------------------------------------------------------------
// 1. Mark senior contacts as executive
// ---------------------------------------------------------------------------

const markedExec = db
  .prepare(
    "UPDATE contacto SET es_ejecutivo = 1 WHERE seniority = 'director' AND es_ejecutivo = 0",
  )
  .run();
console.log(`Marked ${markedExec.changes} contacts as executive`);

// Add titles and birthdays to some contacts
const contacts = db
  .prepare("SELECT id, nombre FROM contacto WHERE seniority = 'director'")
  .all() as { id: string; nombre: string }[];

const titles = [
  "VP Marketing",
  "Director de Medios",
  "CMO",
  "Director Comercial",
  "VP de Compras",
  "Director de Planeacion",
];
const birthdays = [
  "1978-06-15",
  "1982-03-22",
  "1975-11-08",
  "1980-09-01",
  "1985-04-15",
  "1979-12-30",
];

for (let i = 0; i < contacts.length && i < titles.length; i++) {
  db.prepare(
    "UPDATE contacto SET titulo = ?, fecha_nacimiento = ? WHERE id = ? AND titulo IS NULL",
  ).run(titles[i], birthdays[i], contacts[i].id);
}
console.log(
  `Updated titles/birthdays for ${Math.min(contacts.length, titles.length)} executive contacts`,
);

// ---------------------------------------------------------------------------
// 2. Create relationships for Director and VP
// ---------------------------------------------------------------------------

const dir1 = db
  .prepare("SELECT id FROM persona WHERE rol = 'director' LIMIT 1")
  .get() as { id: string } | undefined;
const vp1 = db
  .prepare("SELECT id FROM persona WHERE rol = 'vp' LIMIT 1")
  .get() as { id: string } | undefined;

if (!dir1 || !vp1) {
  console.error("No director or VP found — run seed-demo.ts first");
  process.exit(1);
}

const execContacts = db
  .prepare(
    "SELECT c.id, c.nombre, cu.nombre as cuenta FROM contacto c JOIN cuenta cu ON cu.id = c.cuenta_id WHERE c.es_ejecutivo = 1 LIMIT 8",
  )
  .all() as { id: string; nombre: string; cuenta: string }[];

let relCount = 0;
const insertRel = db.prepare(
  "INSERT OR IGNORE INTO relacion_ejecutiva (id, persona_id, contacto_id, tipo, importancia, notas_estrategicas) VALUES (?, ?, ?, ?, ?, ?)",
);

// Director gets first 4 contacts
for (let i = 0; i < Math.min(4, execContacts.length); i++) {
  const importancia = i === 0 ? "critica" : i === 1 ? "alta" : "media";
  const notas = [
    "Decisor final para renovacion anual. Prefiere reuniones en persona.",
    "Influenciador clave en planeacion de medios. Responde bien a datos concretos.",
    "Contacto operativo senior. Facilita aprobaciones internas.",
    "Nuevo en el puesto. Oportunidad de construir relacion desde cero.",
  ][i];
  const result = insertRel.run(
    `rel-seed-${dir1.id}-${i}`,
    dir1.id,
    execContacts[i].id,
    "cliente",
    importancia,
    notas,
  );
  if (result.changes > 0) relCount++;
}

// VP gets contacts 2-7 (overlapping 2 with director)
for (let i = 2; i < Math.min(8, execContacts.length); i++) {
  const importancia = i < 4 ? "alta" : "media";
  const result = insertRel.run(
    `rel-seed-${vp1.id}-${i}`,
    vp1.id,
    execContacts[i].id,
    "cliente",
    importancia,
    null,
  );
  if (result.changes > 0) relCount++;
}
console.log(`Created ${relCount} relationships`);

// ---------------------------------------------------------------------------
// 3. Seed interactions (spread over 90 days)
// ---------------------------------------------------------------------------

const rels = db
  .prepare(
    "SELECT id, persona_id, contacto_id FROM relacion_ejecutiva WHERE id LIKE 'rel-seed-%'",
  )
  .all() as { id: string; persona_id: string; contacto_id: string }[];

const interactionTypes = [
  "comida",
  "reunion",
  "llamada",
  "email",
  "evento",
  "presentacion",
];
const qualities = [
  "excepcional",
  "buena",
  "buena",
  "normal",
  "normal",
  "normal",
  "superficial",
];
const resumenes = [
  "Comida de trabajo para alinear estrategia Q2. Buena receptividad.",
  "Reunion de seguimiento sobre la renovacion anual. Piden mejores tarifas CTV.",
  "Llamada para confirmar asistencia al evento de la industria.",
  "Email con propuesta actualizada. Esperando feedback esta semana.",
  "Evento de la industria — coincidimos en la mesa de panelistas.",
  "Presentacion de resultados de campaña anterior. Impresionados.",
  "Llamada rapida para agendar la comida del proximo mes.",
  "Reunion con equipo de compras para negociar exclusividad digital.",
  "Comida en restaurante para celebrar cierre exitoso.",
  "Email de seguimiento post-evento con next steps.",
];

let intCount = 0;
const insertInt = db.prepare(
  "INSERT OR IGNORE INTO interaccion_ejecutiva (id, relacion_id, tipo, resumen, calidad, lugar, fecha) VALUES (?, ?, ?, ?, ?, ?, ?)",
);

for (const rel of rels) {
  // 3-6 interactions per relationship, spread over 90 days
  const numInt = 3 + (parseInt(rel.id.replace(/\D/g, "")) % 4);
  for (let j = 0; j < numInt; j++) {
    const daysAgo = Math.floor(90 * (j / numInt));
    const fecha = new Date(Date.now() - daysAgo * 86_400_000).toISOString();
    const tipo =
      interactionTypes[
        (parseInt(rel.id.replace(/\D/g, "")) + j) % interactionTypes.length
      ];
    const calidad =
      qualities[
        (parseInt(rel.id.replace(/\D/g, "")) + j * 3) % qualities.length
      ];
    const resumen =
      resumenes[(parseInt(rel.id.replace(/\D/g, "")) + j) % resumenes.length];
    const lugar =
      tipo === "comida"
        ? "Restaurante Polanco"
        : tipo === "evento"
          ? "Centro Citibanamex"
          : null;

    const result = insertInt.run(
      `intej-seed-${rel.id}-${j}`,
      rel.id,
      tipo,
      resumen,
      calidad,
      lugar,
      fecha,
    );
    if (result.changes > 0) intCount++;
  }
}
console.log(`Created ${intCount} executive interactions`);

// ---------------------------------------------------------------------------
// 4. Seed milestones
// ---------------------------------------------------------------------------

let hitoCount = 0;
const insertHito = db.prepare(
  "INSERT OR IGNORE INTO hito_contacto (id, contacto_id, tipo, titulo, fecha, recurrente, notas) VALUES (?, ?, ?, ?, ?, ?, ?)",
);

for (let i = 0; i < Math.min(6, execContacts.length); i++) {
  const c = execContacts[i];

  // Birthday (recurring)
  if (birthdays[i]) {
    const result = insertHito.run(
      `hito-seed-bday-${c.id}`,
      c.id,
      "cumpleanos",
      `Cumpleanos de ${c.nombre}`,
      birthdays[i],
      1,
      null,
    );
    if (result.changes > 0) hitoCount++;
  }

  // One non-recurring milestone
  const milestones = [
    {
      tipo: "renovacion",
      titulo: "Renovacion contrato anual",
      fecha: "2026-06-15",
    },
    { tipo: "ascenso", titulo: "Ascendido a VP", fecha: "2026-02-01" },
    {
      tipo: "aniversario",
      titulo: "10 anos de relacion comercial",
      fecha: "2026-05-01",
    },
    {
      tipo: "cambio_empresa",
      titulo: "Movimiento a nuevo corporativo",
      fecha: "2026-04-10",
    },
    {
      tipo: "renovacion",
      titulo: "Revision presupuestal H2",
      fecha: "2026-07-01",
    },
    { tipo: "otro", titulo: "Lanzamiento nuevo producto", fecha: "2026-08-15" },
  ];
  const m = milestones[i];
  const result = insertHito.run(
    `hito-seed-misc-${c.id}`,
    c.id,
    m.tipo,
    m.titulo,
    m.fecha,
    0,
    null,
  );
  if (result.changes > 0) hitoCount++;
}
console.log(`Created ${hitoCount} milestones`);

// ---------------------------------------------------------------------------
// 5. Recompute warmth scores
// ---------------------------------------------------------------------------

const allRels = db.prepare("SELECT id FROM relacion_ejecutiva").all() as {
  id: string;
}[];
const getInteractions = db.prepare(
  "SELECT tipo, calidad, fecha FROM interaccion_ejecutiva WHERE relacion_id = ?",
);
const updateWarmth = db.prepare(
  "UPDATE relacion_ejecutiva SET warmth_score = ?, warmth_updated = datetime('now') WHERE id = ?",
);

for (const rel of allRels) {
  const interactions = getInteractions.all(rel.id) as InteractionRow[];
  const score = computeWarmth(interactions);
  updateWarmth.run(score, rel.id);
}
console.log(`Recomputed warmth for ${allRels.length} relationships`);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const summary = db
  .prepare(
    `
  SELECT
    (SELECT COUNT(*) FROM contacto WHERE es_ejecutivo = 1) as exec_contacts,
    (SELECT COUNT(*) FROM relacion_ejecutiva) as relationships,
    (SELECT COUNT(*) FROM interaccion_ejecutiva) as interactions,
    (SELECT COUNT(*) FROM hito_contacto) as milestones,
    (SELECT ROUND(AVG(warmth_score), 1) FROM relacion_ejecutiva) as avg_warmth
`,
  )
  .get() as any;

console.log("\nRelationship seed summary:");
console.log(JSON.stringify(summary, null, 2));
