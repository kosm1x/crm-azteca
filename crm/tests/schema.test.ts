import Database from 'better-sqlite3';
import { describe, it, expect, beforeEach } from 'vitest';
import { createCrmSchema } from '../src/schema.js';

let db: InstanceType<typeof Database>;

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  createCrmSchema(db);
});

const NOW = '2024-01-01T00:00:00.000Z';

const CRM_TABLES = [
  'crm_people',
  'crm_accounts',
  'crm_contacts',
  'crm_opportunities',
  'crm_interactions',
  'crm_quotas',
  'crm_events',
  'crm_media_types',
  'crm_proposals',
  'crm_tasks_crm',
  'crm_activity_log',
];

const RAG_TABLES = ['crm_documents', 'crm_embeddings'];

describe('CRM Schema', () => {
  it('creates all 11 CRM tables', () => {
    const tables = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'crm_%' ORDER BY name`,
      )
      .all()
      .map((r: any) => r.name);

    for (const t of CRM_TABLES) {
      expect(tables).toContain(t);
    }
  });

  it('creates 2 RAG tables', () => {
    const tables = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'crm_%' ORDER BY name`,
      )
      .all()
      .map((r: any) => r.name);

    for (const t of RAG_TABLES) {
      expect(tables).toContain(t);
    }
  });

  it('creates all indexes including composites', () => {
    const indexes = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_crm_%' ORDER BY name`,
      )
      .all()
      .map((r: any) => r.name);

    const expected = [
      'idx_crm_people_manager',
      'idx_crm_people_role',
      'idx_crm_people_group_folder',
      'idx_crm_accounts_owner',
      'idx_crm_contacts_account',
      'idx_crm_opps_owner',
      'idx_crm_opps_account',
      'idx_crm_opps_stage',
      'idx_crm_opps_owner_stage',
      'idx_crm_opps_account_stage',
      'idx_crm_interactions_person',
      'idx_crm_interactions_account',
      'idx_crm_interactions_logged',
      'idx_crm_interactions_person_logged',
      'idx_crm_interactions_account_logged',
      'idx_crm_quotas_person',
      'idx_crm_quotas_person_period',
      'idx_crm_proposals_opp',
      'idx_crm_tasks_person',
      'idx_crm_tasks_due',
      'idx_crm_tasks_person_status',
      'idx_crm_tasks_person_status_due',
      'idx_crm_activity_log_person',
      'idx_crm_activity_log_created',
      'idx_crm_embeddings_doc',
    ];
    for (const idx of expected) {
      expect(indexes).toContain(idx);
    }
  });

  it('enforces foreign key constraints', () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO crm_accounts (id, name, owner_id, created_at, updated_at) VALUES ('a1', 'Test', 'nonexistent', ?, ?)`,
        )
        .run(NOW, NOW),
    ).toThrow(/FOREIGN KEY/);
  });

  it('allows basic CRUD on crm_people', () => {
    db.prepare(
      `INSERT INTO crm_people (id, name, role, created_at) VALUES ('p1', 'Test', 'ae', ?)`,
    ).run(NOW);

    const row = db.prepare('SELECT * FROM crm_people WHERE id = ?').get('p1') as any;
    expect(row.name).toBe('Test');
    expect(row.role).toBe('ae');

    db.prepare(`UPDATE crm_people SET name = 'Updated' WHERE id = 'p1'`).run();
    const updated = db.prepare('SELECT name FROM crm_people WHERE id = ?').get('p1') as any;
    expect(updated.name).toBe('Updated');

    db.prepare(`DELETE FROM crm_people WHERE id = 'p1'`).run();
    const deleted = db.prepare('SELECT * FROM crm_people WHERE id = ?').get('p1');
    expect(deleted).toBeUndefined();
  });

  it('allows basic CRUD on crm_accounts', () => {
    db.prepare(
      `INSERT INTO crm_people (id, name, role, created_at) VALUES ('p1', 'Owner', 'ae', ?)`,
    ).run(NOW);
    db.prepare(
      `INSERT INTO crm_accounts (id, name, owner_id, created_at, updated_at) VALUES ('a1', 'Acme', 'p1', ?, ?)`,
    ).run(NOW, NOW);

    const row = db.prepare('SELECT * FROM crm_accounts WHERE id = ?').get('a1') as any;
    expect(row.name).toBe('Acme');

    db.prepare(`UPDATE crm_accounts SET name = 'Acme Corp' WHERE id = 'a1'`).run();
    const updated = db.prepare('SELECT name FROM crm_accounts WHERE id = ?').get('a1') as any;
    expect(updated.name).toBe('Acme Corp');

    db.prepare(`DELETE FROM crm_accounts WHERE id = 'a1'`).run();
    const deleted = db.prepare('SELECT * FROM crm_accounts WHERE id = ?').get('a1');
    expect(deleted).toBeUndefined();
  });

  it('allows basic CRUD on crm_opportunities', () => {
    db.prepare(
      `INSERT INTO crm_people (id, name, role, created_at) VALUES ('p1', 'Owner', 'ae', ?)`,
    ).run(NOW);
    db.prepare(
      `INSERT INTO crm_accounts (id, name, owner_id, created_at, updated_at) VALUES ('a1', 'Acme', 'p1', ?, ?)`,
    ).run(NOW, NOW);
    db.prepare(
      `INSERT INTO crm_opportunities (id, account_id, owner_id, name, stage, created_at, updated_at) VALUES ('o1', 'a1', 'p1', 'Deal', 'prospecting', ?, ?)`,
    ).run(NOW, NOW);

    const row = db.prepare('SELECT * FROM crm_opportunities WHERE id = ?').get('o1') as any;
    expect(row.name).toBe('Deal');
    expect(row.stage).toBe('prospecting');

    db.prepare(`UPDATE crm_opportunities SET stage = 'proposal' WHERE id = 'o1'`).run();
    const updated = db.prepare('SELECT stage FROM crm_opportunities WHERE id = ?').get('o1') as any;
    expect(updated.stage).toBe('proposal');

    db.prepare(`DELETE FROM crm_opportunities WHERE id = 'o1'`).run();
    const deleted = db.prepare('SELECT * FROM crm_opportunities WHERE id = ?').get('o1');
    expect(deleted).toBeUndefined();
  });

  it('allows basic CRUD on crm_interactions', () => {
    db.prepare(
      `INSERT INTO crm_people (id, name, role, created_at) VALUES ('p1', 'Owner', 'ae', ?)`,
    ).run(NOW);
    db.prepare(
      `INSERT INTO crm_interactions (id, person_id, type, summary, logged_at, created_at) VALUES ('i1', 'p1', 'call', 'Test call', ?, ?)`,
    ).run(NOW, NOW);

    const row = db.prepare('SELECT * FROM crm_interactions WHERE id = ?').get('i1') as any;
    expect(row.summary).toBe('Test call');
    expect(row.type).toBe('call');

    db.prepare(`UPDATE crm_interactions SET summary = 'Updated call' WHERE id = 'i1'`).run();
    const updated = db.prepare('SELECT summary FROM crm_interactions WHERE id = ?').get('i1') as any;
    expect(updated.summary).toBe('Updated call');

    db.prepare(`DELETE FROM crm_interactions WHERE id = 'i1'`).run();
    const deleted = db.prepare('SELECT * FROM crm_interactions WHERE id = ?').get('i1');
    expect(deleted).toBeUndefined();
  });

  it('is idempotent (calling twice does not error)', () => {
    expect(() => createCrmSchema(db)).not.toThrow();
  });

  it('rejects invalid role via CHECK constraint', () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO crm_people (id, name, role, created_at) VALUES ('bad', 'Bad', 'intern', ?)`,
        )
        .run(NOW),
    ).toThrow(/CHECK/);
  });

  it('rejects invalid account status via CHECK constraint', () => {
    db.prepare(`INSERT INTO crm_people (id, name, role, created_at) VALUES ('p1', 'O', 'ae', ?)`).run(NOW);
    expect(() =>
      db.prepare(
        `INSERT INTO crm_accounts (id, name, owner_id, status, created_at, updated_at) VALUES ('a1', 'X', 'p1', 'deleted', ?, ?)`,
      ).run(NOW, NOW),
    ).toThrow(/CHECK/);
  });

  it('rejects invalid proposal status via CHECK constraint', () => {
    db.prepare(`INSERT INTO crm_people (id, name, role, created_at) VALUES ('p1', 'O', 'ae', ?)`).run(NOW);
    db.prepare(`INSERT INTO crm_accounts (id, name, owner_id, created_at, updated_at) VALUES ('a1', 'X', 'p1', ?, ?)`).run(NOW, NOW);
    db.prepare(`INSERT INTO crm_opportunities (id, account_id, owner_id, name, stage, created_at, updated_at) VALUES ('o1', 'a1', 'p1', 'D', 'prospecting', ?, ?)`).run(NOW, NOW);
    expect(() =>
      db.prepare(
        `INSERT INTO crm_proposals (id, opportunity_id, status, created_at, updated_at) VALUES ('pr1', 'o1', 'void', ?, ?)`,
      ).run(NOW, NOW),
    ).toThrow(/CHECK/);
  });

  it('rejects invalid task status via CHECK constraint', () => {
    db.prepare(`INSERT INTO crm_people (id, name, role, created_at) VALUES ('p1', 'O', 'ae', ?)`).run(NOW);
    expect(() =>
      db.prepare(
        `INSERT INTO crm_tasks_crm (id, person_id, title, status, created_at) VALUES ('t1', 'p1', 'T', 'deleted', ?)`,
      ).run(NOW),
    ).toThrow(/CHECK/);
  });

  it('allows basic CRUD on crm_contacts', () => {
    db.prepare(`INSERT INTO crm_people (id, name, role, created_at) VALUES ('p1', 'O', 'ae', ?)`).run(NOW);
    db.prepare(`INSERT INTO crm_accounts (id, name, owner_id, created_at, updated_at) VALUES ('a1', 'Acme', 'p1', ?, ?)`).run(NOW, NOW);
    db.prepare(`INSERT INTO crm_contacts (id, account_id, name, title, email, created_at) VALUES ('c1', 'a1', 'John', 'VP Sales', 'j@acme.com', ?)`).run(NOW);

    const row = db.prepare('SELECT * FROM crm_contacts WHERE id = ?').get('c1') as any;
    expect(row.name).toBe('John');
    expect(row.account_id).toBe('a1');

    db.prepare(`UPDATE crm_contacts SET name = 'Jane' WHERE id = 'c1'`).run();
    const updated = db.prepare('SELECT name FROM crm_contacts WHERE id = ?').get('c1') as any;
    expect(updated.name).toBe('Jane');

    db.prepare(`DELETE FROM crm_contacts WHERE id = 'c1'`).run();
    expect(db.prepare('SELECT * FROM crm_contacts WHERE id = ?').get('c1')).toBeUndefined();
  });

  it('allows basic CRUD on crm_quotas', () => {
    db.prepare(`INSERT INTO crm_people (id, name, role, created_at) VALUES ('p1', 'O', 'ae', ?)`).run(NOW);
    db.prepare(`INSERT INTO crm_quotas (id, person_id, period_type, period_start, period_end, target_amount, created_at) VALUES ('q1', 'p1', 'monthly', '2024-01-01', '2024-01-31', 100000, ?)`).run(NOW);

    const row = db.prepare('SELECT * FROM crm_quotas WHERE id = ?').get('q1') as any;
    expect(row.target_amount).toBe(100000);
    expect(row.period_type).toBe('monthly');

    db.prepare(`DELETE FROM crm_quotas WHERE id = 'q1'`).run();
    expect(db.prepare('SELECT * FROM crm_quotas WHERE id = ?').get('q1')).toBeUndefined();
  });

  it('allows basic CRUD on crm_events', () => {
    db.prepare(`INSERT INTO crm_events (id, name, date_start, created_at) VALUES ('e1', 'Upfront', '2024-05-15', ?)`).run(NOW);

    const row = db.prepare('SELECT * FROM crm_events WHERE id = ?').get('e1') as any;
    expect(row.name).toBe('Upfront');

    db.prepare(`DELETE FROM crm_events WHERE id = 'e1'`).run();
    expect(db.prepare('SELECT * FROM crm_events WHERE id = ?').get('e1')).toBeUndefined();
  });

  it('allows basic CRUD on crm_media_types', () => {
    db.prepare(`INSERT INTO crm_media_types (id, name, category, base_price) VALUES ('m1', 'TV Spot', 'broadcast', 50000)`).run();

    const row = db.prepare('SELECT * FROM crm_media_types WHERE id = ?').get('m1') as any;
    expect(row.name).toBe('TV Spot');
    expect(row.base_price).toBe(50000);

    db.prepare(`DELETE FROM crm_media_types WHERE id = 'm1'`).run();
    expect(db.prepare('SELECT * FROM crm_media_types WHERE id = ?').get('m1')).toBeUndefined();
  });

  it('allows basic CRUD on crm_proposals', () => {
    db.prepare(`INSERT INTO crm_people (id, name, role, created_at) VALUES ('p1', 'O', 'ae', ?)`).run(NOW);
    db.prepare(`INSERT INTO crm_accounts (id, name, owner_id, created_at, updated_at) VALUES ('a1', 'X', 'p1', ?, ?)`).run(NOW, NOW);
    db.prepare(`INSERT INTO crm_opportunities (id, account_id, owner_id, name, stage, created_at, updated_at) VALUES ('o1', 'a1', 'p1', 'D', 'prospecting', ?, ?)`).run(NOW, NOW);
    db.prepare(`INSERT INTO crm_proposals (id, opportunity_id, total_amount, created_at, updated_at) VALUES ('pr1', 'o1', 75000, ?, ?)`).run(NOW, NOW);

    const row = db.prepare('SELECT * FROM crm_proposals WHERE id = ?').get('pr1') as any;
    expect(row.total_amount).toBe(75000);
    expect(row.status).toBe('draft');

    db.prepare(`DELETE FROM crm_proposals WHERE id = 'pr1'`).run();
    expect(db.prepare('SELECT * FROM crm_proposals WHERE id = ?').get('pr1')).toBeUndefined();
  });

  it('allows basic CRUD on crm_tasks_crm', () => {
    db.prepare(`INSERT INTO crm_people (id, name, role, created_at) VALUES ('p1', 'O', 'ae', ?)`).run(NOW);
    db.prepare(`INSERT INTO crm_tasks_crm (id, person_id, title, priority, created_at) VALUES ('t1', 'p1', 'Follow up', 'high', ?)`).run(NOW);

    const row = db.prepare('SELECT * FROM crm_tasks_crm WHERE id = ?').get('t1') as any;
    expect(row.title).toBe('Follow up');
    expect(row.status).toBe('pending');
    expect(row.priority).toBe('high');

    db.prepare(`UPDATE crm_tasks_crm SET status = 'completed' WHERE id = 't1'`).run();
    const updated = db.prepare('SELECT status FROM crm_tasks_crm WHERE id = ?').get('t1') as any;
    expect(updated.status).toBe('completed');

    db.prepare(`DELETE FROM crm_tasks_crm WHERE id = 't1'`).run();
    expect(db.prepare('SELECT * FROM crm_tasks_crm WHERE id = ?').get('t1')).toBeUndefined();
  });

  it('allows basic CRUD on crm_activity_log', () => {
    db.prepare(`INSERT INTO crm_people (id, name, role, created_at) VALUES ('p1', 'O', 'ae', ?)`).run(NOW);
    db.prepare(`INSERT INTO crm_activity_log (person_id, action, entity_type, entity_id, created_at) VALUES ('p1', 'create', 'account', 'a1', ?)`).run(NOW);

    const row = db.prepare('SELECT * FROM crm_activity_log WHERE entity_id = ?').get('a1') as any;
    expect(row.action).toBe('create');
    expect(row.id).toBeGreaterThan(0); // AUTOINCREMENT

    db.prepare(`DELETE FROM crm_activity_log WHERE entity_id = 'a1'`).run();
    expect(db.prepare('SELECT * FROM crm_activity_log WHERE entity_id = ?').get('a1')).toBeUndefined();
  });

  it('allows basic CRUD on crm_documents and crm_embeddings', () => {
    db.prepare(`INSERT INTO crm_documents (id, source, title, doc_type, last_synced, created_at) VALUES ('d1', 'drive', 'Proposal.pdf', 'pdf', ?, ?)`).run(NOW, NOW);

    const doc = db.prepare('SELECT * FROM crm_documents WHERE id = ?').get('d1') as any;
    expect(doc.title).toBe('Proposal.pdf');

    db.prepare(`INSERT INTO crm_embeddings (id, document_id, chunk_index, content, created_at) VALUES ('emb1', 'd1', 0, 'chunk text', ?)`).run(NOW);
    const emb = db.prepare('SELECT * FROM crm_embeddings WHERE id = ?').get('emb1') as any;
    expect(emb.content).toBe('chunk text');
    expect(emb.chunk_index).toBe(0);

    db.prepare(`DELETE FROM crm_embeddings WHERE id = 'emb1'`).run();
    db.prepare(`DELETE FROM crm_documents WHERE id = 'd1'`).run();
    expect(db.prepare('SELECT * FROM crm_documents WHERE id = ?').get('d1')).toBeUndefined();
  });
});
