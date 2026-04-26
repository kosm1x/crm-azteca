import os from 'os';
import path from 'path';

import { readEnvFile } from './env.js';

// Read config values from .env (falls back to process.env).
// Secrets are NOT read here — they stay on disk and are loaded only
// where needed (container-runner.ts) to avoid leaking to child processes.
const envConfig = readEnvFile(['ASSISTANT_NAME', 'ASSISTANT_HAS_OWN_NUMBER']);

export const ASSISTANT_NAME =
  process.env.ASSISTANT_NAME || envConfig.ASSISTANT_NAME || 'Andy';
export const ASSISTANT_HAS_OWN_NUMBER =
  (process.env.ASSISTANT_HAS_OWN_NUMBER ||
    envConfig.ASSISTANT_HAS_OWN_NUMBER) === 'true';
export const POLL_INTERVAL = 3000;
export const SCHEDULER_POLL_INTERVAL = 60000;

// Absolute paths needed for container mounts
const PROJECT_ROOT = process.cwd();
const HOME_DIR = process.env.HOME || os.homedir();

// Mount security: allowlist stored OUTSIDE project root, never mounted into containers
export const MOUNT_ALLOWLIST_PATH = path.join(
  HOME_DIR,
  '.config',
  'nanoclaw',
  'mount-allowlist.json',
);
export const STORE_DIR = path.resolve(PROJECT_ROOT, 'store');
export const GROUPS_DIR = path.resolve(PROJECT_ROOT, 'groups');
export const DATA_DIR = path.resolve(PROJECT_ROOT, 'data');
export const MAIN_GROUP_FOLDER = 'main';

export const CONTAINER_IMAGE =
  process.env.CONTAINER_IMAGE || 'nanoclaw-agent:latest';
export const CONTAINER_TIMEOUT = parseInt(
  process.env.CONTAINER_TIMEOUT || '1800000',
  10,
);
export const CONTAINER_MAX_OUTPUT_SIZE = parseInt(
  process.env.CONTAINER_MAX_OUTPUT_SIZE || '10485760',
  10,
); // 10MB default

// Per-container resource caps. Defaults preserve the values previously
// hardcoded in container-runner.ts (commit 7c8faa9), plus add
// --pids-limit which closes the audit's pids-limit gap and is the
// cheapest defense against fork-bomb-shaped agent failures.
//
// Setting any of these to '0' tells container-runner to skip emitting
// that specific flag entirely (omitted = unlimited under Docker for
// memory + pids-limit; --cpus 0 is rejected by Docker, hence the
// skip-the-flag pattern works uniformly across all three).
//
// pids-limit 256 is generous for Claude Agent SDK (steady-state ~30-50
// counting node, ripgrep, git, sub-shells). If a tool legitimately
// shells out heavily (large `npm install`, parallel `pdftotext` over
// folders) and trips EAGAIN, bump CONTAINER_PIDS_LIMIT in the engine's
// systemd Environment.
const trimEnv = (v: string | undefined, fallback: string): string => {
  // process.env.X = "" leaves the key set but empty; ?? wouldn't catch
  // it, and `args.push('--memory', '')` would make docker reject the
  // container. Treat empty/whitespace as "use default."
  const t = (v ?? '').trim();
  return t === '' ? fallback : t;
};
export const CONTAINER_MEMORY = trimEnv(process.env.CONTAINER_MEMORY, '512m');
export const CONTAINER_CPUS = trimEnv(process.env.CONTAINER_CPUS, '1');
export const CONTAINER_PIDS_LIMIT = trimEnv(
  process.env.CONTAINER_PIDS_LIMIT,
  '256',
);

export const IPC_POLL_INTERVAL = 3000;
export const IPC_FALLBACK_POLL_INTERVAL = 30000; // 30s safety-net poll when fs.watch is active
export const CREDENTIAL_PROXY_PORT = parseInt(
  process.env.CREDENTIAL_PROXY_PORT || '7462',
  10,
);
export const IDLE_TIMEOUT = parseInt(process.env.IDLE_TIMEOUT || '1800000', 10); // 30min default — how long to keep container alive after last result
export const MAX_CONCURRENT_CONTAINERS = Math.max(
  1,
  parseInt(process.env.MAX_CONCURRENT_CONTAINERS || '3', 10) || 3,
);

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const TRIGGER_PATTERN = new RegExp(
  `^@${escapeRegex(ASSISTANT_NAME)}\\b`,
  'i',
);

export const MAX_CONTEXT_MESSAGES = parseInt(
  process.env.MAX_CONTEXT_MESSAGES || '30',
  10,
);

// Timezone for scheduled tasks, container TZ, and all date logic.
// CRM hook: default to America/Mexico_City (all users are MX-based).
// Set TZ env var to override (also set in .env for systemd EnvironmentFile).
export const TIMEZONE = process.env.TZ || 'America/Mexico_City';
