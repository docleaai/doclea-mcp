import { describe, expect, it } from "bun:test";
import { createEmptyBreakdown, RelevanceScorer } from "../../scoring/scorer";
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
    importance: 0.5,
    tags: ["test"],
    relatedFiles: [],
    experts: [],
    createdAt: now - 7 * SECONDS_PER_DAY,
    accessedAt: now - 1 * SECONDS_PER_DAY,
    accessCount: 10,
    needsReview: false,
    ...overrides,
  };
}

describe("RelevanceScorer", () => {
  describe("weight normalization", () => {
    it("should use weights as-is when they sum to 1", () => {
      const scorer = new RelevanceScorer(DEFAULT_SCORING_CONFIG);
      const weights = scorer.getWeights();
      expect(
        weights.semantic +
          weights.recency +
          weights.confidence +
          weights.frequency,
      ).toBeCloseTo(1, 5);
    });

    it("should normalize weights when they don't sum to 1", () => {
      const config: ScoringConfig = {
        ...DEFAULT_SCORING_CONFIG,
        weights: {
          semantic: 1,
          recency: 1,
          confidence: 1,
          frequency: 1,
        },
      };
      const scorer = new RelevanceScorer(config);
      const weights = scorer.getWeights();
      expect(weights.semantic).toBeCloseTo(0.25, 5);
      expect(weights.recency).toBeCloseTo(0.25, 5);
      expect(weights.confidence).toBeCloseTo(0.25, 5);
      expect(weights.frequency).toBeCloseTo(0.25, 5);
    });

    it("should use equal weights when all are 0", () => {
      const config: ScoringConfig = {
        ...DEFAULT_SCORING_CONFIG,
        weights: {
          semantic: 0,
          recency: 0,
          confidence: 0,
          frequency: 0,
        },
      };
      const scorer = new RelevanceScorer(config);
      const weights = scorer.getWeights();
      expect(weights.semantic).toBe(0.25);
    });
  });

  describe("score", () => {
    const scorer = new RelevanceScorer(DEFAULT_SCORING_CONFIG);

    it("should return score breakdown", () => {
      const memory = createTestMemory();
      const result = scorer.score(memory, 0.9, now);

      expect(result.memory).toBe(memory);
      expect(result.score).toBeGreaterThan(0);
      expect(result.score).toBeLessThanOrEqual(2);
      expect(result.breakdown).toBeDefined();
    });

    it("should include all factor scores in breakdown", () => {
      const memory = createTestMemory();
      const result = scorer.score(memory, 0.9, now);

      expect(result.breakdown?.semantic).toBeCloseTo(0.9, 5);
      expect(result.breakdown?.recency).toBeGreaterThan(0);
      expect(result.breakdown?.confidence).toBe(0.5);
      expect(result.breakdown?.frequency).toBeGreaterThan(0);
    });

    it("should apply boost rules", () => {
      const config: ScoringConfig = {
        ...DEFAULT_SCORING_CONFIG,
        boostRules: [
          {
            name: "recent-boost",
            condition: { type: "recency", maxDays: 7 },
            factor: 1.2,
          },
        ],
      };
      const scorer = new RelevanceScorer(config);
      const memory = createTestMemory({
        accessedAt: now - 1 * SECONDS_PER_DAY,
      });
      const result = scorer.score(memory, 0.9, now);

      expect(result.breakdown?.boosts.length).toBe(1);
      expect(result.breakdown?.finalScore).toBeGreaterThan(
        result.breakdown?.rawScore ?? 0,
      );
    });
  });

  describe("scoreMany", () => {
    it("should score and sort results by final score", () => {
      const scorer = new RelevanceScorer(DEFAULT_SCORING_CONFIG);
      const results = [
        { memory: createTestMemory({ id: "1", importance: 0.3 }), score: 0.5 },
        { memory: createTestMemory({ id: "2", importance: 0.9 }), score: 0.8 },
        { memory: createTestMemory({ id: "3", importance: 0.5 }), score: 0.6 },
      ];

      const scored = scorer.scoreMany(results, now);

      // Should be sorted by final score descending
      expect(scored.length).toBe(3);
      expect(scored[0].score).toBeGreaterThanOrEqual(scored[1].score);
      expect(scored[1].score).toBeGreaterThanOrEqual(scored[2].score);
    });

    it("should handle empty results", () => {
      const scorer = new RelevanceScorer(DEFAULT_SCORING_CONFIG);
      const scored = scorer.scoreMany([], now);
      expect(scored).toEqual([]);
    });
  });

  describe("cold start handling", () => {
    it("should give neutral frequency score to new memories", () => {
      const scorer = new RelevanceScorer(DEFAULT_SCORING_CONFIG);
      const memory = createTestMemory({ accessCount: 0 });
      const result = scorer.score(memory, 0.9, now);

      expect(result.breakdown?.frequency).toBe(0.5);
    });
  });
});

describe("createEmptyBreakdown", () => {
  it("should create breakdown with semantic as the only factor", () => {
    const breakdown = createEmptyBreakdown(0.8);

    expect(breakdown.semantic).toBe(0.8);
    expect(breakdown.weights.semantic).toBe(1);
    expect(breakdown.weights.recency).toBe(0);
    expect(breakdown.weights.confidence).toBe(0);
    expect(breakdown.weights.frequency).toBe(0);
    expect(breakdown.rawScore).toBe(0.8);
    expect(breakdown.finalScore).toBe(0.8);
    expect(breakdown.boosts).toEqual([]);
  });
});
