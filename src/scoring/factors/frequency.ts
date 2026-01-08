/**
 * Frequency scoring factor
 *
 * Normalizes access count to [0, 1] using configurable methods.
 * Handles cold start (0 access count) with a neutral score.
 */

import type { FrequencyNormalization } from "../types";

/**
 * Calculate frequency score from access count.
 *
 * @param accessCount - Number of times memory has been accessed
 * @param config - Frequency normalization configuration
 * @returns Score in [0, 1] where 1 = frequently accessed
 */
export function calculateFrequencyScore(
  accessCount: number,
  config: FrequencyNormalization,
): number {
  // Handle edge cases
  if (!Number.isFinite(accessCount) || accessCount < 0) {
    return config.coldStartScore;
  }

  // Cold start: return neutral score for new memories
  if (accessCount === 0) {
    return config.coldStartScore;
  }

  const { method, maxCount } = config;

  switch (method) {
    case "log":
      return normalizeLog(accessCount, maxCount);
    case "linear":
      return normalizeLinear(accessCount, maxCount);
    case "sigmoid":
      return normalizeSigmoid(accessCount, maxCount);
    default: {
      // Type exhaustiveness check
      const _exhaustiveCheck: never = method;
      return config.coldStartScore;
    }
  }
}

/**
 * Logarithmic normalization: log(count + 1) / log(maxCount + 1)
 * Good for most cases - diminishing returns for high counts
 */
function normalizeLog(count: number, maxCount: number): number {
  if (maxCount <= 0) return 0;
  const score = Math.log(count + 1) / Math.log(maxCount + 1);
  return Math.min(1, score); // Cap at 1 even if count > maxCount
}

/**
 * Linear normalization: count / maxCount
 * Simple but may overweight high frequency
 */
function normalizeLinear(count: number, maxCount: number): number {
  if (maxCount <= 0) return 0;
  return Math.min(1, count / maxCount);
}

/**
 * Sigmoid normalization: 1 / (1 + e^(-(count - midpoint) / scale))
 * S-curve centered around maxCount/2
 */
function normalizeSigmoid(count: number, maxCount: number): number {
  if (maxCount <= 0) return 0;
  const midpoint = maxCount / 2;
  const scale = maxCount / 6; // ~99% within [0, maxCount]
  const raw = 1 / (1 + Math.exp(-(count - midpoint) / scale));
  // Shift and scale to get [0, 1] from [sigmoid(0), sigmoid(maxCount)]
  const minSig = 1 / (1 + Math.exp(midpoint / scale));
  const maxSig = 1 / (1 + Math.exp(-(maxCount - midpoint) / scale));
  return Math.min(1, (raw - minSig) / (maxSig - minSig));
}
