/**
 * Per-tool execution metrics — call count, success/failure, latency.
 *
 * In-memory rolling window (last 100 entries per tool).
 * Ported from mission-control's tool-metrics.ts.
 */

interface ToolEntry {
  timestamp: number;
  latencyMs: number;
  success: boolean;
}

export interface ToolStats {
  calls: number;
  successes: number;
  failures: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  lastCalledAt: string | null;
}

const WINDOW_SIZE = 100;

/**
 * Nearest-rank percentile on a sorted array.
 *
 * Uses `Math.floor(p * N)` (matches numpy's "lower" method and the common
 * p95 dashboard convention). For a full rolling window of 100 samples this
 * picks index 95, correctly capturing the 5-sample tail. For small N the
 * result degrades to max — acceptable, there simply isn't enough data to
 * distinguish the tail from the worst observation.
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(Math.floor(p * sorted.length), sorted.length - 1);
  return sorted[idx];
}

class ToolMetrics {
  private readonly entries = new Map<string, ToolEntry[]>();

  record(name: string, latencyMs: number, success: boolean): void {
    if (!this.entries.has(name)) {
      this.entries.set(name, []);
    }
    const arr = this.entries.get(name)!;
    arr.push({ timestamp: Date.now(), latencyMs, success });
    if (arr.length > WINDOW_SIZE) {
      arr.splice(0, arr.length - WINDOW_SIZE);
    }
  }

  getStats(name: string): ToolStats | null {
    const arr = this.entries.get(name);
    if (!arr || arr.length === 0) return null;

    const successes = arr.filter((e) => e.success).length;
    const latencies = arr.map((e) => e.latencyMs).sort((a, b) => a - b);
    const avg = latencies.reduce((s, v) => s + v, 0) / latencies.length;

    // Linear interpolation p95 — correct for small samples. For N<20 the
    // previous Math.floor(N * 0.95) collapsed to N-1 (max), silently reporting
    // p100 as p95 and inflating observed tail latency.
    const p95 = percentile(latencies, 0.95);

    return {
      calls: arr.length,
      successes,
      failures: arr.length - successes,
      avgLatencyMs: Math.round(avg),
      p95LatencyMs: Math.round(p95),
      lastCalledAt: new Date(arr[arr.length - 1].timestamp).toISOString(),
    };
  }

  getSummary(): {
    totalCalls: number;
    toolCount: number;
    topByLatency: Array<{ name: string; avgLatencyMs: number }>;
    topByErrors: Array<{ name: string; failures: number }>;
  } {
    let totalCalls = 0;
    const allStats: Array<{ name: string; stats: ToolStats }> = [];

    for (const name of this.entries.keys()) {
      const stats = this.getStats(name);
      if (stats) {
        totalCalls += stats.calls;
        allStats.push({ name, stats });
      }
    }

    const topByLatency = allStats
      .sort((a, b) => b.stats.avgLatencyMs - a.stats.avgLatencyMs)
      .slice(0, 5)
      .map((s) => ({ name: s.name, avgLatencyMs: s.stats.avgLatencyMs }));

    const topByErrors = allStats
      .filter((s) => s.stats.failures > 0)
      .sort((a, b) => b.stats.failures - a.stats.failures)
      .slice(0, 5)
      .map((s) => ({ name: s.name, failures: s.stats.failures }));

    return {
      totalCalls,
      toolCount: allStats.length,
      topByLatency,
      topByErrors,
    };
  }

  /** @internal — exposed for testing only */
  _reset(): void {
    this.entries.clear();
  }
}

export const toolMetrics = new ToolMetrics();
