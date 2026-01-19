/**
 * Experiment manager for A/B testing
 *
 * Manages experiments, variant assignment, and metrics collection.
 */

import type { Database } from "bun:sqlite";
import type { ScoringConfig } from "../scoring/types";
import { DEFAULT_SCORING_CONFIG } from "../scoring/types";
import {
  getMetricsCollector,
  type MetricsCollector,
} from "./metrics-collector";
import type {
  ABTestingConfig,
  AggregatedMetrics,
  Experiment,
  MetricsSample,
  VariantAssignment,
} from "./types";
import { DEFAULT_AB_TESTING_CONFIG } from "./types";
import { assignVariant, generateSessionHash } from "./variant-selector";

export class ExperimentManager {
  private config: ABTestingConfig;
  private metricsCollector: MetricsCollector;
  private initialized = false;

  constructor(config?: Partial<ABTestingConfig>) {
    this.config = { ...DEFAULT_AB_TESTING_CONFIG, ...config };
    this.metricsCollector = getMetricsCollector({
      flushIntervalMs: this.config.metricsFlushIntervalMs,
    });
  }

  /**
   * Initialize the experiment manager with a database connection.
   */
  async initialize(db: Database): Promise<void> {
    if (this.initialized) return;

    if (this.config.metricsEnabled) {
      await this.metricsCollector.initialize(db);
    }

    this.initialized = true;
  }

  /**
   * Update the configuration.
   */
  updateConfig(config: Partial<ABTestingConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Check if A/B testing is enabled.
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get the active experiment (first enabled experiment that hasn't ended).
   */
  getActiveExperiment(): Experiment | null {
    if (!this.config.enabled) return null;

    const now = Date.now();
    return (
      this.config.experiments.find((exp) => {
        if (!exp.enabled) return false;
        if (exp.startedAt && now < exp.startedAt) return false;
        if (exp.endsAt && now > exp.endsAt) return false;
        return true;
      }) ?? null
    );
  }

  /**
   * Get all experiments.
   */
  getAllExperiments(): Experiment[] {
    return this.config.experiments;
  }

  /**
   * Get experiment by ID.
   */
  getExperiment(experimentId: string): Experiment | undefined {
    return this.config.experiments.find((exp) => exp.id === experimentId);
  }

  /**
   * Get the scoring config for a request.
   * If A/B testing is enabled, selects a variant; otherwise returns default.
   *
   * @param sessionId - Session identifier for consistent assignment
   * @returns Variant assignment or null if no active experiment
   */
  async getScoringConfigForRequest(sessionId: string): Promise<{
    scoringConfig: ScoringConfig;
    assignment: VariantAssignment | null;
  }> {
    const experiment = this.getActiveExperiment();

    if (!experiment) {
      return {
        scoringConfig: DEFAULT_SCORING_CONFIG,
        assignment: null,
      };
    }

    const assignment = await assignVariant(sessionId, experiment);

    return {
      scoringConfig: assignment.scoringConfig,
      assignment,
    };
  }

  /**
   * Record metrics for a search request.
   */
  async recordMetrics(
    assignment: VariantAssignment,
    sessionId: string,
    latencyMs: number,
    resultCount: number,
    topScore?: number,
  ): Promise<void> {
    if (!this.config.metricsEnabled) return;

    const sessionHash = await generateSessionHash(sessionId);

    const sample: MetricsSample = {
      experimentId: assignment.experimentId,
      variantId: assignment.variantId,
      sessionHash,
      latencyMs,
      resultCount,
      topScore,
      timestamp: Date.now(),
    };

    this.metricsCollector.record(sample);
  }

  /**
   * Get aggregated metrics for an experiment.
   */
  getExperimentMetrics(
    experimentId: string,
    since?: number,
  ): AggregatedMetrics[] {
    return this.metricsCollector.getAggregatedMetrics(experimentId, since);
  }

  /**
   * Get raw metrics samples for export.
   */
  getMetricsSamples(
    experimentId: string,
    limit?: number,
    since?: number,
  ): MetricsSample[] {
    return this.metricsCollector.getSamples(experimentId, limit, since);
  }

  /**
   * Flush pending metrics to storage.
   */
  async flushMetrics(): Promise<number> {
    return this.metricsCollector.flush();
  }

  /**
   * Get experiment status summary.
   */
  getStatus(): {
    enabled: boolean;
    activeExperiment: Experiment | null;
    totalExperiments: number;
    metricsEnabled: boolean;
    bufferStatus: { size: number; maxSize: number };
  } {
    return {
      enabled: this.config.enabled,
      activeExperiment: this.getActiveExperiment(),
      totalExperiments: this.config.experiments.length,
      metricsEnabled: this.config.metricsEnabled,
      bufferStatus: this.metricsCollector.getBufferStatus(),
    };
  }

  /**
   * Shutdown the experiment manager.
   */
  async shutdown(): Promise<void> {
    await this.metricsCollector.shutdown();
    this.initialized = false;
  }
}

// Singleton instance
let defaultManager: ExperimentManager | null = null;

/**
 * Get or create the default experiment manager.
 */
export function getExperimentManager(
  config?: Partial<ABTestingConfig>,
): ExperimentManager {
  if (!defaultManager) {
    defaultManager = new ExperimentManager(config);
  } else if (config) {
    defaultManager.updateConfig(config);
  }
  return defaultManager;
}

/**
 * Reset the default experiment manager.
 */
export function resetExperimentManager(): void {
  if (defaultManager) {
    defaultManager.shutdown().catch(console.error);
  }
  defaultManager = null;
}
