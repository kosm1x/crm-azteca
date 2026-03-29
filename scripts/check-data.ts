import { getDatabase } from '../crm/src/db.js';
const db = getDatabase();

console.log('=== PROPUESTAS (closed) ===');
const closed = db.prepare("SELECT etapa, COUNT(*) as cnt, MIN(fecha_ultima_actividad) as oldest, MAX(fecha_ultima_actividad) as newest FROM propuesta WHERE etapa IN ('completada','perdida','cancelada') GROUP BY etapa").all();
console.log(JSON.stringify(closed, null, 2));

console.log('\n=== ACTIVIDADES ===');
const acts = db.prepare('SELECT COUNT(*) as cnt, MIN(fecha) as oldest, MAX(fecha) as newest FROM actividad').get();
console.log(JSON.stringify(acts, null, 2));

console.log('\n=== CUOTAS ===');
const cuotas = db.prepare('SELECT año, MIN(semana) as min_sem, MAX(semana) as max_sem, COUNT(*) as cnt FROM cuota GROUP BY año').all();
console.log(JSON.stringify(cuotas, null, 2));

console.log('\n=== DESCARGAS ===');
const desc = db.prepare('SELECT año, MIN(semana) as min_sem, MAX(semana) as max_sem, COUNT(*) as cnt FROM descarga GROUP BY año').all();
console.log(JSON.stringify(desc, null, 2));

console.log('\n=== PERSONAS ===');
const pers = db.prepare("SELECT rol, COUNT(*) as cnt FROM persona WHERE activo=1 GROUP BY rol").all();
console.log(JSON.stringify(pers, null, 2));

console.log('\n=== datetime(now) vs seed dates ===');
const now = db.prepare("SELECT datetime('now') as now, datetime('now', '-28 days') as four_weeks_ago, datetime('now', '-90 days') as ninety_days_ago").get();
console.log(JSON.stringify(now));

console.log('\n=== Win/Loss: last 90 days ===');
const wl = db.prepare("SELECT COUNT(*) as cnt FROM propuesta WHERE etapa IN ('completada','perdida','cancelada') AND fecha_ultima_actividad >= datetime('now', '-90 days')").get();
console.log(JSON.stringify(wl));

console.log('\n=== Activities last 84 days (12 weeks) ===');
const actRecent = db.prepare("SELECT COUNT(*) as cnt FROM actividad WHERE fecha >= datetime('now', '-84 days')").get();
console.log(JSON.stringify(actRecent));

console.log('\n=== Sample propuesta dates ===');
const samples = db.prepare("SELECT titulo, etapa, fecha_creacion, fecha_ultima_actividad FROM propuesta WHERE etapa IN ('completada','perdida','cancelada') ORDER BY fecha_ultima_actividad DESC LIMIT 5").all();
console.log(JSON.stringify(samples, null, 2));

console.log('\n=== Sample actividad dates ===');
const actSamples = db.prepare("SELECT fecha, tipo, sentimiento FROM actividad ORDER BY fecha DESC LIMIT 5").all();
console.log(JSON.stringify(actSamples, null, 2));
