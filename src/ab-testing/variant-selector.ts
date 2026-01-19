/**
 * Variant selector for A/B testing
 *
 * Provides session-consistent and random variant assignment.
 */

import type { Experiment, ExperimentVariant, VariantAssignment } from "./types";

/**
 * Generate a SHA-256 hash of a string and return as hex.
 */
async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Hash a string to a bucket number (0-99).
 * Uses SHA-256 for uniform distribution.
 */
async function hashToBucket(input: string): Promise<number> {
  const hashHex = await sha256(input);
  // Use first 8 hex chars (32 bits) for the bucket
  const hashInt = parseInt(hashHex.slice(0, 8), 16);
  return hashInt % 100;
}

/**
 * Select a variant deterministically based on session ID.
 * Same session ID will always get the same variant.
 *
 * @param sessionId - Unique session or user identifier
 * @param experiment - The experiment to select from
 * @returns The selected variant
 */
export async function selectVariantDeterministic(
  sessionId: string,
  experiment: Experiment,
): Promise<ExperimentVariant> {
  // Combine session ID with experiment ID for isolation
  const hashInput = `${sessionId}:${experiment.id}`;
  const bucket = await hashToBucket(hashInput);

  return selectVariantByBucket(bucket, experiment.variants);
}

/**
 * Select a variant randomly.
 * Uses Math.random() for true randomness (no session consistency).
 *
 * @param experiment - The experiment to select from
 * @returns The selected variant
 */
export function selectVariantRandom(experiment: Experiment): ExperimentVariant {
  const bucket = Math.floor(Math.random() * 100);
  return selectVariantByBucket(bucket, experiment.variants);
}

/**
 * Select a variant based on a bucket number (0-99).
 * Uses cumulative weights to distribute traffic.
 *
 * @param bucket - Bucket number (0-99)
 * @param variants - Available variants
 * @returns The selected variant
 */
function selectVariantByBucket(
  bucket: number,
  variants: ExperimentVariant[],
): ExperimentVariant {
  // Normalize weights to sum to 1
  const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);
  const normalizedVariants = variants.map((v) => ({
    ...v,
    normalizedWeight:
      totalWeight > 0 ? v.weight / totalWeight : 1 / variants.length,
  }));

  // Find variant by cumulative weight
  let cumulative = 0;
  for (const variant of normalizedVariants) {
    cumulative += variant.normalizedWeight * 100;
    if (bucket < cumulative) {
      return variant;
    }
  }

  // Fallback to last variant (shouldn't happen with proper weights)
  return variants[variants.length - 1];
}

/**
 * Select variant for a request.
 *
 * @param sessionId - Session or query identifier
 * @param experiment - The experiment configuration
 * @returns Variant assignment with scoring config
 */
export async function assignVariant(
  sessionId: string,
  experiment: Experiment,
): Promise<VariantAssignment> {
  const variant =
    experiment.assignmentStrategy === "deterministic"
      ? await selectVariantDeterministic(sessionId, experiment)
      : selectVariantRandom(experiment);

  return {
    experimentId: experiment.id,
    variantId: variant.id,
    scoringConfig: variant.scoringConfig,
    assignmentType: experiment.assignmentStrategy,
  };
}

/**
 * Generate a session hash for anonymized tracking.
 * Uses first 16 chars of SHA-256 hash.
 *
 * @param sessionId - The session identifier to hash
 * @returns Truncated hash for storage
 */
export async function generateSessionHash(sessionId: string): Promise<string> {
  const fullHash = await sha256(sessionId);
  return fullHash.slice(0, 16);
}
