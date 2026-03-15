#!/usr/bin/env tsx
/**
 * Enrich contacts with real names, personal details, strategic notes, and milestones.
 * Idempotent — safe to re-run.
 */

import Database from "better-sqlite3";
import { computeWarmth } from "../crm/src/warmth.js";
import type { InteractionRow } from "../crm/src/warmth.js";

const db = new Database("data/store/crm.db");

const contactData = [
  {
    id: "con-001",
    nombre: "Ricardo Salinas Pliego",
    titulo: "VP Marketing",
    organizacion: "Coca-Cola FEMSA",
    fecha_nacimiento: "1978-06-15",
    notas_personales:
      "Fan del America. Tiene 3 hijos. Le gusta el whisky japones. Prefiere reuniones temprano (8-9am). Juega golf los sabados en Club de Golf Mexico.",
  },
  {
    id: "con-002",
    nombre: "Laura Mendez Torres",
    titulo: "Gerente de Compras de Medios",
    organizacion: "Coca-Cola FEMSA",
    fecha_nacimiento: "1988-02-14",
    notas_personales:
      "Muy detallista con los numeros. Siempre pide desglose por trimestre. Vegana. Corre medio maraton.",
  },
  {
    id: "con-003",
    nombre: "Patricia Gonzalez Rivera",
    titulo: "Directora de Medios y Comunicacion",
    organizacion: "Grupo Bimbo",
    fecha_nacimiento: "1982-03-22",
    notas_personales:
      "Ex-Unilever. Muy analitica, siempre pide ROI comprobable. MBA del IPADE. Le gustan las presentaciones concisas (max 15 slides).",
  },
  {
    id: "con-004",
    nombre: "Alejandro Ruiz Hernandez",
    titulo: "Coordinador de Compras",
    organizacion: "Grupo Bimbo",
    fecha_nacimiento: "1990-07-08",
    notas_personales:
      "Joven pero con mucha iniciativa. Responde rapido por WhatsApp. Le gusta que le manden las cosas por email tambien como respaldo.",
  },
  {
    id: "con-005",
    nombre: "Fernando Martinez Ochoa",
    titulo: "CMO Mexico",
    organizacion: "Procter & Gamble Mexico",
    fecha_nacimiento: "1975-11-08",
    notas_personales:
      "25 anos en P&G. Muy formal, prefiere comunicacion por email. Toma decisiones lento pero cuando dice si, es firme. Colecciona vinos.",
  },
  {
    id: "con-006",
    nombre: "Monica Castillo Reyes",
    titulo: "Buyer Senior de Medios",
    organizacion: "Procter & Gamble Mexico",
    fecha_nacimiento: "1992-09-25",
    notas_personales:
      "Reporta directo a Fernando. Gate-keeper — si ella no aprueba los numeros, no pasa. Muy buena con Excel.",
  },
  {
    id: "con-007",
    nombre: "Carlos Dominguez Vargas",
    titulo: "Director Comercial",
    organizacion: "Unilever Mexico",
    fecha_nacimiento: "1980-09-01",
    notas_personales:
      "Recien llegado de Unilever Brasil (6 meses). Habla portugues. Todavia conociendo el mercado mexicano. Abierto a propuestas innovadoras. Le gusta el futbol.",
  },
  {
    id: "con-008",
    nombre: "Diana Herrera Luna",
    titulo: "Planeadora de Medios",
    organizacion: "Unilever Mexico",
    fecha_nacimiento: "1993-12-03",
    notas_personales:
      "Muy organizada. Maneja el calendario de todas las campanas. Pide confirmaciones por escrito.",
  },
  {
    id: "con-009",
    nombre: "Isabela Navarro Fuentes",
    titulo: "VP de Marketing y Comunicacion",
    organizacion: "L'Oreal Mexico",
    fecha_nacimiento: "1985-04-15",
    notas_personales:
      "Ex-directora creativa en una agencia. Muy visual — las propuestas tienen que verse bien. Le encanta CTV y digital. Escucha podcasts de marketing.",
  },
  {
    id: "con-010",
    nombre: "Roberto Jimenez Aguilar",
    titulo: "Compras Corporativas",
    organizacion: "L'Oreal Mexico",
    fecha_nacimiento: "1987-01-20",
    notas_personales:
      "Muy enfocado en descuentos por volumen. Siempre negocia. Buena relacion con Isabela.",
  },
  {
    id: "con-011",
    nombre: "Gabriel Ortiz Ramirez",
    titulo: "Director de Planeacion de Medios",
    organizacion: "America Movil (Telcel)",
    fecha_nacimiento: "1979-12-30",
    notas_personales:
      "Hijo del fundador de una agencia de medios. Conoce la industria desde chico. Prefiere TV abierta. Conservador en digital. Le gusta el tequila Don Julio.",
  },
  {
    id: "con-012",
    nombre: "Valentina Soto Medina",
    titulo: "Ejecutiva de Compras",
    organizacion: "America Movil (Telcel)",
    fecha_nacimiento: "1995-05-18",
    notas_personales:
      "Recien promovida. Aprende rapido. Gabriel la esta mentoreando. Prefiere comunicacion por WhatsApp.",
  },
  {
    id: "con-013",
    nombre: "Arturo Lozano Perez",
    titulo: "Director de Marketing Digital",
    organizacion: "Liverpool",
    fecha_nacimiento: "1983-08-12",
    notas_personales:
      "Pionero de e-commerce en Liverpool. Muy enfocado en CTV y programatica. Data-driven. Usa Tableau para todo.",
  },
  {
    id: "con-014",
    nombre: "Mariana Delgado Cruz",
    titulo: "Compradora de Medios",
    organizacion: "Liverpool",
    fecha_nacimiento: "1991-11-27",
    notas_personales:
      "Maneja presupuesto de temporadas (Buen Fin, Navidad, Dia de las Madres). Muy estricta con deadlines.",
  },
  {
    id: "con-015",
    nombre: "Hans Mueller Rios",
    titulo: "Head of Marketing Mexico",
    organizacion: "Volkswagen de Mexico",
    fecha_nacimiento: "1977-04-03",
    notas_personales:
      "Aleman-mexicano. Muy puntual y estructurado. Le gustan las presentaciones con benchmarks internacionales. Reporta a Wolfsburg.",
  },
  {
    id: "con-016",
    nombre: "Sofia Ramirez Orozco",
    titulo: "Procurement Specialist",
    organizacion: "Volkswagen de Mexico",
    fecha_nacimiento: "1994-06-22",
    notas_personales:
      "Bilingue aleman-espanol. Traduce para Hans. Gate-keeper para aprobaciones de Wolfsburg.",
  },
  {
    id: "con-017",
    nombre: "Eduardo Flores Campos",
    titulo: "Director de Brand Communications",
    organizacion: "Nestle Mexico",
    fecha_nacimiento: "1981-10-17",
    notas_personales:
      "Ex-Coca-Cola. Conoce bien el mercado de bebidas. Tiene buena relacion con Ricardo Salinas (Coca-Cola). Le gusta innovar con formatos.",
  },
  {
    id: "con-018",
    nombre: "Andrea Mora Gutierrez",
    titulo: "Media Buyer",
    organizacion: "Nestle Mexico",
    fecha_nacimiento: "1996-03-09",
    notas_personales:
      "Primera generacion en medios. Muy tech-savvy. Prefiere dashboards y reportes automatizados.",
  },
  {
    id: "con-019",
    nombre: "Raul Perez Santana",
    titulo: "VP Marketing Oral Care",
    organizacion: "Colgate-Palmolive Mexico",
    fecha_nacimiento: "1976-07-28",
    notas_personales:
      "Veterano de la industria, 30+ anos. Muy leal a proveedores que cumplen. Conservador pero abierto a CTV. Juega padel los jueves.",
  },
  {
    id: "con-020",
    nombre: "Claudia Rios Ibarra",
    titulo: "Coordinadora de Medios",
    organizacion: "Colgate-Palmolive Mexico",
    fecha_nacimiento: "1989-08-14",
    notas_personales:
      "Muy buena relacion con Raul. Lo acompana a todas las reuniones. Maneja el detalle operativo.",
  },
  {
    id: "con-021",
    nombre: "Miguel Angel Torres Vega",
    titulo: "Director de Marketing y Comunicacion",
    organizacion: "BBVA Mexico",
    fecha_nacimiento: "1984-01-05",
    notas_personales:
      "Ex-banquero que se movio a marketing. Piensa en ROI y costo de adquisicion. Le gustan las campanas con call-to-action medible.",
  },
  {
    id: "con-022",
    nombre: "Teresa Gutierrez Solis",
    titulo: "Especialista en Compras de Medios",
    organizacion: "BBVA Mexico",
    fecha_nacimiento: "1990-10-31",
    notas_personales:
      "Proceso de compra muy formal (3 cotizaciones minimo). Tiempos de aprobacion largos (2-3 semanas). Paciente pero firme.",
  },
  {
    id: "con-023",
    nombre: "Jennifer Walsh Lopez",
    titulo: "Head of Brand Marketing Mexico",
    organizacion: "Amazon Mexico",
    fecha_nacimiento: "1986-12-19",
    notas_personales:
      "Americana-mexicana. Trabaja remoto desde CDMX. Estilo Silicon Valley — rapida, data-driven, decision en 48h. Prime Day y Buen Fin son sus tentpoles.",
  },
  {
    id: "con-024",
    nombre: "Daniel Espinoza Ramos",
    titulo: "Media Operations Manager",
    organizacion: "Amazon Mexico",
    fecha_nacimiento: "1993-02-28",
    notas_personales:
      "Todo por sistema. Prefiere portales de autoservicio. Si no esta en el dashboard, no existe. Muy tecnico.",
  },
];

