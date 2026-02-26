/**
 * Hierarchy Helpers
 *
 * Utilities for querying the sales team hierarchy.
 * Used by IPC handlers and access control checks.
 */

import type Database from 'better-sqlite3';
import { getDatabase } from '../../engine/src/db.js';

export interface Person {
  id: string;
  name: string;
  role: 'ae' | 'manager' | 'director' | 'vp';
  phone: string | null;
  email: string | null;
  manager_id: string | null;
  group_folder: string | null;
  group_jid: string | null;
  team_group_jid: string | null;
  active: number;
  created_at: string;
}

function db(): Database.Database {
  return getDatabase();
}

/** Get a person by their group folder (how agents identify themselves). */
export function getPersonByGroupFolder(groupFolder: string): Person | undefined {
  return db()
    .prepare('SELECT * FROM crm_people WHERE group_folder = ? AND active = 1')
    .get(groupFolder) as Person | undefined;
}

/** Get a person by ID. */
export function getPersonById(id: string): Person | undefined {
  return db()
    .prepare('SELECT * FROM crm_people WHERE id = ?')
    .get(id) as Person | undefined;
}

/** Get all direct reports for a manager/director/VP. */
export function getDirectReports(managerId: string): Person[] {
  return db()
    .prepare('SELECT * FROM crm_people WHERE manager_id = ? AND active = 1')
    .all(managerId) as Person[];
}

/** Check if personA is the direct manager of personB. */
export function isManagerOf(managerId: string, reportId: string): boolean {
  const report = getPersonById(reportId);
  return report?.manager_id === managerId;
}

/** Check if personA is a director over personB (two levels up). */
export function isDirectorOf(directorId: string, personId: string): boolean {
  const person = getPersonById(personId);
  if (!person?.manager_id) return false;

  // Direct report of the director
  if (person.manager_id === directorId) return true;

  // Report's manager reports to the director
  const manager = getPersonById(person.manager_id);
  return manager?.manager_id === directorId;
}

/** Check if a person is a VP (top of hierarchy). */
export function isVp(personId: string): boolean {
  const person = getPersonById(personId);
  return person?.role === 'vp';
}

/** Get all people in a manager's subtree (recursive). */
export function getSubtree(rootId: string): Person[] {
  const result: Person[] = [];
  const queue = [rootId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const reports = getDirectReports(currentId);
    for (const report of reports) {
      result.push(report);
      queue.push(report.id);
    }
  }

  return result;
}

/** Check if sourceGroup has access to data owned by targetPersonId. */
export function hasAccessTo(sourceGroupFolder: string, targetPersonId: string): boolean {
  const source = getPersonByGroupFolder(sourceGroupFolder);
  if (!source) return false;

  // People can always access their own data
  if (source.id === targetPersonId) return true;

  // Managers can access their direct reports' data
  if (source.role === 'manager') return isManagerOf(source.id, targetPersonId);

  // Directors can access their subtree
  if (source.role === 'director') return isDirectorOf(source.id, targetPersonId);

  // VPs can access everything
  if (source.role === 'vp') return true;

  return false;
}
