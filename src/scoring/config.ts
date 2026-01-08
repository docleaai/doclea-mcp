/**
 * Scoring configuration loader
 *
 * Loads and validates scoring configuration from the main config.
 */

import type { ScoringConfig } from "./types";
import { DEFAULT_SCORING_CONFIG, ScoringConfigSchema } from "./types";

/**
 * Load scoring configuration from raw config object.
 * Falls back to defaults for missing/invalid values.
 *
 * @param rawConfig - Raw scoring config from main config file
 * @returns Validated scoring configuration
 */
export function loadScoringConfig(rawConfig?: unknown): ScoringConfig {
  if (!rawConfig) {
    return DEFAULT_SCORING_CONFIG;
  }

  try {
    return ScoringConfigSchema.parse(rawConfig);
  } catch (error) {
    console.warn("[doclea] Invalid scoring config, using defaults:", error);
    return DEFAULT_SCORING_CONFIG;
  }
}

/**
 * Merge partial config with defaults.
 * Useful for runtime config updates.
 */
export function mergeScoringConfig(
  partial: Partial<ScoringConfig>,
): ScoringConfig {
  return {
    ...DEFAULT_SCORING_CONFIG,
    ...partial,
    weights: {
      ...DEFAULT_SCORING_CONFIG.weights,
      ...partial.weights,
    },
    recencyDecay: partial.recencyDecay ?? DEFAULT_SCORING_CONFIG.recencyDecay,
    frequencyNormalization: {
      ...DEFAULT_SCORING_CONFIG.frequencyNormalization,
      ...partial.frequencyNormalization,
    },
    boostRules: partial.boostRules ?? DEFAULT_SCORING_CONFIG.boostRules,
  };
}
