/**
 * String similarity utilities for fuzzy tag matching
 * Uses string-similarity library for Dice coefficient comparison
 */

import {
  compareTwoStrings,
  findBestMatch as findBestMatchLib,
} from "string-similarity";

/**
 * Calculate similarity score between two strings
 * Uses Dice coefficient (more accurate than Levenshtein for word matching)
 *
 * @param a First string
 * @param b Second string
 * @returns Similarity score (0 = completely different, 1 = identical)
 */
export function stringSimilarity(a: string, b: string): number {
  return compareTwoStrings(a, b);
}

/**
 * Calculate Levenshtein distance between two strings
 * Approximated from similarity score for backwards compatibility
 *
 * @param a First string
 * @param b Second string
 * @returns Approximate number of edits
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 0;
  const similarity = compareTwoStrings(a, b);
  return Math.round((1 - similarity) * maxLen);
}

/**
 * Check if two strings are similar within a threshold
 *
 * @param a First string
 * @param b Second string
 * @param maxDistance Maximum allowed distance (default: 3)
 * @returns True if strings are similar enough
 */
export function isWithinDistance(
  a: string,
  b: string,
  maxDistance: number = 3,
): boolean {
  if (Math.abs(a.length - b.length) > maxDistance) {
    return false;
  }
  return levenshteinDistance(a, b) <= maxDistance;
}

/**
 * Find the best matches for a query string from candidates
 *
 * @param query The string to match
 * @param candidates Array of candidate strings
 * @param options Configuration options
 * @returns Array of matches sorted by similarity (highest first)
 */
export function findBestMatches(
  query: string,
  candidates: string[],
  options: {
    minScore?: number;
    limit?: number;
    preFilterByFirstLetter?: boolean;
  } = {},
): Array<{ candidate: string; score: number }> {
  const { minScore = 0.3, limit = 10 } = options;

  if (candidates.length === 0) {
    return [];
  }

  const normalizedQuery = query.toLowerCase();
  const normalizedCandidates = candidates.map((c) => c.toLowerCase());

  const result = findBestMatchLib(normalizedQuery, normalizedCandidates);

  return result.ratings
    .map((r, i) => ({
      candidate: candidates[i],
      score: r.rating,
    }))
    .filter((m) => m.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
