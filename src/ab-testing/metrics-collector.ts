/**
 * Metrics collector for A/B testing
 *
 * Collects metrics samples and persists to SQLite for analysis.
 */

import type { Database } from "bun:sqlite";
import type { AggregatedMetrics, MetricsSample } from "./types";

// ============================================
// SQLite Schema
// ============================================

const CREATE_METRICS_TABLE = `
CREATE TABLE IF NOT EXISTS ab_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  experiment_id TEXT NOT NULL,
  variant_id TEXT NOT NULL,
  session_hash TEXT,
  latency_ms REAL,
  result_count INTEGER,
  top_score REAL,
  timestamp INTEGER NOT NULL
)
`;

const CREATE_METRICS_INDEX = `
CREATE INDEX IF NOT EXISTS idx_ab_metrics_experiment
ON ab_metrics(experiment_id, timestamp)
`;

// ============================================
// Metrics Collector
// ============================================

export class MetricsCollector {
  private db: Database | null = null;
  private buffer: MetricsSample[] = [];
  private maxBufferSize: number;
  private flushIntervalMs: number;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private initialized = false;

  constructor(
    options: { maxBufferSize?: number; flushIntervalMs?: number } = {},
  ) {
    this.maxBufferSize = options.maxBufferSize ?? 100;
    this.flushIntervalMs = options.flushIntervalMs ?? 60_000;
  }

  /**
   * Initialize the metrics collector with a database connection.
   */
  async initialize(db: Database): Promise<void> {
    if (this.initialized) return;

    this.db = db;

    // Create tables
    db.run(CREATE_METRICS_TABLE);
    db.run(CREATE_METRICS_INDEX);

    // Start periodic flush
    this.flushTimer = setInterval(() => {
      this.flush().catch(console.error);
    }, this.flushIntervalMs);

    this.initialized = true;
  }

  /**
   * Record a metrics sample.
   * Buffers locally and flushes periodically to SQLite.
   */
  record(sample: MetricsSample): void {
    this.buffer.push(sample);

    // Flush if buffer is full
    if (this.buffer.length >= this.maxBufferSize) {
      this.flush().catch(console.error);
    }
  }

