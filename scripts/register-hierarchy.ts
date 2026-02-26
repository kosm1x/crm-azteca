/**
 * Register Hierarchy Script
 *
 * Registers the sales team hierarchy from a CSV or JSON file.
 *
 * Usage:
 *   tsx scripts/register-hierarchy.ts --file team.csv
 *   tsx scripts/register-hierarchy.ts --file team.json
 *
 * CSV format:
 *   name,role,phone,email,manager_name
 *   "VP Name",vp,+521234567890,vp@company.com,
 *   "Director Name",director,+521234567891,dir@company.com,"VP Name"
 *   ...
 *
 * JSON format:
 *   [{ "name": "...", "role": "...", "phone": "...", "email": "...", "manager_name": "..." }]
 *
 * TODO: Implement
 * - Parse CLI args for --file
 * - Read and parse CSV/JSON
 * - Initialize database
 * - Create crm_people records in hierarchy order (VP first, then directors, managers, AEs)
 * - Create WhatsApp groups and register them via engine IPC
 * - Generate CLAUDE.md for each group from role templates
 */

console.log('TODO: register-hierarchy not yet implemented');
console.log('Usage: tsx scripts/register-hierarchy.ts --file team.csv');
process.exit(1);
