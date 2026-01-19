/**
 * Levenshtein distance and string similarity utilities for fuzzy tag matching
 */

/**
 * Calculate Levenshtein distance between two strings
 * Uses optimized single-row algorithm for memory efficiency O(min(m,n)) space
 *
 * @param a First string
 * @param b Second string
 * @returns Number of single-character edits (insertions, deletions, substitutions)
 */
export function levenshteinDistance(a: string, b: string): number {
  // Handle empty strings
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Ensure a is the shorter string for memory optimization
  if (a.length > b.length) {
    [a, b] = [b, a];
  }

  const aLen = a.length;
  const bLen = b.length;

  // Single row optimization - only need previous row values
  const prevRow = new Array<number>(aLen + 1);

  // Initialize first row (distance from empty string to a[0..i])
  for (let i = 0; i <= aLen; i++) {
    prevRow[i] = i;
  }

  // Fill in the rest of the matrix row by row
  for (let j = 1; j <= bLen; j++) {
    let prev = j; // prevRow[0] for this row
    for (let i = 1; i <= aLen; i++) {
      const current =
        a[i - 1] === b[j - 1]
          ? prevRow[i - 1] // No edit needed
          : Math.min(
              prevRow[i - 1] + 1, // Substitution
              prev + 1, // Insertion
              prevRow[i] + 1, // Deletion
            );
      prevRow[i - 1] = prev;
      prev = current;
    }
    prevRow[aLen] = prev;
  }

  return prevRow[aLen];
}

/**
 * Calculate normalized similarity score between two strings
 * Based on Levenshtein distance, normalized to 0-1 range
 *
 * @param a First string
 * @param b Second string
 * @returns Similarity score (0 = completely different, 1 = identical)
 */
export function stringSimilarity(a: string, b: string): number {
  // Handle identical strings
  if (a === b) return 1;

  // Handle empty strings
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;

  // Calculate normalized distance
  const distance = levenshteinDistance(a, b);
  return 1 - distance / maxLen;
}

/**
 * Check if two strings are similar within a given Levenshtein distance threshold
 *
 * @param a First string
 * @param b Second string
 * @param maxDistance Maximum allowed Levenshtein distance (default: 3)
 * @returns True if strings are within the distance threshold
 */
export function isWithinDistance(
  a: string,
  b: string,
  maxDistance: number = 3,
): boolean {
  // Quick length check - if length difference exceeds max distance, no need to compute
  if (Math.abs(a.length - b.length) > maxDistance) {
    return false;
  }

  return levenshteinDistance(a, b) <= maxDistance;
}

/**
 * Find the best matches for a query string from a list of candidates
 *
 * @param query The string to match
 * @param candidates Array of candidate strings to compare against
 * @param options Optional configuration
 * @returns Array of matches sorted by similarity (highest first)
 */
export function findBestMatches(
  query: string,
  candidates: string[],
  options: {
    /** Minimum similarity score to include (default: 0.3) */
    minScore?: number;
    /** Maximum number of results (default: 10) */
    limit?: number;
    /** Pre-filter by first letter for performance (default: false) */
    preFilterByFirstLetter?: boolean;
  } = {},
): Array<{ candidate: string; score: number }> {
  const {
    minScore = 0.3,
    limit = 10,
    preFilterByFirstLetter = false,
  } = options;

  const normalizedQuery = query.toLowerCase();
  let filteredCandidates = candidates;

  // Optional pre-filter for performance with large candidate lists
  if (preFilterByFirstLetter && normalizedQuery.length > 0) {
    const firstLetter = normalizedQuery[0];
    filteredCandidates = candidates.filter(
      (c) =>
        c.toLowerCase().startsWith(firstLetter) ||
        c.toLowerCase().includes(normalizedQuery.substring(0, 2)),
    );
    // Fall back to all candidates if pre-filter yields too few results
    if (filteredCandidates.length < limit) {
      filteredCandidates = candidates;
    }
  }

  const matches = filteredCandidates
    .map((candidate) => ({
      candidate,
      score: stringSimilarity(normalizedQuery, candidate.toLowerCase()),
    }))
    .filter((match) => match.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return matches;
}
