/**
 * Semantic similarity scoring factor
 *
 * Normalizes the raw vector similarity score to [0, 1] range.
 * Acts as a pass-through with clamping for safety.
 */

/**
 * Calculate semantic similarity score.
 * Clamps input to [0, 1] range for safety.
 *
 * @param rawScore - Raw similarity score from vector search
 * @returns Normalized score in [0, 1]
 */
export function calculateSemanticScore(rawScore: number): number {
  // Handle edge cases
  if (!Number.isFinite(rawScore)) {
    return 0;
  }

  // Clamp to [0, 1] range
  return Math.max(0, Math.min(1, rawScore));
}
