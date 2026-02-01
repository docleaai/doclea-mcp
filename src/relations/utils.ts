/**
 * Utility functions for relation detection
 */

import { eng, removeStopwords } from "stopword";

/**
 * Technical terms that should be preserved as keywords
 */
const TECHNICAL_PREFIXES = [
  "api",
  "http",
  "https",
  "sql",
  "json",
  "xml",
  "html",
  "css",
  "js",
  "ts",
  "py",
  "go",
  "rust",
  "java",
  "cpp",
  "auth",
  "oauth",
  "jwt",
  "db",
  "env",
  "config",
  "async",
  "sync",
  "crud",
  "rest",
  "graphql",
];

/**
 * Extract meaningful keywords from text
 *
 * Simple implementation that:
 * 1. Normalizes text to lowercase
 * 2. Splits on whitespace and punctuation
 * 3. Filters out stopwords and short words
 * 4. Preserves technical terms
 * 5. Returns unique keywords
 *
 * @param text - The text to extract keywords from
 * @param maxKeywords - Maximum number of keywords to return (default: 20)
 */
export function extractKeywords(text: string, maxKeywords = 20): string[] {
  if (!text || typeof text !== "string") {
    return [];
  }

  // Normalize: lowercase and split on non-word characters
  const words = text
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ") // Replace punctuation with spaces
    .split(/\s+/)
    .filter((word) => word.length > 0);

  // Remove stopwords using the stopword package
  const withoutStopwords = removeStopwords(words, eng);

  // Deduplicate and filter
  const seen = new Set<string>();
  const keywords: string[] = [];

  for (const word of withoutStopwords) {
    // Skip if already seen
    if (seen.has(word)) continue;
    seen.add(word);

    // Skip very short words (unless they're technical prefixes)
    const isTechnical = TECHNICAL_PREFIXES.some(
      (prefix) => word.startsWith(prefix) || word === prefix,
    );
    if (word.length < 3 && !isTechnical) continue;

    // Skip pure numbers
    if (/^\d+$/.test(word)) continue;

    keywords.push(word);

    // Stop if we have enough
    if (keywords.length >= maxKeywords) break;
  }

  return keywords;
}

/**
 * Calculate Jaccard similarity coefficient between two sets
 *
 * Jaccard index = |A ∩ B| / |A ∪ B|
 *
 * @param set1 - First set of strings
 * @param set2 - Second set of strings
 * @returns Similarity score between 0 and 1
 */
export function calculateJaccardSimilarity(
  set1: string[],
  set2: string[],
): number {
  if (set1.length === 0 && set2.length === 0) return 0;
  if (set1.length === 0 || set2.length === 0) return 0;

  const s1 = new Set(set1.map((s) => s.toLowerCase()));
  const s2 = new Set(set2.map((s) => s.toLowerCase()));

  // Calculate intersection
  const intersection = [...s1].filter((x) => s2.has(x)).length;

  // Calculate union
  const union = new Set([...s1, ...s2]).size;

  return union > 0 ? intersection / union : 0;
}

/**
 * Calculate overlap score between keywords and a memory's tags
 *
 * Uses Jaccard similarity with a boost for exact matches
 *
 * @param keywords - Keywords extracted from the source memory
 * @param targetTags - Tags from the target memory
 * @returns Overlap score between 0 and 1
 */
export function calculateOverlapScore(
  keywords: string[],
  targetTags: string[],
): number {
  return calculateJaccardSimilarity(keywords, targetTags);
}

/**
 * Calculate file path overlap score
 *
 * Returns the percentage of source files that appear in target files
 *
 * @param sourceFiles - Files from the source memory
 * @param targetFiles - Files from the target memory
 * @returns Overlap score between 0 and 1
 */
export function calculateFileOverlapScore(
  sourceFiles: string[],
  targetFiles: string[],
): number {
  if (sourceFiles.length === 0 || targetFiles.length === 0) return 0;

  const sourceSet = new Set(sourceFiles);
  const targetSet = new Set(targetFiles);

  const intersection = [...sourceSet].filter((f) => targetSet.has(f)).length;

  // Use the smaller set as the denominator for a more meaningful score
  const minSize = Math.min(sourceSet.size, targetSet.size);

  return minSize > 0 ? intersection / minSize : 0;
}

/**
 * Get shared files between two memories
 *
 * @param sourceFiles - Files from the source memory
 * @param targetFiles - Files from the target memory
 * @returns Array of shared file paths
 */
export function getSharedFiles(
  sourceFiles: string[],
  targetFiles: string[],
): string[] {
  const sourceSet = new Set(sourceFiles);
  return targetFiles.filter((f) => sourceSet.has(f));
}

/**
 * Calculate temporal proximity score
 *
 * Score decreases linearly as time difference increases
 *
 * @param timestamp1 - First timestamp (Unix seconds)
 * @param timestamp2 - Second timestamp (Unix seconds)
 * @param windowDays - Maximum days to consider (default: 7)
 * @returns Score between 0 and 1
 */
export function calculateTemporalScore(
  timestamp1: number,
  timestamp2: number,
  windowDays = 7,
): number {
  const diffMs = Math.abs(timestamp1 - timestamp2) * 1000;
  const windowMs = windowDays * 24 * 60 * 60 * 1000;

  if (diffMs >= windowMs) return 0;

  // Linear decay: closer = higher score
  return 1 - diffMs / windowMs;
}