// 1. Update all contacts
const updateContact = db.prepare(
  "UPDATE contacto SET nombre = ?, titulo = ?, organizacion = ?, fecha_nacimiento = ?, notas_personales = ? WHERE id = ?",
);
for (const c of contactData) {
  updateContact.run(
    c.nombre,
    c.titulo,
    c.organizacion,
    c.fecha_nacimiento,
    c.notas_personales,
    c.id,
  );
}
console.log(
  `Updated ${contactData.length} contacts with real names + personal details`,
);

// 2. Fix milestone titles to use real names
const milestones = db
  .prepare("SELECT id, contacto_id, titulo FROM hito_contacto")
  .all() as any[];
for (const m of milestones) {
  const contact = contactData.find((c) => c.id === m.contacto_id);
  if (contact && m.titulo.startsWith("Cumpleanos de")) {
    db.prepare("UPDATE hito_contacto SET titulo = ? WHERE id = ?").run(
      `Cumpleanos de ${contact.nombre}`,
      m.id,
    );
  }
}
console.log("Updated milestone titles with real names");

// 3. Add strategic notes to VP relationships that lack them
const vpId = (
  db.prepare("SELECT id FROM persona WHERE rol = 'vp' LIMIT 1").get() as any
)?.id;
if (vpId) {
  const vpNotes: Record<string, string> = {
    "con-005":
      "Relacion de 10+ anos con la empresa. Fernando es clave para la renovacion del contrato anual de P&G — siempre da la ultima palabra. Acercamiento: datos concretos de ROI, evitar pitch creativo sin sustancia.",
    "con-007":
      "Carlos llego de Brasil hace 6 meses. Oportunidad unica de posicionarnos como su partner de confianza en Mexico antes de que la competencia lo contacte. Invitar a eventos de la industria.",
    "con-009":
      "Isabela mueve el presupuesto digital mas grande del portafolio. Le encanta CTV — es nuestra mejor oportunidad de cross-sell. Clave: mantener la relacion visual (decks bonitos, no solo numeros).",
    "con-011":
      "Gabriel controla el presupuesto de TV abierta mas grande del mercado. Conservador en digital pero abierto a escuchar. No empujar — dejar que el llegue solo. Relacion de respeto.",
    "con-013":
      "Arturo lidera la transformacion digital de Liverpool. Si ganamos su confianza, nos abre la puerta a todo el grupo. Enfoque: CTV + programatica + medicion.",
    "con-015":
      "Hans es el enlace con Wolfsburg. Todo pasa por aprobacion corporativa en Alemania. Tiempos largos pero montos grandes. Paciencia estrategica.",
  };
  for (const [conId, notas] of Object.entries(vpNotes)) {
    db.prepare(
      "UPDATE relacion_ejecutiva SET notas_estrategicas = ? WHERE persona_id = ? AND contacto_id = ? AND notas_estrategicas IS NULL",
    ).run(notas, vpId, conId);
  }
  console.log("Added strategic notes to VP relationships");

  // 4. Add VP relationships for remaining accounts
  const insRel = db.prepare(
    "INSERT OR IGNORE INTO relacion_ejecutiva (id, persona_id, contacto_id, tipo, importancia, notas_estrategicas) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const newVpRels = [
    {
      conId: "con-017",
      imp: "alta",
      notas:
        "Eduardo es ex-Coca-Cola y tiene buena red. Potencial para referenciarnos con otras cuentas CPG.",
    },
    {
      conId: "con-019",
      imp: "media",
      notas:
        "Raul es leal pero conservador. Mantener la relacion estable, no empujar cambios grandes.",
    },
    {
      conId: "con-021",
      imp: "alta",
      notas:
        "BBVA es la cuenta financiera mas grande. Miguel Angel piensa como banquero — todo ROI. Oportunidad en app install campaigns.",
    },
    {
      conId: "con-023",
      imp: "critica",
      notas:
        "Amazon es el futuro. Jennifer decide rapido. Si le das datos buenos, cierra en 48h. Nuestra cuenta de mayor crecimiento.",
    },
  ];
  let relN = 0;
  for (const r of newVpRels) {
    const res = insRel.run(
      `rel-enrich-${vpId}-${r.conId}`,
      vpId,
      r.conId,
      "cliente",
      r.imp,
      r.notas,
    );
    if (res.changes > 0) relN++;
  }
  console.log(`Added ${relN} new VP relationships`);

  // 5. Add interactions for the new VP relationships
  const insInt = db.prepare(
    "INSERT OR IGNORE INTO interaccion_ejecutiva (id, relacion_id, tipo, resumen, calidad, lugar, fecha) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  const newInts = [
    {
      relSuffix: "con-017",
      interactions: [
        {
          tipo: "comida",
          resumen:
            "Comida con Eduardo para conocerlo mejor despues de su cambio de Coca-Cola. Muy abierto a explorar formatos nuevos.",
          calidad: "buena",
          lugar: "Restaurante Pujol",
          days: 20,
        },
        {
          tipo: "reunion",
          resumen:
            "Presentacion de resultados Q4 para Nestle. Impresionado con el reach en CTV.",
          calidad: "excepcional",
          lugar: "Oficinas Nestle Santa Fe",
          days: 45,
        },
      ],
    },
    {
      relSuffix: "con-019",
      interactions: [
        {
          tipo: "llamada",
          resumen:
            "Llamada de cortesia. Raul contento con la ejecucion de la campana de pasta dental.",
          calidad: "normal",
          lugar: null,
          days: 15,
        },
        {
          tipo: "comida",
          resumen:
            "Comida para hablar de planes 2026. Quiere mantener TV abierta como base.",
          calidad: "buena",
          lugar: "Club de Industriales",
          days: 60,
        },
      ],
    },
    {
      relSuffix: "con-021",
      interactions: [
        {
          tipo: "reunion",
          resumen:
            "Reunion con Miguel Angel y su equipo de performance marketing. Muy interesado en CTV para app installs.",
          calidad: "excepcional",
          lugar: "Torre BBVA Reforma",
          days: 10,
        },
        {
          tipo: "email",
          resumen:
            "Le envie el caso de exito de Telcel en CTV. Respondio que quiere una propuesta formal.",
          calidad: "buena",
          lugar: null,
          days: 5,
        },
        {
          tipo: "llamada",
          resumen:
            "Follow-up sobre la propuesta de CTV. Esta en aprobacion interna.",
          calidad: "normal",
          lugar: null,
          days: 2,
        },
      ],
    },
    {
      relSuffix: "con-023",
      interactions: [
        {
          tipo: "reunion",
          resumen:
            "Pitch para Prime Day 2026. Jennifer pidio propuesta de TV+CTV+digital integrado.",
          calidad: "excepcional",
          lugar: "Amazon HQ Polanco (virtual)",
          days: 7,
        },
        {
          tipo: "email",
          resumen: "Envio de propuesta integrada Prime Day. Valor: 18M MXN.",
          calidad: "buena",
          lugar: null,
          days: 4,
        },
        {
          tipo: "llamada",
          resumen:
            "Jennifer confirmo interes. Pide ajustar el split CTV vs linear a 40/60.",
          calidad: "excepcional",
          lugar: null,
          days: 1,
        },
      ],
    },
  ];
  let intN = 0;
  for (const group of newInts) {
    const relId = `rel-enrich-${vpId}-${group.relSuffix}`;
    for (let j = 0; j < group.interactions.length; j++) {
      const i = group.interactions[j];
      const fecha = new Date(Date.now() - i.days * 86_400_000).toISOString();
      const res = insInt.run(
        `intej-enrich-${group.relSuffix}-${j}`,
        relId,
        i.tipo,
        i.resumen,
        i.calidad,
        i.lugar,
        fecha,
      );
      if (res.changes > 0) intN++;
    }
  }
  console.log(`Added ${intN} new interactions`);
}

