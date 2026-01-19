import { beforeEach, describe, expect, it } from "bun:test";
import {
  calculateConfidenceScore,
  calculateDecayedConfidenceScore,
  clearDecayCache,
  getDecayCacheStats,
} from "../../scoring/factors/confidence";
import { RelevanceScorer } from "../../scoring/scorer";
import type { ConfidenceDecayConfig } from "../../scoring/types";
import {
  DEFAULT_SCORING_CONFIG,
  type ScoringConfig,
} from "../../scoring/types";
import type { Memory } from "../../types";

const SECONDS_PER_DAY = 86400;
const now = 1704067200; // 2024-01-01 00:00:00 UTC

function createTestMemory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: "test-memory-1",
    type: "decision",
    title: "Test Memory",
    content: "Test content",
    importance: 1.0,
    tags: ["test"],
    relatedFiles: [],
    experts: [],
    createdAt: now - 90 * SECONDS_PER_DAY, // 90 days old
    accessedAt: now - 30 * SECONDS_PER_DAY, // Last accessed 30 days ago
    accessCount: 10,
    needsReview: false,
    ...overrides,
  };
}

function createDecayConfig(
  overrides: Partial<ConfidenceDecayConfig> = {},
): ConfidenceDecayConfig {
  return {
    enabled: true,
    decay: { type: "exponential", halfLifeDays: 90 },
    floor: 0.1,
    refreshOnAccess: true,
    exemptTypes: ["architecture"],
    exemptTags: ["pinned"],
    ...overrides,
  };
}

describe("calculateConfidenceScore (basic)", () => {
  it("should return importance value directly", () => {
    expect(calculateConfidenceScore(0.5)).toBe(0.5);
    expect(calculateConfidenceScore(0.0)).toBe(0.0);
    expect(calculateConfidenceScore(1.0)).toBe(1.0);
  });

  it("should clamp values to [0, 1]", () => {
    expect(calculateConfidenceScore(-0.5)).toBe(0);
    expect(calculateConfidenceScore(1.5)).toBe(1);
  });

  it("should handle non-finite values", () => {
    expect(calculateConfidenceScore(NaN)).toBe(0.5);
    expect(calculateConfidenceScore(Infinity)).toBe(0.5);
    expect(calculateConfidenceScore(-Infinity)).toBe(0.5);
  });
});

