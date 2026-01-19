/**
 * Staleness Detection Types
 *
 * Types and Zod schemas for memory staleness detection system.
 */

import { z } from "zod";

/**
 * Strategy types for staleness detection
 */
export const StalenessStrategyTypeSchema = z.enum([
  "time_decay",
  "git_changes",
  "related_updates",
  "superseded",
]);
export type StalenessStrategyType = z.infer<typeof StalenessStrategyTypeSchema>;

/**
 * Recommended action based on staleness score
 */
export const StalenessActionSchema = z.enum([
  "none", // Score below review threshold
  "review", // Score >= 0.3, suggest review
  "refresh", // Score >= 0.6, suggest refresh
  "archive", // Score >= 0.9, suggest archiving
]);
export type StalenessAction = z.infer<typeof StalenessActionSchema>;

/**
 * A single staleness signal from one strategy
 */
export interface StalenessSignal {
  /** Strategy that generated this signal */
  strategy: StalenessStrategyType;
  /** Staleness score from this strategy (0-1) */
  score: number;
  /** Weight of this strategy in the composite score */
  weight: number;
  /** Human-readable reason for the staleness */
  reason: string;
  /** Additional metadata about the signal */
  metadata?: Record<string, unknown>;
}

/**
 * Zod schema for StalenessSignal
 */
export const StalenessSignalSchema = z.object({
  strategy: StalenessStrategyTypeSchema,
  score: z.number().min(0).max(1),
  weight: z.number().min(0).max(1),
  reason: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Complete staleness result for a memory
 */
export interface StalenessResult {
  /** Memory ID that was checked */
  memoryId: string;
  /** Composite staleness score (0-1, weighted average of signals) */
  compositeScore: number;
  /** Individual signals from each strategy */
  signals: StalenessSignal[];
  /** Recommended action based on thresholds */
  recommendedAction: StalenessAction;
  /** Timestamp when this check was performed */
  checkedAt: number;
}

/**
 * Zod schema for StalenessResult
 */
export const StalenessResultSchema = z.object({
  memoryId: z.string(),
  compositeScore: z.number().min(0).max(1),
  signals: z.array(StalenessSignalSchema),
  recommendedAction: StalenessActionSchema,
  checkedAt: z.number(),
});

/**
 * Configuration for staleness detection thresholds
 */
export interface StalenessThresholds {
  /** Score threshold for "review" recommendation (default: 0.3) */
  review: number;
  /** Score threshold for "refresh" recommendation (default: 0.6) */
  refresh: number;
  /** Score threshold for "archive" recommendation (default: 0.9) */
  archive: number;
}

/**
 * Configuration for time decay strategy
 */
export interface TimeDecayStrategyConfig {
  /** Days after which memory is considered stale (default: 180) */
  thresholdDays: number;
  /** Weight of this strategy in composite score (default: 0.5) */
  weight: number;
}

/**
 * Configuration for git changes strategy
 */
export interface GitChangesStrategyConfig {
  /** Weight of this strategy in composite score (default: 0.7) */
  weight: number;
  /** Path to the git repository (defaults to project root) */
  repoPath?: string;
  /** Cache TTL in milliseconds (default: 5 minutes) */
  cacheTtlMs: number;
}

/**
 * Configuration for related updates strategy
 */
export interface RelatedUpdatesStrategyConfig {
  /** Weight of this strategy in composite score (default: 0.4) */
  weight: number;
  /** Maximum depth to traverse relations (default: 2) */
  maxDepth: number;
}

/**
 * Configuration for superseded strategy
 */
export interface SupersededStrategyConfig {
  /** Weight of this strategy in composite score (default: 1.0) */
  weight: number;
}

/**
 * Complete staleness detection configuration
 */
export interface StalenessConfig {
  /** Enabled flag */
  enabled: boolean;
  /** Action thresholds */
  thresholds: StalenessThresholds;
  /** Per-strategy configurations */
  strategies: {
    timeDecay: TimeDecayStrategyConfig;
    gitChanges: GitChangesStrategyConfig;
    relatedUpdates: RelatedUpdatesStrategyConfig;
    superseded: SupersededStrategyConfig;
  };
}

/**
 * Zod schema for StalenessConfig
 */
export const StalenessConfigSchema = z.object({
  enabled: z.boolean().default(true),
  thresholds: z
    .object({
      review: z.number().min(0).max(1).default(0.3),
      refresh: z.number().min(0).max(1).default(0.6),
      archive: z.number().min(0).max(1).default(0.9),
    })
    .default({
      review: 0.3,
      refresh: 0.6,
      archive: 0.9,
    }),
  strategies: z
    .object({
      timeDecay: z
        .object({
          thresholdDays: z.number().min(1).default(180),
          weight: z.number().min(0).max(1).default(0.5),
        })
        .default({
          thresholdDays: 180,
          weight: 0.5,
        }),
      gitChanges: z
        .object({
          weight: z.number().min(0).max(1).default(0.7),
          repoPath: z.string().optional(),
          cacheTtlMs: z
            .number()
            .min(0)
            .default(5 * 60 * 1000),
        })
        .default({
          weight: 0.7,
          cacheTtlMs: 5 * 60 * 1000,
        }),
      relatedUpdates: z
        .object({
          weight: z.number().min(0).max(1).default(0.4),
          maxDepth: z.number().min(1).max(5).default(2),
        })
        .default({
          weight: 0.4,
          maxDepth: 2,
        }),
      superseded: z
        .object({
          weight: z.number().min(0).max(1).default(1.0),
        })
        .default({
          weight: 1.0,
        }),
    })
    .default({
      timeDecay: {
        thresholdDays: 180,
        weight: 0.5,
      },
      gitChanges: {
        weight: 0.7,
        cacheTtlMs: 5 * 60 * 1000,
      },
      relatedUpdates: {
        weight: 0.4,
        maxDepth: 2,
      },
      superseded: {
        weight: 1.0,
      },
    }),
});

/**
 * Default staleness configuration
 */
export const DEFAULT_STALENESS_CONFIG: StalenessConfig = {
  enabled: true,
  thresholds: {
    review: 0.3,
    refresh: 0.6,
    archive: 0.9,
  },
  strategies: {
    timeDecay: {
      thresholdDays: 180,
      weight: 0.5,
    },
    gitChanges: {
      weight: 0.7,
      cacheTtlMs: 5 * 60 * 1000,
    },
    relatedUpdates: {
      weight: 0.4,
      maxDepth: 2,
    },
    superseded: {
      weight: 1.0,
    },
  },
};

/**
 * Options for scanning all memories for staleness
 */
export interface ScanAllOptions {
  /** Filter by memory type */
  type?: string;
  /** Maximum memories to scan */
  limit: number;
  /** Offset for pagination */
  offset: number;
  /** Minimum staleness score to include in results */
  minScore?: number;
}

/**
 * Result of scanning multiple memories
 */
export interface ScanAllResult {
  /** Total memories scanned */
  scanned: number;
  /** Staleness results that met the minScore threshold */
  results: StalenessResult[];
  /** Pagination info */
  pagination: {
    offset: number;
    limit: number;
    hasMore: boolean;
  };
}
