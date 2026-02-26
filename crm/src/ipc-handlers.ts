/**
 * CRM IPC Handlers
 *
 * Handles CRM-specific IPC task types delegated from engine/src/ipc.ts.
 * The engine calls processCrmIpc() for any IPC type it doesn't recognize.
 */

import { getDatabase } from '../../engine/src/db.js';
import { getPersonByGroupFolder, hasAccessTo } from './hierarchy.js';
import type { IpcDeps } from '../../engine/src/ipc.js';

// TODO: Import logger from engine when available
const log = (msg: string) => console.log(`[crm-ipc] ${msg}`);

export async function processCrmIpc(
  data: Record<string, unknown>,
  sourceGroup: string,
  isMain: boolean,
  _deps: IpcDeps,
): Promise<boolean> {
  const db = getDatabase();

  switch (data.type) {
    case 'crm_log_interaction': {
      // TODO: Validate fields, check access, insert into crm_interactions
      const person = getPersonByGroupFolder(sourceGroup);
      if (!person) {
        log(`Unknown person for group ${sourceGroup}`);
        return true;
      }

      const id = `int-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO crm_interactions (id, account_id, contact_id, opportunity_id, person_id, type, summary, outcome, follow_up_date, follow_up_action, logged_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        (data.account_id as string) || null,
        (data.contact_id as string) || null,
        (data.opportunity_id as string) || null,
        person.id,
        (data.interaction_type as string) || 'other',
        (data.summary as string) || '',
        (data.outcome as string) || null,
        (data.follow_up_date as string) || null,
        (data.follow_up_action as string) || null,
        (data.logged_at as string) || now,
        now,
      );

      log(`Interaction logged: ${id} by ${person.name}`);
      return true;
    }

    case 'crm_update_opportunity': {
      // TODO: Validate fields, check access, update crm_opportunities
      const person = getPersonByGroupFolder(sourceGroup);
      if (!person) return true;

      const oppId = data.opportunity_id as string;
      if (!oppId) return true;

      // TODO: Check that person has access to this opportunity's owner
      const updates: string[] = [];
      const values: unknown[] = [];

      if (data.stage) { updates.push('stage = ?'); values.push(data.stage); }
      if (data.amount) { updates.push('amount = ?'); values.push(data.amount); }
      if (data.probability) { updates.push('probability = ?'); values.push(data.probability); }
      if (data.close_date) { updates.push('close_date = ?'); values.push(data.close_date); }
      if (data.notes) { updates.push('notes = ?'); values.push(data.notes); }

      if (updates.length > 0) {
        updates.push('updated_at = ?');
        values.push(new Date().toISOString());
        values.push(oppId);
        db.prepare(`UPDATE crm_opportunities SET ${updates.join(', ')} WHERE id = ?`).run(...values);
        log(`Opportunity updated: ${oppId} by ${person.name}`);
      }

      return true;
    }

    case 'crm_create_task': {
      // TODO: Create a CRM follow-up task
      const person = getPersonByGroupFolder(sourceGroup);
      if (!person) return true;

      const id = `crmt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO crm_tasks_crm (id, person_id, account_id, opportunity_id, title, description, due_date, priority, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
      `).run(
        id,
        person.id,
        (data.account_id as string) || null,
        (data.opportunity_id as string) || null,
        (data.title as string) || 'Follow up',
        (data.description as string) || null,
        (data.due_date as string) || null,
        (data.priority as string) || 'medium',
        now,
      );

      log(`CRM task created: ${id} by ${person.name}`);
      return true;
    }

    default:
      return false; // Not a CRM IPC type
  }
}
