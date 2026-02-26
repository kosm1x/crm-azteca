/**
 * Seed Data Script
 *
 * Imports initial CRM data: accounts, contacts, quotas, events, media types.
 *
 * Usage:
 *   tsx scripts/seed-data.ts --accounts accounts.csv
 *   tsx scripts/seed-data.ts --contacts contacts.csv
 *   tsx scripts/seed-data.ts --quotas quotas.csv
 *   tsx scripts/seed-data.ts --events events.csv
 *   tsx scripts/seed-data.ts --media-types media-types.csv
 *   tsx scripts/seed-data.ts --all data/  # Import all CSVs from directory
 *
 * TODO: Implement
 * - Parse CLI args for data type and file path
 * - Read and parse CSV/JSON input
 * - Initialize database
 * - Insert records into appropriate CRM tables
 * - Validate foreign key references (e.g., account owner must exist in crm_people)
 * - Report import summary (records created, errors)
 */

console.log('TODO: seed-data not yet implemented');
console.log('Usage: tsx scripts/seed-data.ts --accounts accounts.csv');
process.exit(1);
