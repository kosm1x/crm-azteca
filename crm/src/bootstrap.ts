/**
 * CRM Bootstrap
 *
 * Called from engine/src/index.ts after initDatabase().
 * Creates CRM schema tables in the shared SQLite database.
 */

import { getDatabase } from '../../engine/src/db.js';
import { logger } from './logger.js';
import { createCrmSchema } from './schema.js';

const EXPECTED_CRM_TABLES = 13;

export function bootstrapCrm(): void {
  const db = getDatabase();
  try {
    // Performance pragmas — safe for single-writer, multi-reader pattern
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('cache_size = -64000');
    db.pragma('temp_store = MEMORY');
    db.pragma('mmap_size = 268435456');

    createCrmSchema(db);

    const tables = db
      .prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name LIKE 'crm_%'")
      .get() as { c: number };

    if (tables.c < EXPECTED_CRM_TABLES) {
      logger.warn({ expected: EXPECTED_CRM_TABLES, actual: tables.c }, 'CRM table count mismatch');
    }

    logger.info({ tables: tables.c }, 'CRM schema initialized');
  } catch (err) {
    logger.error({ err }, 'CRM bootstrap failed');
    throw err;
  }
}
