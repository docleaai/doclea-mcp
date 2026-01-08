/**
 * Confidence scoring factor
 *
 * Maps the memory importance field directly to confidence score.
 * Importance is already in [0, 1] range.
 */

/**
 * Calculate confidence score from importance.
 * Direct mapping since importance is already normalized.
 *
 * @param importance - Memory importance value (0-1)
 * @returns Confidence score in [0, 1]
 */
export function calculateConfidenceScore(importance: number): number {
  // Handle edge cases
  if (!Number.isFinite(importance)) {
    return 0.5; // Default importance
  }

  // Clamp to [0, 1] for safety
  return Math.max(0, Math.min(1, importance));
}
