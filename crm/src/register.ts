/**
 * Batch Hierarchy Registration
 *
 * Registers sales team members from a CSV/JSON file.
 * Creates crm_people records and corresponding WhatsApp groups.
 *
 * TODO: Implementation
 * - Parse CSV/JSON input with columns: name, role, phone, email, manager_name
 * - Create crm_people records with auto-generated IDs
 * - Resolve manager relationships by name → id lookup
 * - Create WhatsApp groups via engine IPC (register_group)
 * - Generate group folders following naming convention: role-firstname-lastname
 * - Apply appropriate CLAUDE.md template based on role
 */

export interface TeamMember {
  name: string;
  role: 'ae' | 'manager' | 'director' | 'vp';
  phone: string;
  email?: string;
  manager_name?: string;
}

export async function registerTeamFromFile(_filePath: string): Promise<void> {
  // TODO: Implement batch registration
  throw new Error('Batch registration not yet implemented');
}

export async function registerSinglePerson(_member: TeamMember): Promise<string> {
  // TODO: Implement single person registration
  throw new Error('Single person registration not yet implemented');
}
