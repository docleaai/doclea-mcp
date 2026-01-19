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
  calculateDecayedConfidenceScore,
  calculateFrequencyScore,
  calculateRecencyScore,
  calculateSemanticScore,
  clearDecayCache,
  getDecayCacheStats,
} from "./factors";
// Recommended presets
export {
  ARCHITECTURE_FOCUSED_PRESET,
  BALANCED_PRESET,
  FREQUENCY_FOCUSED_PRESET,
  getScoringPreset,
  listScoringPresets,
  RECENCY_FOCUSED_PRESET,
  SCORING_PRESETS,
  type ScoringPresetName,
  SEMANTIC_FOCUSED_PRESET,
} from "./recommended-configs";
// Main scorer
export { createEmptyBreakdown, RelevanceScorer } from "./scorer";
export type {
  BoostCondition,
  BoostRule,
  ConfidenceDecayConfig,
  ConfidenceDecaySettings,
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
  ConfidenceDecayConfigSchema,
  ConfidenceDecaySettingsSchema,
  DEFAULT_SCORING_CONFIG,
  FrequencyNormalizationSchema,
  RecencyDecaySchema,
  ScoringConfigSchema,
  ScoringContextSchema,
  ScoringWeightsSchema,
} from "./types";
