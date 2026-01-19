/**
 * Cache key generation for context caching
 *
 * Generates deterministic SHA-256 hash keys from query parameters.
 */

import type { ScoringConfig } from "../scoring/types";
import { stableHash } from "../utils/json";
import type { CacheKeyComponents } from "./types";

/**
 * Generate a cache key from context build parameters.
 * Uses stable JSON serialization to ensure deterministic keys.
 *
 * @param components - The components that define the cache key
 * @returns A SHA-256 hash string
 */
export async function generateCacheKey(
  components: CacheKeyComponents,
): Promise<string> {
  return stableHash(components);
}

/**
 * Generate a hash of a scoring config for cache key inclusion.
 * This allows different scoring configs to have separate cache entries.
 *
 * @param config - The scoring configuration
 * @returns A SHA-256 hash string
 */
export async function hashScoringConfig(
  config: ScoringConfig,
): Promise<string> {
  // Only hash the parts that affect results
  const relevantConfig = {
    enabled: config.enabled,
    weights: config.weights,
    recencyDecay: config.recencyDecay,
    frequencyNormalization: config.frequencyNormalization,
    boostRules: config.boostRules,
  };
  return stableHash(relevantConfig);
}

/**
 * Build cache key components from buildContext input.
 *
 * @param input - The buildContext input parameters
 * @param scoringConfig - Optional scoring configuration
 * @returns Cache key components ready for hashing
 */
export async function buildCacheKeyComponents(
  input: {
    query: string;
    tokenBudget?: number;
    includeCodeGraph?: boolean;
    filters?: {
      type?: string;
      tags?: string[];
      minImportance?: number;
    };
    template?: string;
  },
  scoringConfig?: ScoringConfig,
): Promise<CacheKeyComponents> {
  const components: CacheKeyComponents = {
    query: input.query,
    tokenBudget: input.tokenBudget ?? 4000,
    includeCodeGraph: input.includeCodeGraph ?? true,
    template: input.template ?? "default",
  };

  // Only include filters if they're defined
  if (input.filters) {
    components.filters = {};
    if (input.filters.type !== undefined) {
      components.filters.type = input.filters.type;
    }
    if (input.filters.tags !== undefined && input.filters.tags.length > 0) {
      // Sort tags for deterministic ordering
      components.filters.tags = [...input.filters.tags].sort();
    }
    if (input.filters.minImportance !== undefined) {
      components.filters.minImportance = input.filters.minImportance;
    }
  }

  // Include scoring config hash if scoring is enabled
  if (scoringConfig?.enabled) {
    components.scoringConfigHash = await hashScoringConfig(scoringConfig);
  }

  return components;
}
