import { describe, it, expect, afterEach } from "vitest";
import { existsSync, unlinkSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  evictToFile,
  hasEvictedPath,
  maybeEvict,
  EVICTION_THRESHOLD,
} from "../src/tool-eviction.js";

const EVICT_DIR = join("/tmp", "crm-tool-results");

afterEach(() => {
  // Clean up any files created during tests
  try {
    const files = readdirSync(EVICT_DIR);
    for (const f of files) {
      if (f.startsWith("test-")) unlinkSync(join(EVICT_DIR, f));
    }
  } catch {
    /* dir may not exist */
  }
});

describe("tool-eviction", () => {
  describe("evictToFile", () => {
    it("writes content to a temp file and returns preview", async () => {
      const content = "A".repeat(10_000);
      const { preview, filePath } = await evictToFile(
        content,
        "test-evict",
        500,
      );

      expect(filePath).toBeDefined();
      expect(existsSync(filePath!)).toBe(true);
      expect(preview.length).toBeLessThan(content.length);
      expect(preview).toContain("DOCUMENT TRUNCATED");
      expect(preview).toContain("10000 chars total");
    });

    it("includes markdown TOC in preview", async () => {
      const content = [
        "# Section One",
        "Some content here",
        "## Section Two",
        "More content",
        "### Section Three",
        "Even more",
      ].join("\n");

      const { preview } = await evictToFile(content, "test-toc", 50);
      expect(preview).toContain("TABLE OF CONTENTS");
      expect(preview).toContain("Section One");
      expect(preview).toContain("Section Two");
      expect(preview).toContain("Section Three");
    });

    it("limits TOC to 30 entries", async () => {
      const headings = Array.from(
        { length: 40 },
        (_, i) => `# Heading ${i}`,
      ).join("\ncontent\n");
      const { preview } = await evictToFile(headings, "test-toc-limit", 50);
      const tocLines = preview.split("\n").filter((l) => l.startsWith("- "));
      expect(tocLines.length).toBeLessThanOrEqual(30);
    });
  });

  describe("hasEvictedPath", () => {
    it("detects evicted paths", () => {
      expect(hasEvictedPath("saved to /tmp/crm-tool-results/foo.txt")).toBe(
        true,
      );
    });

    it("returns false for normal content", () => {
      expect(hasEvictedPath('{"result":"ok"}')).toBe(false);
    });
  });

  describe("maybeEvict", () => {
    it("returns original content if under threshold", async () => {
      const short = '{"result":"ok"}';
      expect(await maybeEvict(short, "test-tool")).toBe(short);
    });

    it("evicts content over threshold", async () => {
      const large = "X".repeat(EVICTION_THRESHOLD + 100);
      const result = await maybeEvict(large, "test-tool");
      expect(result.length).toBeLessThan(large.length);
      expect(result).toContain("DOCUMENT TRUNCATED");
    });

    it("skips double-eviction", async () => {
      const alreadyEvicted =
        "Preview... saved to /tmp/crm-tool-results/foo.txt";
      const padded = alreadyEvicted + "X".repeat(EVICTION_THRESHOLD);
      expect(await maybeEvict(padded, "test-tool")).toBe(padded);
    });
  });
});
