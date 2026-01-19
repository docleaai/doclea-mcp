/**
 * Scoring system types and Zod schemas
 *
 * Defines configuration schemas for multi-factor relevance scoring.
 * Uses discriminated unions for type-safe configuration.
 */

import { z } from "zod";

// ============================================
// Scoring Weights
// ============================================

export const ScoringWeightsSchema = z.object({
  semantic: z.number().min(0).max(1).default(0.5),
  recency: z.number().min(0).max(1).default(0.2),
  confidence: z.number().min(0).max(1).default(0.15),
  frequency: z.number().min(0).max(1).default(0.15),
});
export type ScoringWeights = z.infer<typeof ScoringWeightsSchema>;

// ============================================
// Recency Decay Configuration
// ============================================

export const ExponentialDecaySchema = z.object({
  type: z.literal("exponential"),
  /** Score halves every this many days */
  halfLifeDays: z.number().positive().default(30),
});

export const LinearDecaySchema = z.object({
  type: z.literal("linear"),
  /** Score reaches 0 after this many days */
  fullDecayDays: z.number().positive().default(365),
});

export const StepDecaySchema = z.object({
  type: z.literal("step"),
  /** Score thresholds by age in days */
  thresholds: z
    .array(
      z.object({
        days: z.number().nonnegative(),
        score: z.number().min(0).max(1),
      }),
    )
    .min(1),
});

export const RecencyDecaySchema = z.discriminatedUnion("type", [
  ExponentialDecaySchema,
  LinearDecaySchema,
  StepDecaySchema,
]);
export type RecencyDecay = z.infer<typeof RecencyDecaySchema>;

// ============================================
// Frequency Normalization
// ============================================

export const FrequencyNormalizationSchema = z.object({
  /** Normalization method */
  method: z.enum(["log", "linear", "sigmoid"]).default("log"),
  /** Counts at or above this get score 1.0 */
  maxCount: z.number().positive().default(100),
  /** Score for new memories with 0 access count (cold start) */
  coldStartScore: z.number().min(0).max(1).default(0.5),
});
export type FrequencyNormalization = z.infer<
  typeof FrequencyNormalizationSchema
>;

// ============================================
// Boost/Penalty Rules
// ============================================

export const RecencyConditionSchema = z.object({
  type: z.literal("recency"),
  /** Apply boost if memory is newer than this many days */
  maxDays: z.number().positive(),
});

export const ImportanceConditionSchema = z.object({
  type: z.literal("importance"),
  /** Apply boost if importance >= this value */
  minValue: z.number().min(0).max(1),
});

export const FrequencyConditionSchema = z.object({
  type: z.literal("frequency"),
  /** Apply boost if access count >= this value */
  minAccessCount: z.number().int().nonnegative(),
});

export const StalenessConditionSchema = z.object({
  type: z.literal("staleness"),
  /** Apply penalty if memory is older than this many days */
  minDays: z.number().positive(),
});

export const MemoryTypeConditionSchema = z.object({
  type: z.literal("memoryType"),
  /** Apply boost for these memory types */
  types: z.array(z.string()).min(1),
});

export const TagsConditionSchema = z.object({
  type: z.literal("tags"),
  /** Tags to match */
  tags: z.array(z.string()).min(1),
  /** Match mode: any tag or all tags */
  match: z.enum(["any", "all"]).default("any"),
});

export const BoostConditionSchema = z.discriminatedUnion("type", [
  RecencyConditionSchema,
  ImportanceConditionSchema,
  FrequencyConditionSchema,
  StalenessConditionSchema,
  MemoryTypeConditionSchema,
  TagsConditionSchema,
]);
export type BoostCondition = z.infer<typeof BoostConditionSchema>;

export const BoostRuleSchema = z.object({
  /** Human-readable name for the rule */
  name: z.string(),
  /** Condition that triggers the boost */
  condition: BoostConditionSchema,
  /** Multiplier: >1 for boost, <1 for penalty */
  factor: z.number().positive(),
});
export type BoostRule = z.infer<typeof BoostRuleSchema>;

