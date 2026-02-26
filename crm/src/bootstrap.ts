/**
 * CRM Bootstrap
 *
 * Called from engine/src/index.ts after initDatabase().
 * Creates CRM schema tables in the shared SQLite database.
 */

import { getDatabase } from '../../engine/src/db.js';
import { createCrmSchema } from './schema.js';

export function bootstrapCrm(): void {
  const db = getDatabase();
  createCrmSchema(db);
}
