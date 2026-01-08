/**
 * Scoring module exports
 *
 * Multi-factor relevance scoring for memory retrieval.
 */

// Boost rules
export { applyBoosts, evaluateBoostRules } from "./boost-rules";
// Config loader
export { loadScoringConfig, mergeScoringConfig } from "./config";
// Explainer
export { generateScoreExplanation, generateScoreSummary } from "./explainer";
// Scoring factors
export {
  calculateConfidenceScore,
  calculateFrequencyScore,
  calculateRecencyScore,
  calculateSemanticScore,
} from "./factors";

// Main scorer
export { createEmptyBreakdown, RelevanceScorer } from "./scorer";
export type {
  BoostCondition,
  BoostRule,
  FrequencyNormalization,
  RecencyDecay,
  ScoringConfig,
  ScoringContext,
  ScoringWeights,
} from "./types";
// Types and schemas
export {
  BoostConditionSchema,
  BoostRuleSchema,
  DEFAULT_SCORING_CONFIG,
  FrequencyNormalizationSchema,
  RecencyDecaySchema,
  ScoringConfigSchema,
  ScoringContextSchema,
  ScoringWeightsSchema,
} from "./types";
