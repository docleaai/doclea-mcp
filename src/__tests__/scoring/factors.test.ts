import { describe, expect, it } from "bun:test";
import {
  calculateConfidenceScore,
  calculateFrequencyScore,
  calculateRecencyScore,
  calculateSemanticScore,
} from "../../scoring/factors";
import type { FrequencyNormalization, RecencyDecay } from "../../scoring/types";

describe("calculateSemanticScore", () => {
  it("should pass through valid scores", () => {
    expect(calculateSemanticScore(0.5)).toBe(0.5);
    expect(calculateSemanticScore(0)).toBe(0);
    expect(calculateSemanticScore(1)).toBe(1);
  });

  it("should clamp negative scores to 0", () => {
    expect(calculateSemanticScore(-0.5)).toBe(0);
    expect(calculateSemanticScore(-1)).toBe(0);
  });

  it("should clamp scores above 1 to 1", () => {
    expect(calculateSemanticScore(1.5)).toBe(1);
    expect(calculateSemanticScore(2)).toBe(1);
  });

  it("should handle edge cases", () => {
    expect(calculateSemanticScore(NaN)).toBe(0);
    expect(calculateSemanticScore(Infinity)).toBe(0);
    expect(calculateSemanticScore(-Infinity)).toBe(0);
  });
});

describe("calculateRecencyScore", () => {
  const SECONDS_PER_DAY = 86400;
  const now = 1704067200; // 2024-01-01 00:00:00 UTC

  describe("exponential decay", () => {
    const config: RecencyDecay = { type: "exponential", halfLifeDays: 30 };

    it("should return 1.0 for brand new memories", () => {
      const score = calculateRecencyScore(now, now, config, now);
      expect(score).toBeCloseTo(1.0, 5);
    });

    it("should return ~0.5 after half-life", () => {
      const thirtyDaysAgo = now - 30 * SECONDS_PER_DAY;
      const score = calculateRecencyScore(
        thirtyDaysAgo,
        thirtyDaysAgo,
        config,
        now,
      );
      expect(score).toBeCloseTo(0.5, 2);
    });

    it("should return ~0.25 after two half-lives", () => {
      const sixtyDaysAgo = now - 60 * SECONDS_PER_DAY;
      const score = calculateRecencyScore(
        sixtyDaysAgo,
        sixtyDaysAgo,
        config,
        now,
      );
      expect(score).toBeCloseTo(0.25, 2);
    });

    it("should use the more recent of createdAt and accessedAt", () => {
      const oldCreated = now - 60 * SECONDS_PER_DAY;
      const recentAccess = now - 1 * SECONDS_PER_DAY;
      const score = calculateRecencyScore(
        oldCreated,
        recentAccess,
        config,
        now,
      );
      expect(score).toBeGreaterThan(0.9);
    });
  });

  describe("linear decay", () => {
    const config: RecencyDecay = { type: "linear", fullDecayDays: 365 };

    it("should return 1.0 for brand new memories", () => {
      const score = calculateRecencyScore(now, now, config, now);
      expect(score).toBeCloseTo(1.0, 5);
    });

    it("should return 0.5 at half the decay period", () => {
      const halfYearAgo = now - 182.5 * SECONDS_PER_DAY;
      const score = calculateRecencyScore(
        halfYearAgo,
        halfYearAgo,
        config,
        now,
      );
      expect(score).toBeCloseTo(0.5, 2);
    });

    it("should return 0 at or after full decay", () => {
      const yearAgo = now - 365 * SECONDS_PER_DAY;
      const score = calculateRecencyScore(yearAgo, yearAgo, config, now);
      expect(score).toBe(0);
    });
  });

  describe("step decay", () => {
    const config: RecencyDecay = {
      type: "step",
      thresholds: [
        { days: 7, score: 0.9 },
        { days: 30, score: 0.7 },
        { days: 90, score: 0.4 },
        { days: 365, score: 0.1 },
      ],
    };

    it("should return 1.0 for memories newer than first threshold", () => {
      const twoDaysAgo = now - 2 * SECONDS_PER_DAY;
      const score = calculateRecencyScore(twoDaysAgo, twoDaysAgo, config, now);
      expect(score).toBe(1);
    });

    it("should return threshold score when age exceeds threshold", () => {
      const tenDaysAgo = now - 10 * SECONDS_PER_DAY;
      const score = calculateRecencyScore(tenDaysAgo, tenDaysAgo, config, now);
      expect(score).toBe(0.9);
    });

    it("should return lowest threshold for very old memories", () => {
      const twoYearsAgo = now - 730 * SECONDS_PER_DAY;
      const score = calculateRecencyScore(
        twoYearsAgo,
        twoYearsAgo,
        config,
        now,
      );
      expect(score).toBe(0.1);
    });
  });
});