// 6. Add milestones for contacts that lack them
const insHito = db.prepare(
  "INSERT OR IGNORE INTO hito_contacto (id, contacto_id, tipo, titulo, fecha, recurrente) VALUES (?, ?, ?, ?, ?, ?)",
);
const newMilestones = [
  {
    contacto_id: "con-013",
    tipo: "renovacion",
    titulo: "Negociacion presupuesto Buen Fin 2026",
    fecha: "2026-08-01",
    recurrente: 0,
  },
  {
    contacto_id: "con-015",
    tipo: "aniversario",
    titulo: "5 anos de Hans como Head of Marketing",
    fecha: "2026-04-15",
    recurrente: 0,
  },
  {
    contacto_id: "con-017",
    tipo: "ascenso",
    titulo: "Eduardo promovido a VP (rumor)",
    fecha: "2026-05-15",
    recurrente: 0,
  },
  {
    contacto_id: "con-019",
    tipo: "aniversario",
    titulo: "30 anos de Raul en la industria",
    fecha: "2026-09-01",
    recurrente: 0,
  },
  {
    contacto_id: "con-021",
    tipo: "renovacion",
    titulo: "Revision semestral presupuesto BBVA",
    fecha: "2026-06-30",
    recurrente: 0,
  },
  {
    contacto_id: "con-023",
    tipo: "otro",
    titulo: "Prime Day 2026 — ventana de pitch",
    fecha: "2026-07-10",
    recurrente: 0,
  },
  {
    contacto_id: "con-013",
    tipo: "cumpleanos",
    titulo: "Cumpleanos de Arturo Lozano Perez",
    fecha: "1983-08-12",
    recurrente: 1,
  },
  {
    contacto_id: "con-015",
    tipo: "cumpleanos",
    titulo: "Cumpleanos de Hans Mueller Rios",
    fecha: "1977-04-03",
    recurrente: 1,
  },
  {
    contacto_id: "con-017",
    tipo: "cumpleanos",
    titulo: "Cumpleanos de Eduardo Flores Campos",
    fecha: "1981-10-17",
    recurrente: 1,
  },
  {
    contacto_id: "con-019",
    tipo: "cumpleanos",
    titulo: "Cumpleanos de Raul Perez Santana",
    fecha: "1976-07-28",
    recurrente: 1,
  },
  {
    contacto_id: "con-021",
    tipo: "cumpleanos",
    titulo: "Cumpleanos de Miguel Angel Torres Vega",
    fecha: "1984-01-05",
    recurrente: 1,
  },
  {
    contacto_id: "con-023",
    tipo: "cumpleanos",
    titulo: "Cumpleanos de Jennifer Walsh Lopez",
    fecha: "1986-12-19",
    recurrente: 1,
  },
];
let hitoN = 0;
for (const m of newMilestones) {
  const r = insHito.run(
    `hito-enrich-${m.contacto_id}-${m.tipo.slice(0, 4)}`,
    m.contacto_id,
    m.tipo,
    m.titulo,
    m.fecha,
    m.recurrente,
  );
  if (r.changes > 0) hitoN++;
}
console.log(`Added ${hitoN} new milestones`);