// ============================================
// Confidence Decay Configuration
// ============================================

export const NoDecaySchema = z.object({
  type: z.literal("none"),
});

export const ConfidenceDecaySettingsSchema = z.discriminatedUnion("type", [
  ExponentialDecaySchema,
  LinearDecaySchema,
  StepDecaySchema,
  NoDecaySchema,
]);
export type ConfidenceDecaySettings = z.infer<
  typeof ConfidenceDecaySettingsSchema
>;

export const ConfidenceDecayConfigSchema = z.object({
  /** Enable confidence decay (opt-in, disabled by default) */
  enabled: z.boolean().default(false),
  /** Decay function configuration */
  decay: ConfidenceDecaySettingsSchema.default({
    type: "exponential",
    halfLifeDays: 90,
  }),
  /** Minimum effective confidence (decayed score won't go below this) */
  floor: z.number().min(0).max(1).default(0.1),
  /**
   * Virtual refresh on access - when true, uses accessedAt as anchor if no
   * explicit last_refreshed_at is set. This is VIRTUAL ONLY - no DB writes on read.
   */
  refreshOnAccess: z.boolean().default(true),
  /** Memory types exempt from decay (e.g., architecture decisions) */
  exemptTypes: z.array(z.string()).default(["architecture"]),
  /** Tags that exempt a memory from decay (e.g., 'pinned') */
  exemptTags: z.array(z.string()).default(["pinned"]),
});
export type ConfidenceDecayConfig = z.infer<typeof ConfidenceDecayConfigSchema>;

// ============================================
// Main Scoring Configuration
// ============================================

export const ScoringConfigSchema = z.object({
  /** Enable multi-factor scoring (opt-in for backwards compatibility) */
  enabled: z.boolean().default(false),
  /** Weights for each scoring factor */
  weights: ScoringWeightsSchema.default({
    semantic: 0.5,
    recency: 0.2,
    confidence: 0.15,
    frequency: 0.15,
  }),
  /** Recency decay configuration */
  recencyDecay: RecencyDecaySchema.default({
    type: "exponential",
    halfLifeDays: 30,
  }),
  /** Frequency normalization configuration */
  frequencyNormalization: FrequencyNormalizationSchema.default({
    method: "log",
    maxCount: 100,
    coldStartScore: 0.5,
  }),
  /** Boost/penalty rules to apply */
  boostRules: z.array(BoostRuleSchema).default([]),
  /** Multiplier for overfetching from vector search (fetch N * limit, then re-rank) */
  searchOverfetch: z.number().positive().default(3),
  /** Confidence decay configuration (opt-in) */
  confidenceDecay: ConfidenceDecayConfigSchema.optional(),
});
export type ScoringConfig = z.infer<typeof ScoringConfigSchema>;

// ============================================
// Scoring Context (for deterministic testing)
// ============================================

export const ScoringContextSchema = z.object({
  /** Current timestamp (Unix seconds) - pass for deterministic testing */
  now: z.number(),
});
export type ScoringContext = z.infer<typeof ScoringContextSchema>;

// ============================================
// Default Configuration
// ============================================

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  /** Enable by default, can be disabled via DOCLEA_SCORING_ENABLED=false */
  enabled: process.env.DOCLEA_SCORING_ENABLED !== "false",
  weights: {
    semantic: 0.5,
    recency: 0.2,
    confidence: 0.15,
    frequency: 0.15,
  },
  recencyDecay: {
    type: "exponential",
    halfLifeDays: 30,
  },
  frequencyNormalization: {
    method: "log",
    maxCount: 100,
    coldStartScore: 0.5,
  },
  boostRules: [
    {
      name: "recent-boost",
      condition: { type: "recency", maxDays: 7 },
      factor: 1.2,
    },
    {
      name: "high-importance-boost",
      condition: { type: "importance", minValue: 0.8 },
      factor: 1.15,
    },
    {
      name: "stale-penalty",
      condition: { type: "staleness", minDays: 180 },
      factor: 0.8,
    },
  ],
  searchOverfetch: 3,
};
