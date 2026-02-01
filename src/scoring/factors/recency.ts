/**
 * Recency scoring factor
 *
 * Calculates a time-based decay score based on memory age.
 * Supports exponential, linear, and step decay functions.
 */

import { differenceInSeconds } from "date-fns";
import type { RecencyDecay } from "../types";

const SECONDS_PER_DAY = 86400;

/**
 * Calculate recency score based on memory timestamps.
 * Uses the more recent of createdAt or accessedAt.
 *
 * @param createdAt - Memory creation timestamp (Unix seconds)
 * @param accessedAt - Memory last access timestamp (Unix seconds)
 * @param config - Recency decay configuration
 * @param now - Current timestamp (Unix seconds) - for deterministic testing
 * @returns Score in [0, 1] where 1 = very recent
 */
export function calculateRecencyScore(
  createdAt: number,
  accessedAt: number,
  config: RecencyDecay,
  now: number,
): number {
  // Use the more recent timestamp
  const lastActivity = Math.max(createdAt, accessedAt);
  // Convert Unix timestamps (seconds) to Date objects for date-fns
  const nowDate = new Date(now * 1000);
  const lastActivityDate = new Date(lastActivity * 1000);
  const ageSeconds = Math.max(
    0,
    differenceInSeconds(nowDate, lastActivityDate),
  );
  const ageDays = ageSeconds / SECONDS_PER_DAY;

  switch (config.type) {
    case "exponential":
      return calculateExponentialDecay(ageDays, config.halfLifeDays);
    case "linear":
      return calculateLinearDecay(ageDays, config.fullDecayDays);
    case "step":
      return calculateStepDecay(ageDays, config.thresholds);
    default: {
      // Type exhaustiveness check
      const _exhaustiveCheck: never = config;
      return 0;
    }
  }
}

/**
 * Exponential decay: score = e^(-age / halfLife * ln(2))
 * Score halves every halfLifeDays
 */
function calculateExponentialDecay(
  ageDays: number,
  halfLifeDays: number,
): number {
  if (halfLifeDays <= 0) return 0;
  // e^(-t * ln(2) / halfLife) = 0.5^(t / halfLife)
  return Math.exp((-ageDays * Math.LN2) / halfLifeDays);
}

/**
 * Linear decay: score = 1 - (age / fullDecayDays)
 * Score reaches 0 after fullDecayDays
 */
function calculateLinearDecay(ageDays: number, fullDecayDays: number): number {
  if (fullDecayDays <= 0) return 0;
  return Math.max(0, 1 - ageDays / fullDecayDays);
}

/**
 * Step decay: discrete score levels based on age thresholds
 * Thresholds must be sorted by days ascending
 */
function calculateStepDecay(
  ageDays: number,
  thresholds: Array<{ days: number; score: number }>,
): number {
  if (thresholds.length === 0) return 0;

  // Sort thresholds by days (ascending)
  const sorted = [...thresholds].sort((a, b) => a.days - b.days);

  // If younger than first threshold, return score 1.0
  if (ageDays < sorted[0].days) {
    return 1;
  }

  // Find the applicable threshold
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (ageDays >= sorted[i].days) {
      return sorted[i].score;
    }
  }

  return sorted[0].score;
}
