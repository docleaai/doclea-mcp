/**
 * Recommended scoring configuration presets
 *
 * These presets provide tuned weight configurations for different use cases.
 * Users can select a preset or use it as a starting point for customization.
 */

import type { ScoringConfig } from "./types";

/**
 * Balanced preset (default)
 * - Equal emphasis on semantic similarity and contextual factors
 * - Good for general-purpose memory retrieval
 */
export const BALANCED_PRESET: Partial<ScoringConfig> = {
  weights: {
    semantic: 0.5,
    recency: 0.2,
    confidence: 0.15,
    frequency: 0.15,
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
};

/**
 * Semantic-focused preset
 * - Prioritizes semantic similarity over other factors
 * - Best for: Finding conceptually related memories regardless of age
 * - Use case: Research, exploring related concepts, finding solutions
 */
export const SEMANTIC_FOCUSED_PRESET: Partial<ScoringConfig> = {
  weights: {
    semantic: 0.7,
    recency: 0.1,
    confidence: 0.1,
    frequency: 0.1,
  },
  boostRules: [
    {
      name: "high-importance-boost",
      condition: { type: "importance", minValue: 0.8 },
      factor: 1.2,
    },
  ],
};

/**
 * Recency-focused preset
 * - Prioritizes recently accessed/created memories
 * - Best for: Active development sessions, current context awareness
 * - Use case: Working on recent features, debugging current issues
 */
export const RECENCY_FOCUSED_PRESET: Partial<ScoringConfig> = {
  weights: {
    semantic: 0.3,
    recency: 0.5,
    confidence: 0.1,
    frequency: 0.1,
  },
  recencyDecay: {
    type: "exponential",
    halfLifeDays: 14, // Shorter half-life for faster decay
  },
  boostRules: [
    {
      name: "very-recent-boost",
      condition: { type: "recency", maxDays: 3 },
      factor: 1.3,
    },
    {
      name: "recent-boost",
      condition: { type: "recency", maxDays: 7 },
      factor: 1.15,
    },
    {
      name: "stale-penalty",
      condition: { type: "staleness", minDays: 90 },
      factor: 0.7,
    },
  ],
};

/**
 * Frequency-focused preset
 * - Prioritizes frequently accessed memories
 * - Best for: Finding commonly referenced patterns and decisions
 * - Use case: Discovering team conventions, frequently used solutions
 */
export const FREQUENCY_FOCUSED_PRESET: Partial<ScoringConfig> = {
  weights: {
    semantic: 0.35,
    recency: 0.15,
    confidence: 0.15,
    frequency: 0.35,
  },
  frequencyNormalization: {
    method: "log",
    maxCount: 50, // Lower threshold for "frequently accessed"
    coldStartScore: 0.3, // Lower score for new items
  },
  boostRules: [
    {
      name: "high-frequency-boost",
      condition: { type: "frequency", minAccessCount: 10 },
      factor: 1.25,
    },
    {
      name: "high-importance-boost",
      condition: { type: "importance", minValue: 0.8 },
      factor: 1.1,
    },
  ],
};

/**
 * Architecture-focused preset
 * - Prioritizes architectural decisions and patterns
 * - Best for: Understanding system design and high-level decisions
 * - Use case: Onboarding, architecture reviews, design discussions
 */
export const ARCHITECTURE_FOCUSED_PRESET: Partial<ScoringConfig> = {
  weights: {
    semantic: 0.45,
    recency: 0.15,
    confidence: 0.25,
    frequency: 0.15,
  },
  boostRules: [
    {
      name: "architecture-boost",
      condition: { type: "memoryType", types: ["architecture", "decision"] },
      factor: 1.3,
    },
    {
      name: "pattern-boost",
      condition: { type: "memoryType", types: ["pattern"] },
      factor: 1.2,
    },
    {
      name: "high-importance-boost",
      condition: { type: "importance", minValue: 0.7 },
      factor: 1.15,
    },
  ],
};

/**
 * All available presets mapped by name
 */
export const SCORING_PRESETS = {
  balanced: BALANCED_PRESET,
  "semantic-focused": SEMANTIC_FOCUSED_PRESET,
  "recency-focused": RECENCY_FOCUSED_PRESET,
  "frequency-focused": FREQUENCY_FOCUSED_PRESET,
  "architecture-focused": ARCHITECTURE_FOCUSED_PRESET,
} as const;

export type ScoringPresetName = keyof typeof SCORING_PRESETS;

/**
 * Get a scoring config preset by name
 */
export function getScoringPreset(
  name: ScoringPresetName,
): Partial<ScoringConfig> {
  return SCORING_PRESETS[name];
}

/**
 * List all available preset names
 */
export function listScoringPresets(): ScoringPresetName[] {
  return Object.keys(SCORING_PRESETS) as ScoringPresetName[];
}
