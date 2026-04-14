/**
 * Tool result eviction — writes oversized content to a temp file so the LLM
 * can access it via buscar_documentos instead of losing it to truncation.
 *
 * Ported from mission-control's eviction.ts. Adapted for CRM context:
 * - Uses /tmp/crm-tool-results/ (containers can't write to data/)
 * - Preview includes markdown TOC for large documents
 * - Async FS (no blocking I/O on inference hot path)
 * - Cleanup runs on an interval from bootstrap, not inline with eviction
 */

import { writeFile, mkdir, readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { logger } from "./logger.js";

const EVICT_DIR = join("/tmp", "crm-tool-results");
const MAX_AGE_MS = 60 * 60 * 1000; // 1 hour
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // every 10 min
let dirCreated = false;
let cleanupTimer: NodeJS.Timeout | null = null;

export const EVICTION_THRESHOLD = 8_000;

/**
 * Evict oversized content to a temp file. Returns a truncated preview with
 * a table of contents and a file path.
 *
 * On filesystem errors, falls back to simple head truncation (no file).
 */
export async function evictToFile(
  content: string,
  filenamePrefix: string,
  maxPreviewChars = 2_000,
): Promise<{ preview: string; filePath: string | undefined }> {
  let filePath: string | undefined;
  try {
    if (!dirCreated) {
      await mkdir(EVICT_DIR, { recursive: true });
      dirCreated = true;
    }
    const suffix = randomBytes(4).toString("hex");
    filePath = join(EVICT_DIR, `${filenamePrefix}-${Date.now()}-${suffix}.txt`);
    await writeFile(filePath, content, "utf-8");
  } catch (err) {
    logger.warn(
      {
        err: err instanceof Error ? err.message : String(err),
        tool: filenamePrefix,
      },
      "tool-eviction: file write failed, falling back to head truncation",
    );
    return {
      preview:
        content.slice(0, maxPreviewChars) +
        `\n\n... (${content.length} chars total — truncated, file eviction failed)`,
      filePath: undefined,
    };
  }

  // Build table of contents from markdown headings — scan the FULL content,
  // not just the preview slice, so the TOC reflects the entire document.
  const headings = content
    .split("\n")
    .filter((l) => /^#{1,6}\s/.test(l))
    .map((h) => h.replace(/^#+\s*/, "").trim())
    .slice(0, 30);
  const toc =
    headings.length > 0
      ? `\n\nTABLE OF CONTENTS (${headings.length} sections):\n${headings.map((h) => `- ${h}`).join("\n")}`
      : "";

  const preview =
    content.slice(0, maxPreviewChars) +
    `\n\n--- DOCUMENT TRUNCATED (${content.length} chars total) ---` +
    `\nFull content saved to: ${filePath}` +
    toc;

  return { preview, filePath };
}

/**
 * Check if a tool result already contains a file eviction path.
 */
export function hasEvictedPath(result: string): boolean {
  return result.includes("crm-tool-results/");
}

/**
 * Conditionally evict a tool result if it exceeds the threshold.
 * Returns the original result if under threshold, or evicted preview if over.
 */
export async function maybeEvict(
  result: string,
  toolName: string,
  threshold = EVICTION_THRESHOLD,
): Promise<string> {
  if (result.length <= threshold || hasEvictedPath(result)) {
    return result;
  }
  const { preview } = await evictToFile(result, toolName);
  return preview;
}

async function cleanupOldFiles(): Promise<void> {
  try {
    const files = await readdir(EVICT_DIR);
    const now = Date.now();
    await Promise.all(
      files.map(async (file) => {
        try {
          const fullPath = join(EVICT_DIR, file);
          const s = await stat(fullPath);
          if (now - s.mtimeMs > MAX_AGE_MS) {
            await unlink(fullPath);
          }
        } catch {
          /* ignore per-file errors */
        }
      }),
    );
  } catch {
    /* directory doesn't exist yet */
  }
}

/**
 * Start background cleanup of old evicted files. Runs every 10 minutes.
 * Called once at bootstrap. Prior implementation used probabilistic (10%)
 * cleanup on every eviction, which caused variable latency on hot paths.
 */
export function startEvictionCleanup(): void {
  if (cleanupTimer) return;
  // Fire once shortly after boot to clear any leftovers from a prior run,
  // then every CLEANUP_INTERVAL_MS.
  setTimeout(() => {
    void cleanupOldFiles();
  }, 30_000);
  cleanupTimer = setInterval(() => {
    void cleanupOldFiles();
  }, CLEANUP_INTERVAL_MS);
  // Allow process to exit cleanly if this is the only thing keeping it alive.
  cleanupTimer.unref?.();
}

export function stopEvictionCleanup(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}
