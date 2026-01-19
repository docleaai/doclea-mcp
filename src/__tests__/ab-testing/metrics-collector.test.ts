import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  getMetricsCollector,
  MetricsCollector,
  resetMetricsCollector,
} from "../../ab-testing/metrics-collector";

describe("MetricsCollector", () => {
  let db: Database;

  beforeEach(() => {
    resetMetricsCollector();
    db = new Database(":memory:");
  });

  afterEach(async () => {
    resetMetricsCollector();
    db.close();
  });

  describe("initialization", () => {
    it("should create metrics table on initialize", async () => {
      const collector = new MetricsCollector();
      await collector.initialize(db);

      const result = db
        .query(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='ab_metrics'",
        )
        .get();
      expect(result).toBeDefined();
    });

    it("should create index on metrics table", async () => {
      const collector = new MetricsCollector();
      await collector.initialize(db);

      const result = db
        .query(
          "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_ab_metrics_experiment'",
        )
        .get();
      expect(result).toBeDefined();
    });
  });

  describe("record", () => {
    it("should buffer metrics", async () => {
      const collector = new MetricsCollector();
      await collector.initialize(db);

      collector.record({
        experimentId: "exp-1",
        variantId: "control",
        sessionHash: "abc123",
        latencyMs: 100,
        resultCount: 10,
        topScore: 0.9,
        timestamp: Date.now(),
      });

      const status = collector.getBufferStatus();
      expect(status.size).toBe(1);
    });

    it("should auto-flush when buffer is full", async () => {
      const collector = new MetricsCollector({
        maxBufferSize: 3,
        flushIntervalMs: 60000, // Long interval to not interfere
      });
      await collector.initialize(db);

      for (let i = 0; i < 4; i++) {
        collector.record({
          experimentId: "exp-1",
          variantId: "control",
          sessionHash: `hash-${i}`,
          latencyMs: 100,
          resultCount: 10,
          timestamp: Date.now(),
        });
      }

      // Buffer should have been flushed (leaving 1 entry after flush)
      const status = collector.getBufferStatus();
      expect(status.size).toBeLessThan(4);

      // Data should be in database
      const count = db
        .query("SELECT COUNT(*) as count FROM ab_metrics")
        .get() as {
        count: number;
      };
      expect(count.count).toBeGreaterThan(0);
    });
  });

  describe("flush", () => {
    it("should persist buffered metrics to database", async () => {
      const collector = new MetricsCollector();
      await collector.initialize(db);

      collector.record({
        experimentId: "exp-1",
        variantId: "control",
        sessionHash: "abc123",
        latencyMs: 100,
        resultCount: 10,
        topScore: 0.9,
        timestamp: Date.now(),
      });

      const flushed = await collector.flush();
      expect(flushed).toBe(1);

      const count = db
        .query("SELECT COUNT(*) as count FROM ab_metrics")
        .get() as {
        count: number;
      };
      expect(count.count).toBe(1);
    });

    it("should return 0 when buffer is empty", async () => {
      const collector = new MetricsCollector();
      await collector.initialize(db);

      const flushed = await collector.flush();
      expect(flushed).toBe(0);
    });

    it("should clear buffer after flush", async () => {
      const collector = new MetricsCollector();
      await collector.initialize(db);

      collector.record({
        experimentId: "exp-1",
        variantId: "control",
        sessionHash: "abc123",
        latencyMs: 100,
        resultCount: 10,
        timestamp: Date.now(),
      });

      await collector.flush();

      const status = collector.getBufferStatus();
      expect(status.size).toBe(0);
    });
  });

  describe("getAggregatedMetrics", () => {
    it("should return aggregated metrics by variant", async () => {
      const collector = new MetricsCollector();
      await collector.initialize(db);

      // Add metrics for control variant
      for (let i = 0; i < 3; i++) {
        collector.record({
          experimentId: "exp-1",
          variantId: "control",
          sessionHash: `hash-${i}`,
          latencyMs: 100 + i * 10,
          resultCount: 10,
          topScore: 0.9,
          timestamp: Date.now(),
        });
      }

      // Add metrics for treatment variant
      for (let i = 0; i < 2; i++) {
        collector.record({
          experimentId: "exp-1",
          variantId: "treatment",
          sessionHash: `hash-t-${i}`,
          latencyMs: 150 + i * 10,
          resultCount: 12,
          topScore: 0.85,
          timestamp: Date.now(),
        });
      }

      await collector.flush();

      const metrics = collector.getAggregatedMetrics("exp-1");

      expect(metrics.length).toBe(2);

      const control = metrics.find((m) => m.variantId === "control");
      expect(control?.requestCount).toBe(3);
      expect(control?.avgLatencyMs).toBeCloseTo(110, 0);

      const treatment = metrics.find((m) => m.variantId === "treatment");
      expect(treatment?.requestCount).toBe(2);
      expect(treatment?.avgLatencyMs).toBeCloseTo(155, 0);
    });

    it("should filter by since timestamp", async () => {
      const collector = new MetricsCollector();
      await collector.initialize(db);

      const now = Date.now();
      const oldTime = now - 10000;

      collector.record({
        experimentId: "exp-1",
        variantId: "control",
        sessionHash: "old",
        latencyMs: 100,
        resultCount: 10,
        timestamp: oldTime,
      });

      collector.record({
        experimentId: "exp-1",
        variantId: "control",
        sessionHash: "new",
        latencyMs: 200,
        resultCount: 10,
        timestamp: now,
      });

      await collector.flush();

      const allMetrics = collector.getAggregatedMetrics("exp-1");
      expect(allMetrics[0].requestCount).toBe(2);

      const recentMetrics = collector.getAggregatedMetrics("exp-1", now - 1);
      expect(recentMetrics[0].requestCount).toBe(1);
      expect(recentMetrics[0].avgLatencyMs).toBeCloseTo(200, 0);
    });
  });

  describe("getSamples", () => {
    it("should return raw samples", async () => {
      const collector = new MetricsCollector();
      await collector.initialize(db);

      collector.record({
        experimentId: "exp-1",
        variantId: "control",
        sessionHash: "abc123",
        latencyMs: 100,
        resultCount: 10,
        topScore: 0.9,
        timestamp: Date.now(),
      });

      await collector.flush();

      const samples = collector.getSamples("exp-1");
      expect(samples.length).toBe(1);
      expect(samples[0].variantId).toBe("control");
      expect(samples[0].latencyMs).toBe(100);
    });

    it("should respect limit parameter", async () => {
      const collector = new MetricsCollector();
      await collector.initialize(db);

      for (let i = 0; i < 10; i++) {
        collector.record({
          experimentId: "exp-1",
          variantId: "control",
          sessionHash: `hash-${i}`,
          latencyMs: 100,
          resultCount: 10,
          timestamp: Date.now(),
        });
      }

      await collector.flush();

      const samples = collector.getSamples("exp-1", 5);
      expect(samples.length).toBe(5);
    });

    it("should order by timestamp descending", async () => {
      const collector = new MetricsCollector();
      await collector.initialize(db);

      collector.record({
        experimentId: "exp-1",
        variantId: "control",
        sessionHash: "first",
        latencyMs: 100,
        resultCount: 10,
        timestamp: 1000,
      });

      collector.record({
        experimentId: "exp-1",
        variantId: "control",
        sessionHash: "second",
        latencyMs: 200,
        resultCount: 10,
        timestamp: 2000,
      });

      await collector.flush();

      const samples = collector.getSamples("exp-1");
      expect(samples[0].sessionHash).toBe("second"); // Most recent first
      expect(samples[1].sessionHash).toBe("first");
    });
  });

  describe("getBufferStatus", () => {
    it("should return buffer size and max", async () => {
      const collector = new MetricsCollector({ maxBufferSize: 50 });
      await collector.initialize(db);

      collector.record({
        experimentId: "exp-1",
        variantId: "control",
        sessionHash: "abc",
        latencyMs: 100,
        resultCount: 10,
        timestamp: Date.now(),
      });

      const status = collector.getBufferStatus();
      expect(status.size).toBe(1);
      expect(status.maxSize).toBe(50);
    });
  });

  describe("shutdown", () => {
    it("should flush remaining metrics on shutdown", async () => {
      const collector = new MetricsCollector();
      await collector.initialize(db);

      collector.record({
        experimentId: "exp-1",
        variantId: "control",
        sessionHash: "abc",
        latencyMs: 100,
        resultCount: 10,
        timestamp: Date.now(),
      });

      await collector.shutdown();

      const count = db
        .query("SELECT COUNT(*) as count FROM ab_metrics")
        .get() as {
        count: number;
      };
      expect(count.count).toBe(1);
    });
  });

  describe("singleton", () => {
    it("should return same instance from getMetricsCollector", () => {
      const collector1 = getMetricsCollector();
      const collector2 = getMetricsCollector();
      expect(collector1).toBe(collector2);
    });
  });
});