describe("calculateConfidenceScore", () => {
  it("should pass through valid importance values", () => {
    expect(calculateConfidenceScore(0.5)).toBe(0.5);
    expect(calculateConfidenceScore(0)).toBe(0);
    expect(calculateConfidenceScore(1)).toBe(1);
  });

  it("should clamp values outside [0, 1]", () => {
    expect(calculateConfidenceScore(-0.1)).toBe(0);
    expect(calculateConfidenceScore(1.1)).toBe(1);
  });

  it("should return 0.5 for invalid values", () => {
    expect(calculateConfidenceScore(NaN)).toBe(0.5);
    expect(calculateConfidenceScore(Infinity)).toBe(0.5);
  });
});

describe("calculateFrequencyScore", () => {
  const defaultConfig: FrequencyNormalization = {
    method: "log",
    maxCount: 100,
    coldStartScore: 0.5,
  };

  describe("cold start handling", () => {
    it("should return coldStartScore for 0 access count", () => {
      expect(calculateFrequencyScore(0, defaultConfig)).toBe(0.5);
    });

    it("should return coldStartScore for negative access count", () => {
      expect(calculateFrequencyScore(-1, defaultConfig)).toBe(0.5);
    });

    it("should return coldStartScore for NaN", () => {
      expect(calculateFrequencyScore(NaN, defaultConfig)).toBe(0.5);
    });
  });

  describe("log normalization", () => {
    it("should return value between 0 and 1 for normal counts", () => {
      const score = calculateFrequencyScore(50, defaultConfig);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(1);
    });

    it("should return 1 for maxCount", () => {
      const score = calculateFrequencyScore(100, defaultConfig);
      expect(score).toBeCloseTo(1, 2);
    });

    it("should cap at 1 for counts above maxCount", () => {
      const score = calculateFrequencyScore(200, defaultConfig);
      expect(score).toBe(1);
    });
  });

  describe("linear normalization", () => {
    const linearConfig: FrequencyNormalization = {
      method: "linear",
      maxCount: 100,
      coldStartScore: 0.5,
    };

    it("should return 0.5 for half maxCount", () => {
      const score = calculateFrequencyScore(50, linearConfig);
      expect(score).toBe(0.5);
    });

    it("should return 1 for maxCount", () => {
      const score = calculateFrequencyScore(100, linearConfig);
      expect(score).toBe(1);
    });
  });

  describe("sigmoid normalization", () => {
    const sigmoidConfig: FrequencyNormalization = {
      method: "sigmoid",
      maxCount: 100,
      coldStartScore: 0.5,
    };

    it("should return value around 0.5 for half maxCount", () => {
      const score = calculateFrequencyScore(50, sigmoidConfig);
      expect(score).toBeGreaterThan(0.4);
      expect(score).toBeLessThan(0.6);
    });

    it("should return close to 1 for maxCount", () => {
      const score = calculateFrequencyScore(100, sigmoidConfig);
      expect(score).toBeGreaterThan(0.9);
    });
  });
});
