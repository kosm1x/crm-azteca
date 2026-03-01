/**
 * CRM IPC Handlers
 *
 * Handles CRM-specific IPC task types delegated from engine/src/ipc.ts.
 * The engine calls processCrmIpc() for any IPC type it doesn't recognize.
 */

import { getDatabase } from '../../engine/src/db.js';
import { getPersonByGroupFolder, hasAccessTo } from './hierarchy.js';
import { logger } from './logger.js';
import type { IpcDeps } from '../../engine/src/ipc.js';

// --- Input validation helpers ---

const VALID_INTERACTION_TYPES = new Set(['call', 'meeting', 'email', 'whatsapp', 'event', 'other']);
const VALID_STAGES = new Set(['prospecting', 'qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost']);
const VALID_PRIORITIES = new Set(['low', 'medium', 'high']);
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T[\d:.Z+-]+)?$/;

function validateEnum(value: unknown, allowed: Set<string>, fallback: string): string {
  return typeof value === 'string' && allowed.has(value) ? value : fallback;
}

function validateDate(value: unknown): string | null {
  return typeof value === 'string' && ISO_DATE_RE.test(value) ? value : null;
}

function validateNumber(value: unknown, min: number, max = Infinity): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

const MAX_TEXT_LENGTH = 10_000;

