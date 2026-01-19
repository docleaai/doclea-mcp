import { describe, expect, it } from "bun:test";
import { applyBoosts, evaluateBoostRules } from "../../scoring/boost-rules";
import type { BoostRule } from "../../scoring/types";
import type { AppliedBoost, Memory } from "../../types";

const SECONDS_PER_DAY = 86400;
const now = 1704067200; // 2024-01-01 00:00:00 UTC

function createTestMemory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: "test-memory-1",
    type: "decision",
    title: "Test Memory",
    content: "Test content",
    importance: 0.5,
    tags: ["test", "example"],
    relatedFiles: ["/path/to/file.ts"],
    experts: [],
    createdAt: now - 7 * SECONDS_PER_DAY,
    accessedAt: now - 1 * SECONDS_PER_DAY,
    accessCount: 10,
    needsReview: false,
    ...overrides,
  };
}

describe("evaluateBoostRules", () => {
  describe("recency condition", () => {
    const rule: BoostRule = {
      name: "recent-boost",
      condition: { type: "recency", maxDays: 7 },
      factor: 1.2,
    };

    it("should match when memory is recent enough", () => {
      const memory = createTestMemory({
        accessedAt: now - 3 * SECONDS_PER_DAY,
      });
      const boosts = evaluateBoostRules(memory, [rule], now);
      expect(boosts.length).toBe(1);
      expect(boosts[0].name).toBe("recent-boost");
      expect(boosts[0].factor).toBe(1.2);
    });

    it("should not match when memory is too old", () => {
      const memory = createTestMemory({
        accessedAt: now - 10 * SECONDS_PER_DAY,
        createdAt: now - 20 * SECONDS_PER_DAY,
      });
      const boosts = evaluateBoostRules(memory, [rule], now);
      expect(boosts.length).toBe(0);
    });
  });

  describe("importance condition", () => {
    const rule: BoostRule = {
      name: "high-importance",
      condition: { type: "importance", minValue: 0.8 },
      factor: 1.3,
    };

    it("should match when importance meets threshold", () => {
      const memory = createTestMemory({ importance: 0.9 });
      const boosts = evaluateBoostRules(memory, [rule], now);
      expect(boosts.length).toBe(1);
    });

    it("should not match when importance is below threshold", () => {
      const memory = createTestMemory({ importance: 0.5 });
      const boosts = evaluateBoostRules(memory, [rule], now);
      expect(boosts.length).toBe(0);
    });
  });

  describe("frequency condition", () => {
    const rule: BoostRule = {
      name: "popular",
      condition: { type: "frequency", minAccessCount: 50 },
      factor: 1.15,
    };

    it("should match when access count meets threshold", () => {
      const memory = createTestMemory({ accessCount: 100 });
      const boosts = evaluateBoostRules(memory, [rule], now);
      expect(boosts.length).toBe(1);
    });

    it("should not match when access count is below threshold", () => {
      const memory = createTestMemory({ accessCount: 10 });
      const boosts = evaluateBoostRules(memory, [rule], now);
      expect(boosts.length).toBe(0);
    });
  });

  describe("staleness condition", () => {
    const rule: BoostRule = {
      name: "stale-penalty",
      condition: { type: "staleness", minDays: 180 },
      factor: 0.8,
    };

    it("should match when memory is stale", () => {
      const memory = createTestMemory({
        createdAt: now - 200 * SECONDS_PER_DAY,
        accessedAt: now - 200 * SECONDS_PER_DAY,
      });
      const boosts = evaluateBoostRules(memory, [rule], now);
      expect(boosts.length).toBe(1);
      expect(boosts[0].factor).toBe(0.8);
    });

    it("should not match when memory is recent", () => {
      const memory = createTestMemory({
        accessedAt: now - 30 * SECONDS_PER_DAY,
      });
      const boosts = evaluateBoostRules(memory, [rule], now);
      expect(boosts.length).toBe(0);
    });
  });

  describe("memoryType condition", () => {
    const rule: BoostRule = {
      name: "architecture-boost",
      condition: { type: "memoryType", types: ["architecture", "pattern"] },
      factor: 1.25,
    };

    it("should match when memory type is in list", () => {
      const memory = createTestMemory({ type: "architecture" });
      const boosts = evaluateBoostRules(memory, [rule], now);
      expect(boosts.length).toBe(1);
    });

    it("should not match when memory type is not in list", () => {
      const memory = createTestMemory({ type: "note" });
      const boosts = evaluateBoostRules(memory, [rule], now);
      expect(boosts.length).toBe(0);
    });
  });

  describe("tags condition", () => {
    describe("any match", () => {
      const rule: BoostRule = {
        name: "important-tags",
        condition: {
          type: "tags",
          tags: ["important", "critical"],
          match: "any",
        },
        factor: 1.1,
      };

      it("should match when any tag matches", () => {
        const memory = createTestMemory({ tags: ["test", "important"] });
        const boosts = evaluateBoostRules(memory, [rule], now);
        expect(boosts.length).toBe(1);
      });

      it("should not match when no tags match", () => {
        const memory = createTestMemory({ tags: ["test", "example"] });
        const boosts = evaluateBoostRules(memory, [rule], now);
        expect(boosts.length).toBe(0);
      });
    });

    describe("all match", () => {
      const rule: BoostRule = {
        name: "all-tags",
        condition: { type: "tags", tags: ["test", "example"], match: "all" },
        factor: 1.2,
      };

      it("should match when all tags match", () => {
        const memory = createTestMemory({ tags: ["test", "example", "extra"] });
        const boosts = evaluateBoostRules(memory, [rule], now);
        expect(boosts.length).toBe(1);
      });

      it("should not match when only some tags match", () => {
        const memory = createTestMemory({ tags: ["test"] });
        const boosts = evaluateBoostRules(memory, [rule], now);
        expect(boosts.length).toBe(0);
      });
    });
  });

  describe("multiple rules", () => {
    const rules: BoostRule[] = [
      {
        name: "recent-boost",
        condition: { type: "recency", maxDays: 7 },
        factor: 1.2,
      },
      {
        name: "high-importance",
        condition: { type: "importance", minValue: 0.8 },
        factor: 1.3,
      },
    ];

    it("should evaluate all rules and return matching ones", () => {
      const memory = createTestMemory({
        accessedAt: now - 1 * SECONDS_PER_DAY,
        importance: 0.9,
      });
      const boosts = evaluateBoostRules(memory, rules, now);
      expect(boosts.length).toBe(2);
    });

    it("should return empty array when no rules match", () => {
      const memory = createTestMemory({
        accessedAt: now - 30 * SECONDS_PER_DAY,
        createdAt: now - 30 * SECONDS_PER_DAY,
        importance: 0.3,
      });
      const boosts = evaluateBoostRules(memory, rules, now);
      expect(boosts.length).toBe(0);
    });
  });
});

describe("applyBoosts", () => {
  it("should return base score when no boosts", () => {
    expect(applyBoosts(0.5, [])).toBe(0.5);
  });

  it("should multiply single boost", () => {
    const boosts: AppliedBoost[] = [
      { name: "test", factor: 1.2, reason: "test" },
    ];
    expect(applyBoosts(0.5, boosts)).toBeCloseTo(0.6, 5);
  });

  it("should multiply multiple boosts", () => {
    const boosts: AppliedBoost[] = [
      { name: "boost1", factor: 1.2, reason: "test" },
      { name: "boost2", factor: 1.1, reason: "test" },
    ];
    expect(applyBoosts(0.5, boosts)).toBeCloseTo(0.66, 2);
  });

  it("should cap score at 2", () => {
    const boosts: AppliedBoost[] = [
      { name: "huge-boost", factor: 5, reason: "test" },
    ];
    expect(applyBoosts(0.5, boosts)).toBe(2);
  });

  it("should not go below 0", () => {
    const boosts: AppliedBoost[] = [
      { name: "huge-penalty", factor: 0.001, reason: "test" },
    ];
    expect(applyBoosts(0.5, boosts)).toBeGreaterThanOrEqual(0);
  });
});