// 7. Recompute warmth for all relationships
const allRels = db.prepare("SELECT id FROM relacion_ejecutiva").all() as {
  id: string;
}[];
const getInt = db.prepare(
  "SELECT tipo, calidad, fecha FROM interaccion_ejecutiva WHERE relacion_id = ?",
);
const updW = db.prepare(
  "UPDATE relacion_ejecutiva SET warmth_score = ?, warmth_updated = datetime('now') WHERE id = ?",
);
for (const r of allRels) {
  const ints = getInt.all(r.id) as InteractionRow[];
  updW.run(computeWarmth(ints), r.id);
}
console.log(`Recomputed warmth for ${allRels.length} relationships`);

// Summary
const s = db
  .prepare(
    `
  SELECT
    (SELECT COUNT(*) FROM contacto WHERE notas_personales IS NOT NULL) as contacts_with_notes,
    (SELECT COUNT(*) FROM contacto WHERE fecha_nacimiento IS NOT NULL) as contacts_with_bday,
    (SELECT COUNT(*) FROM relacion_ejecutiva) as relationships,
    (SELECT COUNT(*) FROM relacion_ejecutiva WHERE notas_estrategicas IS NOT NULL) as rels_with_strategy,
    (SELECT COUNT(*) FROM interaccion_ejecutiva) as interactions,
    (SELECT COUNT(*) FROM hito_contacto) as milestones
`,
  )
  .get() as any;
console.log("\nFinal summary:", JSON.stringify(s, null, 2));
db.close();
