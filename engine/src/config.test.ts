import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Phase 2a — Resource-limit env var fallback semantics.
 *
 * The trimEnv() helper inside config.ts treats empty/whitespace
 * values as "use the default" — `??` alone wouldn't catch
 * `CONTAINER_MEMORY=`, which would then push `--memory ''` and
 * make docker reject the container at spawn time.
 *
 * These tests pin the matrix of env-var states (unset, empty,
 * whitespace, '0', custom) so a future refactor can't quietly
 * regress the empty-string handling that audit caught.
 */
describe('engine config — resource-limit env vars (Phase 2a)', () => {
  const original = {
    CONTAINER_MEMORY: process.env.CONTAINER_MEMORY,
    CONTAINER_CPUS: process.env.CONTAINER_CPUS,
    CONTAINER_PIDS_LIMIT: process.env.CONTAINER_PIDS_LIMIT,
  };

  beforeEach(() => {
    delete process.env.CONTAINER_MEMORY;
    delete process.env.CONTAINER_CPUS;
    delete process.env.CONTAINER_PIDS_LIMIT;
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(original)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  // Re-import config.js fresh per test so module-level constants pick
  // up the current process.env state. Without this, the values get
  // baked in at first import for the whole test file.
  async function loadFresh() {
    vi.resetModules();
    return import('./config.js');
  }

  it('uses defaults when env vars are unset', async () => {
    const c = await loadFresh();
    expect(c.CONTAINER_MEMORY).toBe('512m');
    expect(c.CONTAINER_CPUS).toBe('1');
    expect(c.CONTAINER_PIDS_LIMIT).toBe('256');
  });

  it('uses defaults when env vars are empty strings', async () => {
    process.env.CONTAINER_MEMORY = '';
    process.env.CONTAINER_CPUS = '';
    process.env.CONTAINER_PIDS_LIMIT = '';
    const c = await loadFresh();
    expect(c.CONTAINER_MEMORY).toBe('512m');
    expect(c.CONTAINER_CPUS).toBe('1');
    expect(c.CONTAINER_PIDS_LIMIT).toBe('256');
  });

  it('uses defaults when env vars are whitespace', async () => {
    process.env.CONTAINER_MEMORY = '   ';
    process.env.CONTAINER_CPUS = '\t';
    process.env.CONTAINER_PIDS_LIMIT = ' \n ';
    const c = await loadFresh();
    expect(c.CONTAINER_MEMORY).toBe('512m');
    expect(c.CONTAINER_CPUS).toBe('1');
    expect(c.CONTAINER_PIDS_LIMIT).toBe('256');
  });

  it('preserves "0" — the escape-hatch value', async () => {
    process.env.CONTAINER_MEMORY = '0';
    process.env.CONTAINER_CPUS = '0';
    process.env.CONTAINER_PIDS_LIMIT = '0';
    const c = await loadFresh();
    expect(c.CONTAINER_MEMORY).toBe('0');
    expect(c.CONTAINER_CPUS).toBe('0');
    expect(c.CONTAINER_PIDS_LIMIT).toBe('0');
  });

  it('passes through custom values verbatim', async () => {
    process.env.CONTAINER_MEMORY = '1g';
    process.env.CONTAINER_CPUS = '2';
    process.env.CONTAINER_PIDS_LIMIT = '512';
    const c = await loadFresh();
    expect(c.CONTAINER_MEMORY).toBe('1g');
    expect(c.CONTAINER_CPUS).toBe('2');
    expect(c.CONTAINER_PIDS_LIMIT).toBe('512');
  });

  it('trims surrounding whitespace from custom values', async () => {
    process.env.CONTAINER_MEMORY = '  1g  ';
    process.env.CONTAINER_CPUS = ' 2 ';
    const c = await loadFresh();
    expect(c.CONTAINER_MEMORY).toBe('1g');
    expect(c.CONTAINER_CPUS).toBe('2');
  });
});