/** Type-checked string extraction with length limit. Returns undefined if value is not a string. */
function asString(value: unknown, maxLength = MAX_TEXT_LENGTH): string | undefined {
  if (typeof value !== 'string') return undefined;
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

// --- Lazy prepared statement cache ---

let _stmts: ReturnType<typeof buildStatements> | null = null;

function stmts() {
  if (!_stmts) _stmts = buildStatements();
  return _stmts;
}

function buildStatements() {
  const db = getDatabase();
  return {
    auditLog: db.prepare(`
      INSERT INTO crm_activity_log (person_id, group_folder, action, entity_type, entity_id, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    insertInteraction: db.prepare(`
      INSERT INTO crm_interactions (id, account_id, contact_id, opportunity_id, person_id, type, summary, outcome, follow_up_date, follow_up_action, logged_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getOppOwner: db.prepare(
      'SELECT owner_id FROM crm_opportunities WHERE id = ?',
    ),
    updateOpp: db.prepare(`
      UPDATE crm_opportunities SET
        stage = COALESCE(?, stage),
        amount = COALESCE(?, amount),
        probability = COALESCE(?, probability),
        close_date = COALESCE(?, close_date),
        notes = COALESCE(?, notes),
        updated_at = ?
      WHERE id = ?
    `),
    insertTask: db.prepare(`
      INSERT INTO crm_tasks_crm (id, person_id, account_id, opportunity_id, title, description, due_date, priority, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `),
  };
}

/** @internal Reset cached statements when the database instance changes (tests only). */
export function _resetStatementCache(): void {
  _stmts = null;
}

/** Write an entry to the crm_activity_log audit trail. */
function auditLog(
  personId: string,
  groupFolder: string | null,
  action: string,
  entityType: string,
  entityId: string,
  details?: string,
): void {
  stmts().auditLog.run(personId, groupFolder, action, entityType, entityId, details ?? null, new Date().toISOString());
}

/** Classify and log IPC errors with appropriate severity. */
function handleIpcError(err: unknown, sourceGroup: string, type: unknown): true {
  const code = (err as any)?.code;
  if (code === 'SQLITE_BUSY' || code === 'SQLITE_LOCKED') {
    logger.error({ err, sourceGroup, type }, 'CRM IPC transient DB error (message lost)');
  } else if (typeof code === 'string' && code.startsWith('SQLITE_CONSTRAINT')) {
    logger.warn({ err, sourceGroup, type }, 'CRM IPC constraint violation');
  } else {
    logger.error({ err, sourceGroup, type }, 'CRM IPC handler error');
  }
  return true;
}

export async function processCrmIpc(
  data: Record<string, unknown>,
  sourceGroup: string,
  _isMain: boolean,
  _deps: IpcDeps,
): Promise<boolean> {
  const db = getDatabase();

  switch (data.type) {
    case 'crm_log_interaction': {
      try {
        const person = getPersonByGroupFolder(sourceGroup);
        if (!person) {
          logger.warn({ sourceGroup }, 'Unknown person for group');
          return true;
        }

        const id = `int-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const now = new Date().toISOString();

        stmts().insertInteraction.run(
          id,
          asString(data.account_id) ?? null,
          asString(data.contact_id) ?? null,
          asString(data.opportunity_id) ?? null,
          person.id,
          validateEnum(data.interaction_type, VALID_INTERACTION_TYPES, 'other'),
          asString(data.summary) ?? '',
          asString(data.outcome) ?? null,
          validateDate(data.follow_up_date),
          asString(data.follow_up_action) ?? null,
          now, // always use server-side timestamp — agents must not backdate records
          now,
        );

        auditLog(person.id, sourceGroup, 'create', 'interaction', id);
        logger.info({ id, person: person.name }, 'Interaction logged');
        return true;
      } catch (err) {
        return handleIpcError(err, sourceGroup, data.type);
      }
    }

    case 'crm_update_opportunity': {
      try {
        const person = getPersonByGroupFolder(sourceGroup);
        if (!person) {
          logger.warn({ sourceGroup }, 'Unknown person for group');
          return true;
        }

        const oppId = asString(data.opportunity_id);
        if (!oppId) {
          logger.warn({ sourceGroup }, 'Missing opportunity_id in crm_update_opportunity');
          return true;
        }

        // Fetch opportunity to verify ownership before applying any changes
        const opp = stmts().getOppOwner.get(oppId) as { owner_id: string } | undefined;
        if (!opp) {
          logger.warn({ oppId, sourceGroup }, 'Opportunity not found');
          return true;
        }
        if (!hasAccessTo(person, opp.owner_id)) {
          auditLog(person.id, sourceGroup, 'access_denied', 'opportunity', oppId,
            JSON.stringify({ attempted_action: 'update', owner: opp.owner_id }));
          logger.warn({ sourceGroup, oppId }, 'Access denied: cannot update opportunity');
          return true;
        }

        // Validate fields — null means "absent or invalid, keep current value" via COALESCE
        const stage = typeof data.stage === 'string' && VALID_STAGES.has(data.stage) ? data.stage : null;
        const amount = validateNumber(data.amount, 0);
        const probability = validateNumber(data.probability, 0, 100);
        const closeDate = validateDate(data.close_date);
        const notes = asString(data.notes);

        // Skip if no valid fields provided
        if (stage === null && amount === null && probability === null && closeDate === null && notes === undefined) {
          return true;
        }

        const updateFn = db.transaction(() => {
          stmts().updateOpp.run(
            stage, amount, probability, closeDate, notes ?? null,
            new Date().toISOString(), oppId,
          );
          auditLog(person.id, sourceGroup, 'update', 'opportunity', oppId, JSON.stringify({ stage, amount, probability }));
        });
        updateFn();
        logger.info({ oppId, person: person.name }, 'Opportunity updated');

        return true;
      } catch (err) {
        return handleIpcError(err, sourceGroup, data.type);
      }
    }

    case 'crm_create_task': {
      try {
        const person = getPersonByGroupFolder(sourceGroup);
        if (!person) {
          logger.warn({ sourceGroup }, 'Unknown person for group');
          return true;
        }

        const id = `crmt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const now = new Date().toISOString();

        stmts().insertTask.run(
          id,
          person.id,
          asString(data.account_id) ?? null,
          asString(data.opportunity_id) ?? null,
          asString(data.title) ?? 'Follow up',
          asString(data.description) ?? null,
          validateDate(data.due_date),
          validateEnum(data.priority, VALID_PRIORITIES, 'medium'),
          now,
        );

        auditLog(person.id, sourceGroup, 'create', 'task', id);
        logger.info({ id, person: person.name }, 'CRM task created');
        return true;
      } catch (err) {
        return handleIpcError(err, sourceGroup, data.type);
      }
    }

    default:
      return false; // Not a CRM IPC type
  }
}