  /**
   * Flush buffered metrics to SQLite.
   */
  async flush(): Promise<number> {
    if (!this.db || this.buffer.length === 0) {
      return 0;
    }

    const samples = [...this.buffer];
    this.buffer = [];

    const stmt = this.db.prepare(`
      INSERT INTO ab_metrics
      (experiment_id, variant_id, session_hash, latency_ms, result_count, top_score, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction(() => {
      for (const sample of samples) {
        stmt.run(
          sample.experimentId,
          sample.variantId,
          sample.sessionHash,
          sample.latencyMs,
          sample.resultCount,
          sample.topScore ?? null,
          sample.timestamp,
        );
      }
    });

    transaction();
    return samples.length;
  }

  /**
   * Get aggregated metrics for an experiment.
   */
  getAggregatedMetrics(
    experimentId: string,
    since?: number,
  ): AggregatedMetrics[] {
    if (!this.db) return [];

    const query = since
      ? `
        SELECT
          experiment_id,
          variant_id,
          COUNT(*) as request_count,
          AVG(latency_ms) as avg_latency,
          AVG(result_count) as avg_result_count,
          AVG(top_score) as avg_top_score,
          MIN(timestamp) as period_start,
          MAX(timestamp) as period_end
        FROM ab_metrics
        WHERE experiment_id = ? AND timestamp >= ?
        GROUP BY variant_id
      `
      : `
        SELECT
          experiment_id,
          variant_id,
          COUNT(*) as request_count,
          AVG(latency_ms) as avg_latency,
          AVG(result_count) as avg_result_count,
          AVG(top_score) as avg_top_score,
          MIN(timestamp) as period_start,
          MAX(timestamp) as period_end
        FROM ab_metrics
        WHERE experiment_id = ?
        GROUP BY variant_id
      `;

    const params = since ? [experimentId, since] : [experimentId];
    const rows = this.db.query(query).all(...params) as Array<{
      experiment_id: string;
      variant_id: string;
      request_count: number;
      avg_latency: number;
      avg_result_count: number;
      avg_top_score: number | null;
      period_start: number;
      period_end: number;
    }>;

    // Get percentiles for each variant
    return rows.map((row) => {
      const percentiles = this.getPercentiles(
        experimentId,
        row.variant_id,
        since,
      );

      return {
        experimentId: row.experiment_id,
        variantId: row.variant_id,
        requestCount: row.request_count,
        avgLatencyMs: row.avg_latency,
        p50LatencyMs: percentiles.p50,
        p95LatencyMs: percentiles.p95,
        p99LatencyMs: percentiles.p99,
        avgResultCount: row.avg_result_count,
        avgTopScore: row.avg_top_score ?? 0,
        errorCount: 0, // TODO: Track errors separately
        periodStart: row.period_start,
        periodEnd: row.period_end,
      };
    });
  }

  /**
   * Calculate latency percentiles for a variant.
   */
  private getPercentiles(
    experimentId: string,
    variantId: string,
    since?: number,
  ): { p50: number; p95: number; p99: number } {
    if (!this.db) return { p50: 0, p95: 0, p99: 0 };

    const query = since
      ? `
        SELECT latency_ms
        FROM ab_metrics
        WHERE experiment_id = ? AND variant_id = ? AND timestamp >= ?
        ORDER BY latency_ms
      `
      : `
        SELECT latency_ms
        FROM ab_metrics
        WHERE experiment_id = ? AND variant_id = ?
        ORDER BY latency_ms
      `;

    const params = since
      ? [experimentId, variantId, since]
      : [experimentId, variantId];
    const rows = this.db.query(query).all(...params) as Array<{
      latency_ms: number;
    }>;

    if (rows.length === 0) {
      return { p50: 0, p95: 0, p99: 0 };
    }

    const latencies = rows.map((r) => r.latency_ms);
    return {
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      p99: percentile(latencies, 99),
    };
  }

  /**
   * Get raw metrics samples for export.
   */
  getSamples(
    experimentId: string,
    limit = 1000,
    since?: number,
  ): MetricsSample[] {
    if (!this.db) return [];

    const query = since
      ? `
        SELECT * FROM ab_metrics
        WHERE experiment_id = ? AND timestamp >= ?
        ORDER BY timestamp DESC
        LIMIT ?
      `
      : `
        SELECT * FROM ab_metrics
        WHERE experiment_id = ?
        ORDER BY timestamp DESC
        LIMIT ?
      `;

    const params = since ? [experimentId, since, limit] : [experimentId, limit];
    const rows = this.db.query(query).all(...params) as Array<{
      experiment_id: string;
      variant_id: string;
      session_hash: string;
      latency_ms: number;
      result_count: number;
      top_score: number | null;
      timestamp: number;
    }>;

    return rows.map((row) => ({
      experimentId: row.experiment_id,
      variantId: row.variant_id,
      sessionHash: row.session_hash,
      latencyMs: row.latency_ms,
      resultCount: row.result_count,
      topScore: row.top_score ?? undefined,
      timestamp: row.timestamp,
    }));
  }

  /**
   * Get buffer status for monitoring.
   */
  getBufferStatus(): { size: number; maxSize: number } {
    return {
      size: this.buffer.length,
      maxSize: this.maxBufferSize,
    };
  }

  /**
   * Stop the collector and flush remaining metrics.
   */
  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
    this.initialized = false;
  }
}

/**
 * Calculate percentile from sorted array.
 */
function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;

  const index = (p / 100) * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) {
    return sortedValues[lower];
  }

  // Linear interpolation
  const fraction = index - lower;
  return sortedValues[lower] * (1 - fraction) + sortedValues[upper] * fraction;
}

// Singleton instance
let defaultCollector: MetricsCollector | null = null;

/**
 * Get or create the default metrics collector.
 */
export function getMetricsCollector(options?: {
  maxBufferSize?: number;
  flushIntervalMs?: number;
}): MetricsCollector {
  if (!defaultCollector) {
    defaultCollector = new MetricsCollector(options);
  }
  return defaultCollector;
}

/**
 * Reset the default metrics collector.
 */
export function resetMetricsCollector(): void {
  if (defaultCollector) {
    defaultCollector.shutdown().catch(console.error);
  }
  defaultCollector = null;
}
