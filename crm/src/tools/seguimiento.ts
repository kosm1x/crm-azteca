/**
 * Follow-up / Reminder Tools
 *
 * establecer_recordatorio — creates a calendar event of type 'seguimiento'
 */

import type { ToolContext } from './index.js';
import { crear_evento_calendario } from './calendar.js';
import { findCuentaId } from './helpers.js';
import { getDatabase } from '../db.js';

// ---------------------------------------------------------------------------
// establecer_recordatorio
// ---------------------------------------------------------------------------

export async function establecer_recordatorio(args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  // Resolve optional cuenta_nombre → cuenta_id
  let cuentaId: string | undefined;
  if (args.cuenta_nombre) {
    const resolved = findCuentaId(args.cuenta_nombre as string);
    if (resolved) cuentaId = resolved;
  }

  // Resolve optional propuesta_titulo → propuesta_id
  let propuestaId: string | undefined;
  if (args.propuesta_titulo) {
    const db = getDatabase();
    const row = db.prepare('SELECT id FROM propuesta WHERE titulo LIKE ?').get(`%${args.propuesta_titulo}%`) as any;
    if (row) propuestaId = row.id;
  }

  // A reminder is just a calendar event of type seguimiento
  return crear_evento_calendario({
    titulo: args.titulo,
    fecha_inicio: args.fecha,
    tipo: 'seguimiento',
    cuenta_id: cuentaId,
    propuesta_id: propuestaId,
    duracion_minutos: 15,
    descripcion: `Recordatorio: ${args.titulo as string}`,
  }, ctx);
}
