/**
 * Confidence scoring factor
 *
 * Maps the memory importance field directly to confidence score.
 * Importance is already in [0, 1] range.
 *
 * Optionally applies time-based decay to confidence scores.
 */

import { differenceInSeconds } from "date-fns";
import type { Memory } from "@/types";
import type { ConfidenceDecayConfig, ConfidenceDecaySettings } from "../types";

const SECONDS_PER_DAY = 86400;

/**
 * In-memory cache for decay calculations with 60s TTL.
 * Key format: `${memoryId}:${anchorTimestamp}`
 */
interface CacheEntry {
  value: number;
  expires: number;
}
const decayCache = new Map<string, CacheEntry>();

/**
 * Cache TTL in milliseconds (60 seconds)
 */
const CACHE_TTL_MS = 60_000;

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

/**
 * Calculate decayed confidence score for a memory.
 * Applies time-based decay to the importance value.
 *
 * @param memory - Memory to calculate decay for
 * @param decayConfig - Decay configuration (global settings)
 * @param now - Current timestamp (Unix seconds) for deterministic testing
 * @returns Decayed confidence score in [0, 1]
 */
export function calculateDecayedConfidenceScore(
  memory: Memory,
  decayConfig: ConfidenceDecayConfig,
  now: number,
): number {
  const importance = calculateConfidenceScore(memory.importance);

  // Check if decay is disabled
  if (!decayConfig.enabled) {
    return importance;
  }

  // Check exemptions
  if (isExemptFromDecay(memory, decayConfig)) {
    return importance;
  }

  // Determine the anchor timestamp for decay calculation
  const anchor = getDecayAnchor(memory, decayConfig);

  // Check cache first
  const cacheKey = `${memory.id}:${anchor}`;
  const cached = decayCache.get(cacheKey);
  const nowMs = Date.now();

  if (cached && cached.expires > nowMs) {
    return cached.value;
  }

  // Calculate age in days using date-fns
  // Convert Unix timestamps (seconds) to Date objects for date-fns
  const nowDate = new Date(now * 1000);
  const anchorDate = new Date(anchor * 1000);
  const ageSeconds = Math.max(0, differenceInSeconds(nowDate, anchorDate));
  const ageDays = ageSeconds / SECONDS_PER_DAY;

  // Handle future timestamps (edge case)
  if (ageDays < 0) {
    return importance;
  }

  // Get effective decay configuration (per-memory overrides global)
  const effectiveDecay = getEffectiveDecaySettings(memory, decayConfig);
  const effectiveFloor = memory.confidenceFloor ?? decayConfig.floor;

  // Calculate decay factor
  const decayFactor = calculateDecayFactor(ageDays, effectiveDecay, memory);

  // Apply decay: importance * decayFactor, but never below floor and never above importance
  // Edge case: if floor > importance, return importance (floor doesn't inflate)
  const decayedScore = importance * decayFactor;
  const result = Math.min(importance, Math.max(effectiveFloor, decayedScore));

  // Cache the result
  decayCache.set(cacheKey, {
    value: result,
    expires: nowMs + CACHE_TTL_MS,
  });

  // Prune old cache entries periodically (every 100 cache writes)
  if (decayCache.size > 1000) {
    pruneCache();
  }

  return result;
}

/**
 * Check if a memory is exempt from decay.
 */
function isExemptFromDecay(
  memory: Memory,
  config: ConfidenceDecayConfig,
): boolean {
  // Per-memory decay_rate = 0 means pinned (no decay)
  if (memory.decayRate === 0) {
    return true;
  }

  // Per-memory decay_function = 'none' means no decay
  if (memory.decayFunction === "none") {
    return true;
  }

  // Check exempt types
  if (config.exemptTypes.includes(memory.type)) {
    return true;
  }

  // Check exempt tags (case-insensitive)
  const lowerTags = memory.tags.map((t) => t.toLowerCase());
  const lowerExemptTags = config.exemptTags.map((t) => t.toLowerCase());
  if (lowerExemptTags.some((t) => lowerTags.includes(t))) {
    return true;
  }

  return false;
}

/**
 * Get the anchor timestamp for decay calculation.
 *
 * Priority:
 * 1. memory.lastRefreshedAt (explicit refresh)
 * 2. memory.accessedAt (if refreshOnAccess is true)
 * 3. memory.createdAt (fallback)
 *
 * IMPORTANT: refreshOnAccess is VIRTUAL ONLY - no DB writes on read.
 * We read accessedAt from DB, NOT update it during decay calculation.
 */