describe("calculateDecayedConfidenceScore", () => {
  beforeEach(() => {
    clearDecayCache();
  });

  describe("exponential decay", () => {
    it("should return importance when decay is disabled", () => {
      const memory = createTestMemory();
      const config = createDecayConfig({ enabled: false });

      const score = calculateDecayedConfidenceScore(memory, config, now);
      expect(score).toBe(1.0);
    });

    it("should halve confidence at half-life (90 days)", () => {
      const memory = createTestMemory({
        importance: 1.0,
        createdAt: now - 90 * SECONDS_PER_DAY,
        accessedAt: now - 90 * SECONDS_PER_DAY,
      });
      const config = createDecayConfig({
        decay: { type: "exponential", halfLifeDays: 90 },
        refreshOnAccess: false, // Use createdAt as anchor
      });

      const score = calculateDecayedConfidenceScore(memory, config, now);
      expect(score).toBeCloseTo(0.5, 2);
    });

    it("should return importance for new memories (no decay)", () => {
      const memory = createTestMemory({
        importance: 0.8,
        createdAt: now,
        accessedAt: now,
      });
      const config = createDecayConfig();

      const score = calculateDecayedConfidenceScore(memory, config, now);
      expect(score).toBeCloseTo(0.8, 5);
    });

    it("should approach floor for very old memories", () => {
      const memory = createTestMemory({
        importance: 1.0,
        createdAt: now - 365 * SECONDS_PER_DAY, // 1 year old
        accessedAt: now - 365 * SECONDS_PER_DAY,
      });
      const config = createDecayConfig({
        refreshOnAccess: false,
        floor: 0.1,
      });

      const score = calculateDecayedConfidenceScore(memory, config, now);
      expect(score).toBeGreaterThanOrEqual(0.1); // Floor protection
      expect(score).toBeLessThan(0.2); // Should be close to floor
    });
  });

  describe("linear decay", () => {
    it("should reach floor at fullDecayDays", () => {
      const memory = createTestMemory({
        importance: 1.0,
        createdAt: now - 365 * SECONDS_PER_DAY,
        accessedAt: now - 365 * SECONDS_PER_DAY,
      });
      const config = createDecayConfig({
        decay: { type: "linear", fullDecayDays: 365 },
        refreshOnAccess: false,
        floor: 0.1,
      });

      const score = calculateDecayedConfidenceScore(memory, config, now);
      expect(score).toBe(0.1); // At fullDecay, decayFactor = 0, so floor kicks in
    });

    it("should decay linearly to half at halfway point", () => {
      const memory = createTestMemory({
        importance: 1.0,
        createdAt: now - 182 * SECONDS_PER_DAY, // ~half of 365
        accessedAt: now - 182 * SECONDS_PER_DAY,
      });
      const config = createDecayConfig({
        decay: { type: "linear", fullDecayDays: 365 },
        refreshOnAccess: false,
        floor: 0,
      });

      const score = calculateDecayedConfidenceScore(memory, config, now);
      expect(score).toBeCloseTo(0.5, 1);
    });
  });

  describe("step decay", () => {
    const stepConfig = createDecayConfig({
      decay: {
        type: "step",
        thresholds: [
          { days: 30, score: 0.8 },
          { days: 90, score: 0.5 },
          { days: 180, score: 0.2 },
        ],
      },
      refreshOnAccess: false,
      floor: 0.1,
    });

    it("should return full score before first threshold", () => {
      const memory = createTestMemory({
        importance: 1.0,
        createdAt: now - 15 * SECONDS_PER_DAY,
        accessedAt: now - 15 * SECONDS_PER_DAY,
      });

      const score = calculateDecayedConfidenceScore(memory, stepConfig, now);
      expect(score).toBe(1.0);
    });

    it("should return threshold score at boundary", () => {
      const memory = createTestMemory({
        importance: 1.0,
        createdAt: now - 30 * SECONDS_PER_DAY,
        accessedAt: now - 30 * SECONDS_PER_DAY,
      });

      const score = calculateDecayedConfidenceScore(memory, stepConfig, now);
      expect(score).toBe(0.8);
    });

    it("should return threshold score between thresholds", () => {
      const memory = createTestMemory({
        importance: 1.0,
        createdAt: now - 60 * SECONDS_PER_DAY, // Between 30 and 90
        accessedAt: now - 60 * SECONDS_PER_DAY,
      });

      const score = calculateDecayedConfidenceScore(memory, stepConfig, now);
      expect(score).toBe(0.8); // Still at 30-day threshold
    });

    it("should return final threshold score after last threshold", () => {
      const memory = createTestMemory({
        importance: 1.0,
        createdAt: now - 200 * SECONDS_PER_DAY,
        accessedAt: now - 200 * SECONDS_PER_DAY,
      });

      const score = calculateDecayedConfidenceScore(memory, stepConfig, now);
      expect(score).toBe(0.2); // At 180-day threshold
    });
  });

  describe("floor protection", () => {
    it("should never return below floor", () => {
      const memory = createTestMemory({
        importance: 1.0,
        createdAt: now - 1000 * SECONDS_PER_DAY, // Very old
        accessedAt: now - 1000 * SECONDS_PER_DAY,
      });
      const config = createDecayConfig({
        refreshOnAccess: false,
        floor: 0.15,
      });

      const score = calculateDecayedConfidenceScore(memory, config, now);
      expect(score).toBe(0.15);
    });

    it("should return importance when floor > importance (floor doesn't inflate)", () => {
      const memory = createTestMemory({
        importance: 0.05, // Lower than floor
        createdAt: now - 90 * SECONDS_PER_DAY,
        accessedAt: now - 90 * SECONDS_PER_DAY,
      });
      const config = createDecayConfig({
        refreshOnAccess: false,
        floor: 0.1,
      });

      const score = calculateDecayedConfidenceScore(memory, config, now);
      expect(score).toBeLessThanOrEqual(0.05); // Should not exceed importance
    });
  });

  describe("exemptions", () => {
    it("should not decay architecture type memories", () => {
      const memory = createTestMemory({
        type: "architecture",
        importance: 1.0,
        createdAt: now - 365 * SECONDS_PER_DAY,
        accessedAt: now - 365 * SECONDS_PER_DAY,
      });
      const config = createDecayConfig({
        exemptTypes: ["architecture"],
        refreshOnAccess: false,
      });

      const score = calculateDecayedConfidenceScore(memory, config, now);
      expect(score).toBe(1.0);
    });

    it("should not decay memories with pinned tag", () => {
      const memory = createTestMemory({
        tags: ["pinned", "important"],
        importance: 1.0,
        createdAt: now - 365 * SECONDS_PER_DAY,
        accessedAt: now - 365 * SECONDS_PER_DAY,
      });
      const config = createDecayConfig({
        exemptTags: ["pinned"],
        refreshOnAccess: false,
      });

      const score = calculateDecayedConfidenceScore(memory, config, now);
      expect(score).toBe(1.0);
    });

    it("should not decay memories with decayRate = 0 (pinned)", () => {
      const memory = createTestMemory({
        decayRate: 0,
        importance: 1.0,
        createdAt: now - 365 * SECONDS_PER_DAY,
        accessedAt: now - 365 * SECONDS_PER_DAY,
      });
      const config = createDecayConfig({
        refreshOnAccess: false,
      });

      const score = calculateDecayedConfidenceScore(memory, config, now);
      expect(score).toBe(1.0);
    });

    it("should not decay memories with decayFunction = none", () => {
      const memory = createTestMemory({
        decayFunction: "none",
        importance: 1.0,
        createdAt: now - 365 * SECONDS_PER_DAY,
        accessedAt: now - 365 * SECONDS_PER_DAY,
      });
      const config = createDecayConfig({
        refreshOnAccess: false,
      });

      const score = calculateDecayedConfidenceScore(memory, config, now);
      expect(score).toBe(1.0);
    });

    it("should be case-insensitive for tag exemptions", () => {
      const memory = createTestMemory({
        tags: ["PINNED"], // Uppercase
        importance: 1.0,
        createdAt: now - 365 * SECONDS_PER_DAY,
        accessedAt: now - 365 * SECONDS_PER_DAY,
      });
      const config = createDecayConfig({
        exemptTags: ["pinned"], // Lowercase
        refreshOnAccess: false,
      });

      const score = calculateDecayedConfidenceScore(memory, config, now);
      expect(score).toBe(1.0);
    });
  });

  describe("anchor timestamp selection", () => {
    it("should use lastRefreshedAt when set", () => {
      const memory = createTestMemory({
        importance: 1.0,
        createdAt: now - 365 * SECONDS_PER_DAY, // Very old
        accessedAt: now - 365 * SECONDS_PER_DAY,
        lastRefreshedAt: now, // Just refreshed
      });
      const config = createDecayConfig();

      const score = calculateDecayedConfidenceScore(memory, config, now);
      expect(score).toBe(1.0); // No decay because just refreshed
    });

    it("should use accessedAt when refreshOnAccess is true", () => {
      const memory = createTestMemory({
        importance: 1.0,
        createdAt: now - 365 * SECONDS_PER_DAY,
        accessedAt: now - 30 * SECONDS_PER_DAY, // Accessed 30 days ago
      });
      const config = createDecayConfig({
        refreshOnAccess: true,
        decay: { type: "exponential", halfLifeDays: 90 },
      });

      const score = calculateDecayedConfidenceScore(memory, config, now);
      // Should decay from 30 days, not 365 days
      expect(score).toBeGreaterThan(0.7);
    });

    it("should use createdAt when refreshOnAccess is false", () => {
      const memory = createTestMemory({
        importance: 1.0,
        createdAt: now - 90 * SECONDS_PER_DAY,
        accessedAt: now, // Just accessed
      });
      const config = createDecayConfig({
        refreshOnAccess: false,
        decay: { type: "exponential", halfLifeDays: 90 },
      });

      const score = calculateDecayedConfidenceScore(memory, config, now);
      // Should decay from 90 days (createdAt), not 0 days (accessedAt)
      expect(score).toBeCloseTo(0.5, 2);
    });
  });

  describe("per-memory rate multiplier", () => {
    it("should decay faster with decayRate > 1", () => {
      const memoryNormal = createTestMemory({
        importance: 1.0,
        createdAt: now - 45 * SECONDS_PER_DAY,
        accessedAt: now - 45 * SECONDS_PER_DAY,
      });
      const memoryFast = createTestMemory({
        id: "fast-decay",
        importance: 1.0,
        decayRate: 2, // Decay twice as fast
        createdAt: now - 45 * SECONDS_PER_DAY,
        accessedAt: now - 45 * SECONDS_PER_DAY,
      });
      const config = createDecayConfig({
        refreshOnAccess: false,
        decay: { type: "exponential", halfLifeDays: 90 },
      });

      const scoreNormal = calculateDecayedConfidenceScore(
        memoryNormal,
        config,
        now,
      );
      const scoreFast = calculateDecayedConfidenceScore(
        memoryFast,
        config,
        now,
      );

      // Fast decay should have half the effective half-life
      expect(scoreFast).toBeLessThan(scoreNormal);
      expect(scoreFast).toBeCloseTo(0.5, 2); // 45 days at rate 2 = 90 days effective
    });

    it("should decay slower with decayRate < 1", () => {
      const memory = createTestMemory({
        importance: 1.0,
        decayRate: 0.5, // Decay half as fast
        createdAt: now - 90 * SECONDS_PER_DAY,
        accessedAt: now - 90 * SECONDS_PER_DAY,
      });
      const config = createDecayConfig({
        refreshOnAccess: false,
        decay: { type: "exponential", halfLifeDays: 90 },
      });

      const score = calculateDecayedConfidenceScore(memory, config, now);
      // With rate 0.5, effective half-life is 180 days, so 90 days = ~0.707
      expect(score).toBeGreaterThan(0.7);
    });
  });

  describe("edge cases", () => {
    it("should return importance for future lastRefreshedAt", () => {
      const memory = createTestMemory({
        importance: 0.8,
        lastRefreshedAt: now + 1000, // Future timestamp
      });
      const config = createDecayConfig();

      const score = calculateDecayedConfidenceScore(memory, config, now);
      expect(score).toBe(0.8);
    });

    it("should handle accessedAt > createdAt for anchor", () => {
      const memory = createTestMemory({
        importance: 1.0,
        createdAt: now - 100 * SECONDS_PER_DAY,
        accessedAt: now - 10 * SECONDS_PER_DAY, // More recent
      });
      const config = createDecayConfig({
        refreshOnAccess: true,
      });

      const score = calculateDecayedConfidenceScore(memory, config, now);
      // Should use accessedAt (10 days), not createdAt (100 days)
      expect(score).toBeGreaterThan(0.9);
    });
  });

  describe("caching", () => {
    it("should cache results", () => {
      clearDecayCache();

      const memory = createTestMemory();
      const config = createDecayConfig();

      // First call
      calculateDecayedConfidenceScore(memory, config, now);
      const stats1 = getDecayCacheStats();
      expect(stats1.size).toBe(1);

      // Second call with same memory - should hit cache
      calculateDecayedConfidenceScore(memory, config, now);
      const stats2 = getDecayCacheStats();
      expect(stats2.size).toBe(1); // Still 1, not 2
    });

    it("should create different cache entries for different memories", () => {
      clearDecayCache();

      const memory1 = createTestMemory({ id: "mem-1" });
      const memory2 = createTestMemory({ id: "mem-2" });
      const config = createDecayConfig();

      calculateDecayedConfidenceScore(memory1, config, now);
      calculateDecayedConfidenceScore(memory2, config, now);

      const stats = getDecayCacheStats();
      expect(stats.size).toBe(2);
    });
  });
});

