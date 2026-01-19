/**
 * A/B Testing types and Zod schemas
 *
 * Defines configuration for experiments, variants, and metrics.
 */

import { z } from "zod";
import { ScoringConfigSchema } from "../scoring/types";

// ============================================
// Experiment Variant
// ============================================

export const ExperimentVariantSchema = z.object({
  /** Unique variant identifier */
  id: z.string(),
  /** Human-readable variant name */
  name: z.string(),
  /** Optional description */
  description: z.string().optional(),
  /** Scoring configuration for this variant */
  scoringConfig: ScoringConfigSchema,
  /** Traffic allocation weight (0-1), relative to other variants */
  weight: z.number().min(0).max(1).default(0.5),
});
export type ExperimentVariant = z.infer<typeof ExperimentVariantSchema>;

// ============================================
// Experiment
// ============================================

export const ExperimentSchema = z.object({
  /** Unique experiment identifier */
  id: z.string(),
  /** Human-readable experiment name */
  name: z.string(),
  /** Optional description */
  description: z.string().optional(),
  /** Whether the experiment is currently active */
  enabled: z.boolean().default(true),
  /** Experiment variants (at least 2 for valid A/B test) */
  variants: z.array(ExperimentVariantSchema).min(2),
  /** How to assign users to variants */
  assignmentStrategy: z
    .enum(["random", "deterministic"])
    .default("deterministic"),
  /** When the experiment started (Unix timestamp ms) */
  startedAt: z.number().optional(),
  /** When the experiment should end (Unix timestamp ms) */
  endsAt: z.number().optional(),
});
export type Experiment = z.infer<typeof ExperimentSchema>;

// ============================================
// A/B Testing Configuration
// ============================================

export const ABTestingConfigSchema = z.object({
  /** Enable A/B testing */
  enabled: z.boolean().default(false),
  /** List of experiments */
  experiments: z.array(ExperimentSchema).default([]),
  /** Enable metrics collection */
  metricsEnabled: z.boolean().default(true),
  /** How often to flush metrics to storage (ms) */
  metricsFlushIntervalMs: z.number().int().positive().default(60_000),
});
export type ABTestingConfig = z.infer<typeof ABTestingConfigSchema>;

// ============================================
// Metrics Types
// ============================================

/** Single metrics sample for a request */
export interface MetricsSample {
  /** Experiment ID */
  experimentId: string;
  /** Assigned variant ID */
  variantId: string;
  /** Hashed session/query identifier for anonymity */
  sessionHash: string;
  /** Search latency in milliseconds */
  latencyMs: number;
  /** Number of results returned */
  resultCount: number;
  /** Top result score (if available) */
  topScore?: number;
  /** Timestamp when recorded (Unix ms) */
  timestamp: number;
}

/** Aggregated metrics for an experiment variant */
export interface AggregatedMetrics {
  experimentId: string;
  variantId: string;
  /** Total number of requests */
  requestCount: number;
  /** Average latency in ms */
  avgLatencyMs: number;
  /** 50th percentile latency */
  p50LatencyMs: number;
  /** 95th percentile latency */
  p95LatencyMs: number;
  /** 99th percentile latency */
  p99LatencyMs: number;
  /** Average number of results */
  avgResultCount: number;
  /** Average top score */
  avgTopScore: number;
  /** Number of errors */
  errorCount: number;
  /** Time range start */
  periodStart: number;
  /** Time range end */
  periodEnd: number;
}

/** Variant assignment result */
export interface VariantAssignment {
  experimentId: string;
  variantId: string;
  scoringConfig: z.infer<typeof ScoringConfigSchema>;
  /** Whether this was a deterministic or random assignment */
  assignmentType: "deterministic" | "random";
}

// ============================================
// Default Configuration
// ============================================

export const DEFAULT_AB_TESTING_CONFIG: ABTestingConfig = {
  enabled: false,
  experiments: [],
  metricsEnabled: true,
  metricsFlushIntervalMs: 60_000,
};
