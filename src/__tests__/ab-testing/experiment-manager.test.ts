import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  ExperimentManager,
  getExperimentManager,
  resetExperimentManager,
} from "../../ab-testing/experiment-manager";
import { resetMetricsCollector } from "../../ab-testing/metrics-collector";
import type { Experiment } from "../../ab-testing/types";
import { DEFAULT_SCORING_CONFIG } from "../../scoring/types";

const createTestExperiment = (
  overrides: Partial<Experiment> = {},
): Experiment => ({
  id: "test-exp",
  name: "Test Experiment",
  enabled: true,
  variants: [
    {
      id: "control",
      name: "Control",
      weight: 0.5,
      scoringConfig: { ...DEFAULT_SCORING_CONFIG, enabled: true },
    },
    {
      id: "treatment",
      name: "Treatment",
      weight: 0.5,
      scoringConfig: {
        ...DEFAULT_SCORING_CONFIG,
        enabled: true,
        weights: {
          ...DEFAULT_SCORING_CONFIG.weights,
          semantic: 0.7,
        },
      },
    },
  ],
  assignmentStrategy: "deterministic",
  ...overrides,
});

describe("ExperimentManager", () => {
  let db: Database;

  beforeEach(() => {
    resetExperimentManager();
    resetMetricsCollector();
    db = new Database(":memory:");
  });

  afterEach(async () => {
    resetExperimentManager();
    resetMetricsCollector();
    db.close();
  });

  describe("initialization", () => {
    it("should initialize with default config", () => {
      const manager = new ExperimentManager();
      expect(manager.isEnabled()).toBe(false);
    });

    it("should initialize with custom config", () => {
      const manager = new ExperimentManager({
        enabled: true,
        experiments: [createTestExperiment()],
      });
      expect(manager.isEnabled()).toBe(true);
    });

    it("should initialize database tables when metrics enabled", async () => {
      const manager = new ExperimentManager({
        enabled: true,
        metricsEnabled: true,
        experiments: [createTestExperiment()],
      });

      await manager.initialize(db);

      // Check that table exists
      const result = db
        .query(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='ab_metrics'",
        )
        .get();
      expect(result).toBeDefined();
    });
  });

  describe("getActiveExperiment", () => {
    it("should return null when disabled", () => {
      const manager = new ExperimentManager({
        enabled: false,
        experiments: [createTestExperiment()],
      });
      expect(manager.getActiveExperiment()).toBeNull();
    });

    it("should return first enabled experiment", () => {
      const experiment = createTestExperiment();
      const manager = new ExperimentManager({
        enabled: true,
        experiments: [experiment],
      });

      const active = manager.getActiveExperiment();
      expect(active?.id).toBe("test-exp");
    });

    it("should skip disabled experiments", () => {
      const manager = new ExperimentManager({
        enabled: true,
        experiments: [
          createTestExperiment({ id: "disabled", enabled: false }),
          createTestExperiment({ id: "enabled", enabled: true }),
        ],
      });

      const active = manager.getActiveExperiment();
      expect(active?.id).toBe("enabled");
    });

    it("should skip experiments that haven't started", () => {
      const now = Date.now();
      const manager = new ExperimentManager({
        enabled: true,
        experiments: [
          createTestExperiment({
            id: "future",
            startedAt: now + 3600000, // 1 hour from now
          }),
          createTestExperiment({ id: "current" }),
        ],
      });

      const active = manager.getActiveExperiment();
      expect(active?.id).toBe("current");
    });

    it("should skip experiments that have ended", () => {
      const now = Date.now();
      const manager = new ExperimentManager({
        enabled: true,
        experiments: [
          createTestExperiment({
            id: "ended",
            endsAt: now - 3600000, // 1 hour ago
          }),
          createTestExperiment({ id: "current" }),
        ],
      });

      const active = manager.getActiveExperiment();
      expect(active?.id).toBe("current");
    });
  });

  describe("getScoringConfigForRequest", () => {
    it("should return default config when no active experiment", async () => {
      const manager = new ExperimentManager({ enabled: false });
      const { scoringConfig, assignment } =
        await manager.getScoringConfigForRequest("session-123");

      expect(assignment).toBeNull();
      expect(scoringConfig).toBeDefined();
    });

    it("should return variant config when experiment active", async () => {
      const experiment = createTestExperiment();
      const manager = new ExperimentManager({
        enabled: true,
        experiments: [experiment],
      });

      const { scoringConfig, assignment } =
        await manager.getScoringConfigForRequest("session-123");

      expect(assignment).not.toBeNull();
      expect(assignment?.experimentId).toBe("test-exp");
      expect(assignment?.variantId).toBeDefined();
      expect(["control", "treatment"]).toContain(assignment?.variantId ?? "");
      expect(scoringConfig.enabled).toBe(true);
    });

    it("should return consistent variant for same session", async () => {
      const manager = new ExperimentManager({
        enabled: true,
        experiments: [createTestExperiment()],
      });

      const result1 = await manager.getScoringConfigForRequest("session-123");
      const result2 = await manager.getScoringConfigForRequest("session-123");

      expect(result1.assignment?.variantId).toBe(result2.assignment?.variantId);
    });
  });

  describe("recordMetrics", () => {
    it("should not record when metrics disabled", async () => {
      const manager = new ExperimentManager({
        enabled: true,
        metricsEnabled: false,
        experiments: [createTestExperiment()],
      });
      await manager.initialize(db);

      const { assignment } =
        await manager.getScoringConfigForRequest("session-123");
      if (assignment) {
        await manager.recordMetrics(assignment, "session-123", 100, 10, 0.9);
      }

      // Metrics should not be recorded
      const status = manager.getStatus();
      expect(status.bufferStatus.size).toBe(0);
    });

    it("should buffer metrics when enabled", async () => {
      const manager = new ExperimentManager({
        enabled: true,
        metricsEnabled: true,
        experiments: [createTestExperiment()],
      });
      await manager.initialize(db);

      const { assignment } =
        await manager.getScoringConfigForRequest("session-123");
      expect(assignment).toBeDefined();
      if (assignment) {
        await manager.recordMetrics(assignment, "session-123", 100, 10, 0.9);
      }

      const status = manager.getStatus();
      expect(status.bufferStatus.size).toBe(1);
    });
  });

  describe("getAllExperiments", () => {
    it("should return all experiments", () => {
      const manager = new ExperimentManager({
        enabled: true,
        experiments: [
          createTestExperiment({ id: "exp-1" }),
          createTestExperiment({ id: "exp-2" }),
        ],
      });

      const experiments = manager.getAllExperiments();
      expect(experiments.length).toBe(2);
      expect(experiments[0].id).toBe("exp-1");
      expect(experiments[1].id).toBe("exp-2");
    });
  });

  describe("getExperiment", () => {
    it("should return experiment by ID", () => {
      const manager = new ExperimentManager({
        enabled: true,
        experiments: [
          createTestExperiment({ id: "exp-1" }),
          createTestExperiment({ id: "exp-2" }),
        ],
      });

      const exp = manager.getExperiment("exp-2");
      expect(exp?.id).toBe("exp-2");
    });

    it("should return undefined for unknown ID", () => {
      const manager = new ExperimentManager({
        enabled: true,
        experiments: [createTestExperiment({ id: "exp-1" })],
      });

      const exp = manager.getExperiment("unknown");
      expect(exp).toBeUndefined();
    });
  });

  describe("getStatus", () => {
    it("should return status summary", async () => {
      const manager = new ExperimentManager({
        enabled: true,
        metricsEnabled: true,
        experiments: [createTestExperiment()],
      });
      await manager.initialize(db);

      const status = manager.getStatus();

      expect(status.enabled).toBe(true);
      expect(status.metricsEnabled).toBe(true);
      expect(status.activeExperiment?.id).toBe("test-exp");
      expect(status.totalExperiments).toBe(1);
      expect(status.bufferStatus).toBeDefined();
    });
  });

  describe("updateConfig", () => {
    it("should update configuration", () => {
      const manager = new ExperimentManager({ enabled: false });
      expect(manager.isEnabled()).toBe(false);

      manager.updateConfig({ enabled: true });
      expect(manager.isEnabled()).toBe(true);
    });
  });

  describe("singleton", () => {
    it("should return same instance from getExperimentManager", () => {
      const manager1 = getExperimentManager();
      const manager2 = getExperimentManager();
      expect(manager1).toBe(manager2);
    });

    it("should update config on existing instance", () => {
      const manager1 = getExperimentManager({ enabled: false });
      expect(manager1.isEnabled()).toBe(false);

      const manager2 = getExperimentManager({ enabled: true });
      expect(manager2.isEnabled()).toBe(true);
      expect(manager1).toBe(manager2);
    });
  });
});