describe("RelevanceScorer with confidence decay", () => {
  beforeEach(() => {
    clearDecayCache();
  });

  it("should use decayed confidence when enabled", () => {
    const config: ScoringConfig = {
      ...DEFAULT_SCORING_CONFIG,
      confidenceDecay: {
        enabled: true,
        decay: { type: "exponential", halfLifeDays: 90 },
        floor: 0.1,
        refreshOnAccess: false,
        exemptTypes: [],
        exemptTags: [],
      },
    };

    const scorer = new RelevanceScorer(config);
    const memory = createTestMemory({
      importance: 1.0,
      createdAt: now - 90 * SECONDS_PER_DAY,
      accessedAt: now - 90 * SECONDS_PER_DAY,
    });

    const result = scorer.score(memory, 0.9, now);

    // Confidence should be decayed to ~0.5 at half-life
    expect(result.breakdown?.confidence).toBeCloseTo(0.5, 1);
  });

  it("should use raw importance when decay is disabled", () => {
    const config: ScoringConfig = {
      ...DEFAULT_SCORING_CONFIG,
      confidenceDecay: {
        enabled: false,
        decay: { type: "exponential", halfLifeDays: 90 },
        floor: 0.1,
        refreshOnAccess: false,
        exemptTypes: [],
        exemptTags: [],
      },
    };

    const scorer = new RelevanceScorer(config);
    const memory = createTestMemory({
      importance: 1.0,
      createdAt: now - 90 * SECONDS_PER_DAY,
      accessedAt: now - 90 * SECONDS_PER_DAY,
    });

    const result = scorer.score(memory, 0.9, now);

    // Confidence should be raw importance (1.0)
    expect(result.breakdown?.confidence).toBe(1.0);
  });

  it("should use raw importance when confidenceDecay is not configured", () => {
    const scorer = new RelevanceScorer(DEFAULT_SCORING_CONFIG);
    const memory = createTestMemory({
      importance: 0.8,
      createdAt: now - 365 * SECONDS_PER_DAY,
    });

    const result = scorer.score(memory, 0.9, now);

    // Should use raw importance, not decayed
    expect(result.breakdown?.confidence).toBe(0.8);
  });
});