function getDecayAnchor(memory: Memory, config: ConfidenceDecayConfig): number {
  // Explicit refresh timestamp takes priority
  if (memory.lastRefreshedAt != null) {
    return memory.lastRefreshedAt;
  }

  // If refreshOnAccess, use the more recent of accessedAt or createdAt
  if (config.refreshOnAccess) {
    return Math.max(memory.accessedAt, memory.createdAt);
  }

  // Default to createdAt
  return memory.createdAt;
}

/**
 * Get effective decay settings, considering per-memory overrides.
 */
function getEffectiveDecaySettings(
  memory: Memory,
  config: ConfidenceDecayConfig,
): ConfidenceDecaySettings {
  // Per-memory decay function override
  if (memory.decayFunction && memory.decayFunction !== "none") {
    // Create a settings object based on the memory's override
    // We inherit halfLifeDays/fullDecayDays from global config for simplicity
    switch (memory.decayFunction) {
      case "exponential":
        return {
          type: "exponential",
          halfLifeDays:
            config.decay.type === "exponential"
              ? config.decay.halfLifeDays
              : 90, // Default
        };
      case "linear":
        return {
          type: "linear",
          fullDecayDays:
            config.decay.type === "linear" ? config.decay.fullDecayDays : 365,
        };
      case "step":
        return {
          type: "step",
          thresholds:
            config.decay.type === "step"
              ? config.decay.thresholds
              : [
                  { days: 30, score: 0.8 },
                  { days: 90, score: 0.5 },
                  { days: 180, score: 0.2 },
                ],
        };
    }
  }

  return config.decay;
}

/**
 * Calculate the decay factor based on age and decay settings.
 * Returns a value in [0, 1] where 1 = no decay.
 */
function calculateDecayFactor(
  ageDays: number,
  settings: ConfidenceDecaySettings,
  memory: Memory,
): number {
  // Apply per-memory rate multiplier if set
  const rateMultiplier = memory.decayRate ?? 1;

  switch (settings.type) {
    case "exponential": {
      const effectiveHalfLife = settings.halfLifeDays / rateMultiplier;
      if (effectiveHalfLife <= 0) return 0;
      // e^(-t * ln(2) / halfLife) = 0.5^(t / halfLife)
      return Math.exp((-ageDays * Math.LN2) / effectiveHalfLife);
    }
    case "linear": {
      const effectiveFullDecay = settings.fullDecayDays / rateMultiplier;
      if (effectiveFullDecay <= 0) return 0;
      return Math.max(0, 1 - ageDays / effectiveFullDecay);
    }
    case "step": {
      // For step decay, rate multiplier scales the day thresholds
      const scaledThresholds = settings.thresholds.map((t) => ({
        days: t.days / rateMultiplier,
        score: t.score,
      }));
      return calculateStepDecayFactor(ageDays, scaledThresholds);
    }
    case "none":
      return 1; // No decay
    default: {
      // Type exhaustiveness check
      const _exhaustiveCheck: never = settings;
      return 1;
    }
  }
}

/**
 * Step decay: discrete score levels based on age thresholds.
 */
function calculateStepDecayFactor(
  ageDays: number,
  thresholds: Array<{ days: number; score: number }>,
): number {
  if (thresholds.length === 0) return 1;

  // Sort thresholds by days (ascending)
  const sorted = [...thresholds].sort((a, b) => a.days - b.days);

  // If younger than first threshold, return score 1.0 (no decay)
  if (ageDays < sorted[0].days) {
    return 1;
  }

  // Find the applicable threshold
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (ageDays >= sorted[i].days) {
      return sorted[i].score;
    }
  }

  return 1;
}

/**
 * Prune expired entries from the cache.
 */
function pruneCache(): void {
  const now = Date.now();
  for (const [key, entry] of decayCache.entries()) {
    if (entry.expires <= now) {
      decayCache.delete(key);
    }
  }
}

/**
 * Clear the decay cache. Useful for testing.
 */
export function clearDecayCache(): void {
  decayCache.clear();
}

/**
 * Get cache stats for monitoring/debugging.
 */
export function getDecayCacheStats(): { size: number; maxSize: number } {
  return {
    size: decayCache.size,
    maxSize: 1000, // Prune threshold
  };
}
